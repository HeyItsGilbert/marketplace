#requires -Version 7
<#
.SYNOPSIS
    Bootstraps PowerShellEditorServices and bridges it into Claude Code's LSP tool.

.DESCRIPTION
    Cross-platform launcher with two paths:

    Windows:
        Claude Code spawns LSP servers with `child_process.spawn(stdio=["pipe","pipe","pipe"])`.
        PSES + PowerShell + redirected stdio is a known-broken combination on Windows: PowerShell
        wraps the redirected handles in its own buffered host-I/O abstraction, but PSES (a .NET
        module loaded into the pwsh AppDomain) calls Console.OpenStandardOutput() directly,
        bypassing that wrapper. The two views of stdio don't see the same bytes — VS Code's
        PowerShell extension uses named pipes on Windows for exactly this reason.

        Workaround: spawn PSES in a separate pwsh child with -LanguageServicePipeName and bridge
        bytes between Claude Code's stdio and PSES's named pipe via Stream.CopyToAsync.

    Linux / macOS:
        PowerShell's stdio handling on non-Windows doesn't have the host-I/O wrapping issue.
        PSES with -Stdio works directly — same pattern as the Emacs/Vim canonical integration.
        Note: This path has not been end-to-end tested in Claude Code as of v1.1.0; the rationale
        is upstream evidence (PSES test/emacs-simple-test.el is Linux-authored and works there).
        If you discover a problem on Linux/macOS, please file an issue with full debug output.

    Status output goes to stderr only (Claude Code's debug log captures it).

.PARAMETER PsesVersion
    PSES version to use. Defaults to env var CLAUDE_PSES_VERSION, else 4.5.0.

.EXAMPLE
    pwsh -NoLogo -NoProfile -Command "& '${CLAUDE_PLUGIN_ROOT}/scripts/start-pses-lsp.ps1'"
#>
[CmdletBinding()]
param(
    [string]$PsesVersion = $env:CLAUDE_PSES_VERSION
)

$ErrorActionPreference = 'Stop'

$IsWindowsPlatform = $IsWindows -or $env:OS -eq 'Windows_NT'

# CRITICAL (Windows only): grab raw stdio streams BEFORE PowerShell wraps them in cmdlet
# pipeline machinery. On non-Windows we don't need this — pwsh's stdio handling there
# doesn't have the wrapping issue, and PSES itself uses Console.OpenStandardInput/Output().
if ($IsWindowsPlatform) {
    $stdin  = [Console]::OpenStandardInput()
    $stdout = [Console]::OpenStandardOutput()
}

# UTF-8 (no BOM) on stderr — defensive, doesn't affect the bridge but prevents BOM in our
# diagnostic messages from looking like garbage in Claude Code's debug log.
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8NoBom
[Console]::InputEncoding  = $utf8NoBom

if ([string]::IsNullOrWhiteSpace($PsesVersion)) {
    $PsesVersion = '4.5.0'
}

# Hardcoded SHA-256 fallbacks for known-good PSES release zips.
# Used only when the GitHub Releases API is unreachable (network down, rate-limited, etc.).
# Primary trust anchor is the `digest` field on the release asset, fetched live from GitHub.
$FallbackHashes = @{
    '4.5.0' = 'A4E2988328963D4EE6008A68A39484D7DE2F9698ED1EC264A344566FDAA6464E'
}

function Get-PsesExpectedHashFromGitHub {
    <#
    .SYNOPSIS
        Fetches the expected SHA-256 of PowerShellEditorServices.zip from GitHub's Releases API.
    .DESCRIPTION
        GitHub computes and stores SHA-256 digests for every release asset and exposes them
        via the `digest` field at /repos/{owner}/{repo}/releases/tags/{tag}. This is the
        upstream-authoritative hash and the strongest trust anchor available short of a
        signed checksum file or Sigstore attestation (PSES has neither as of v4.5.0).
    .OUTPUTS
        SHA-256 hex string (uppercase, no prefix) on success, $null on any failure.
    #>
    param(
        [Parameter(Mandatory)][string]$Version,
        [string]$AssetName = 'PowerShellEditorServices.zip'
    )
    try {
        $apiUrl = "https://api.github.com/repos/PowerShell/PowerShellEditorServices/releases/tags/v$Version"
        $oldProgress = $ProgressPreference
        $ProgressPreference = 'SilentlyContinue'
        try {
            $resp = Invoke-RestMethod -Uri $apiUrl -UseBasicParsing -ErrorAction Stop
        } finally {
            $ProgressPreference = $oldProgress
        }
        $asset = $resp.assets | Where-Object { $_.name -eq $AssetName } | Select-Object -First 1
        if (-not $asset -or -not $asset.digest) { return $null }
        if ($asset.digest -match '^sha256:([0-9a-fA-F]{64})$') {
            return $Matches[1].ToUpperInvariant()
        }
        return $null
    } catch {
        return $null
    }
}

function Write-Status {
    param([Parameter(Mandatory)][string]$Message)
    [Console]::Error.WriteLine("[powershell-lsp] $Message")
}

function Get-CacheRoot {
    if ($IsWindowsPlatform) {
        return Join-Path -Path $env:LOCALAPPDATA -ChildPath 'claude-code-powershell-lsp'
    }
    $xdg = if ($env:XDG_CACHE_HOME) { $env:XDG_CACHE_HOME } else { Join-Path -Path $HOME -ChildPath '.cache' }
    return Join-Path -Path $xdg -ChildPath 'claude-code-powershell-lsp'
}

# --- 1. Bootstrap PSES from cache or download from GitHub releases (cross-platform) ---
$installDir  = Join-Path -Path (Get-CacheRoot) -ChildPath $PsesVersion
$startScript = Join-Path -Path $installDir -ChildPath 'PowerShellEditorServices/Start-EditorServices.ps1'

if (-not (Test-Path -Path $startScript)) {
    Write-Status "PowerShellEditorServices v$PsesVersion not cached. Downloading from GitHub releases..."
    $downloadUrl = "https://github.com/PowerShell/PowerShellEditorServices/releases/download/v$PsesVersion/PowerShellEditorServices.zip"
    $tempZip     = Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath "pses-$PsesVersion-$([guid]::NewGuid()).zip"
    $preserveZip = $false  # set $true on hash mismatch so the operator can inspect

    try {
        New-Item -ItemType Directory -Path $installDir -Force | Out-Null
        $oldProgress = $ProgressPreference
        $ProgressPreference = 'SilentlyContinue'
        try {
            Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZip -UseBasicParsing
        } finally {
            $ProgressPreference = $oldProgress
        }

        # Verify the download. Trust order: (1) GitHub Releases API `digest` field
        # (upstream-authoritative, works for any version including overrides), (2) hardcoded
        # fallback hash table (offline-safe for the pinned default version). Fail closed:
        # if neither source agrees with the actual hash, refuse to extract and preserve the
        # bad bytes for inspection.
        $actualHash   = (Get-FileHash -Path $tempZip -Algorithm SHA256).Hash
        $expected     = Get-PsesExpectedHashFromGitHub -Version $PsesVersion
        $expectedFrom = 'GitHub Releases API'
        if (-not $expected) {
            $expected     = $FallbackHashes[$PsesVersion]
            $expectedFrom = 'hardcoded fallback table'
        }
        if ($expected) {
            if ($actualHash -ine $expected) {
                $preserveZip = $true
                throw @"
PSES v$PsesVersion download SHA-256 mismatch — refusing to extract.
  Expected: $expected (from $expectedFrom)
  Actual:   $actualHash
  Source:   $downloadUrl
  Bad zip:  $tempZip (preserved for inspection — delete manually after review)
"@
            }
            Write-Status "SHA-256 verified against $expectedFrom`: $actualHash"
        } else {
            Write-Status "WARNING: no expected hash available for PSES v$PsesVersion (GitHub API unreachable AND no fallback)."
            Write-Status "  Computed SHA-256 (record this in `$FallbackHashes if you trust it): $actualHash"
        }

        Write-Status "Extracting to $installDir..."
        Expand-Archive -Path $tempZip -DestinationPath $installDir -Force
    } catch {
        # On any failure (download, hash mismatch, extract) clean the partial install dir
        # so the next run re-downloads instead of using a half-extracted cache.
        Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue
        throw
    } finally {
        # Always clean up the temp zip unless we explicitly want to preserve it for inspection.
        if (-not $preserveZip -and (Test-Path -Path $tempZip)) {
            Remove-Item -Path $tempZip -Force -ErrorAction SilentlyContinue
        }
    }
    if (-not (Test-Path -Path $startScript)) {
        throw "PSES extraction did not produce expected file: $startScript"
    }
    Write-Status "PowerShellEditorServices v$PsesVersion installed."
}

$tempBase = [System.IO.Path]::GetTempPath()
$logPath  = Join-Path -Path $tempBase -ChildPath 'pses-claude-lsp.log'

# --- 2. Non-Windows: direct stdio invocation. PowerShell on Linux/macOS doesn't have the
#        host-I/O wrapping issue that breaks PSES stdio on Windows. ---
if (-not $IsWindowsPlatform) {
    Write-Status "Non-Windows platform: invoking PSES directly via stdio."
    $directSplat = @{
        HostName            = 'claude-lsp'
        HostProfileId       = 'ClaudeCode'
        HostVersion         = '1.0.0'
        LanguageServiceOnly = $true
        Stdio               = $true
        LogPath             = $logPath
        LogLevel            = 'Information'
    }
    & $startScript @directSplat
    return
}

# --- 3. Windows: spawn PSES in a separate pwsh process with named-pipe transport ---
# Use a bare pipe name — .NET NamedPipeServerStream / NamedPipeClientStream take just the
# name; the OS prepends \\.\pipe\ automatically. Passing the prefix produces a double-
# prefixed pipe that the client cannot reach.
$pipeName    = "claude-pses-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
$sessionFile = Join-Path -Path $tempBase -ChildPath "pses-claude-lsp-session-$PID.json"

# Stale session file from a previous crashed run will confuse PSES — clean up.
Remove-Item -Path $sessionFile -Force -ErrorAction SilentlyContinue

Write-Status "Starting PSES with bare pipe name '$pipeName' (OS path: \\.\pipe\$pipeName)"

# Build PSES launch command. Use -Command (not -File) and only required args.
# LogLevel must be passed explicitly (PSES bug: ValidateSet rejects $null on reassignment).
$psesCommand = @"
& '$startScript' ``
  -HostName 'claude-lsp' ``
  -HostProfileId 'ClaudeLSP' ``
  -HostVersion '1.0.0' ``
  -LanguageServiceOnly ``
  -LanguageServicePipeName '$pipeName' ``
  -SessionDetailsPath '$sessionFile' ``
  -LogPath '$logPath' ``
  -LogLevel Information
"@

$psesPsi = [System.Diagnostics.ProcessStartInfo]::new()
$psesPsi.FileName = 'pwsh'
$psesPsi.ArgumentList.Add('-NoLogo')
$psesPsi.ArgumentList.Add('-NoProfile')
$psesPsi.ArgumentList.Add('-Command')
$psesPsi.ArgumentList.Add($psesCommand)
$psesPsi.UseShellExecute        = $false
$psesPsi.CreateNoWindow         = $true
# Detach PSES from our stdio entirely — it uses the named pipe, not stdio.
$psesPsi.RedirectStandardOutput = $true
$psesPsi.RedirectStandardError  = $true
$psesPsi.RedirectStandardInput  = $true

$psesProc = [System.Diagnostics.Process]::Start($psesPsi)
Write-Status "PSES PID: $($psesProc.Id)"

# Drain PSES's stdout/stderr asynchronously so its OS buffers don't fill up
$null = Start-ThreadJob -ScriptBlock {
    param($p)
    try { $p.StandardOutput.ReadToEnd() | Out-Null } catch {}
} -ArgumentList $psesProc -ErrorAction SilentlyContinue

$null = Start-ThreadJob -ScriptBlock {
    param($p)
    try { $p.StandardError.ReadToEnd() | Out-Null } catch {}
} -ArgumentList $psesProc -ErrorAction SilentlyContinue

# --- 4. Wait for PSES session details file (PSES writes it after binding the pipe).
#        Then connect to the pipe name PSES actually used. ---
$sessionDeadline = (Get-Date).AddSeconds(30)
$actualPipeName  = $null
while ((Get-Date) -lt $sessionDeadline) {
    if ($psesProc.HasExited) {
        Write-Status "PSES exited before writing session details (exit code $($psesProc.ExitCode))"
        throw "PSES died during startup"
    }
    if (Test-Path -Path $sessionFile) {
        try {
            $session = Get-Content -Path $sessionFile -Raw | ConvertFrom-Json
            Write-Status "PSES session details: $(($session | ConvertTo-Json -Compress))"
            $candidate = $null
            foreach ($field in @('languageServicePipeName', 'languageServiceTransport', 'languageServicePipeNameInbound')) {
                if ($session.PSObject.Properties[$field] -and $session.$field) {
                    $candidate = [string]$session.$field
                    break
                }
            }
            if (-not $candidate) {
                $candidate = $pipeName
            }
            if ($candidate -match '^\\\\\.\\pipe\\(.+)$') {
                $candidate = $Matches[1]
            }
            $actualPipeName = $candidate
            Write-Status "Will connect to pipe name: '$actualPipeName'"
            break
        } catch {
            Write-Status "Session file not yet readable: $($_.Exception.Message)"
        }
    }
    Start-Sleep -Milliseconds 250
}

if (-not $actualPipeName) {
    Write-Status "PSES never wrote session details file at $sessionFile within 30s"
    try { $psesProc.Kill() } catch {}
    throw "PSES startup timed out"
}

# Connect to the named pipe.
$connectDeadline = (Get-Date).AddSeconds(15)
$pipeClient = $null
while ((Get-Date) -lt $connectDeadline) {
    if ($psesProc.HasExited) {
        Write-Status "PSES exited before client connected (exit code $($psesProc.ExitCode))"
        throw "PSES died during pipe connect"
    }
    try {
        $candidate = [System.IO.Pipes.NamedPipeClientStream]::new(
            '.',
            $actualPipeName,
            [System.IO.Pipes.PipeDirection]::InOut,
            [System.IO.Pipes.PipeOptions]::Asynchronous
        )
        $candidate.Connect(1000)
        if ($candidate.IsConnected) {
            $pipeClient = $candidate
            break
        }
        $candidate.Dispose()
    } catch [System.TimeoutException] {
        # Retry
    } catch {
        Write-Status "Pipe connect attempt failed: $($_.Exception.Message)"
    }
    Start-Sleep -Milliseconds 250
}

if (-not $pipeClient -or -not $pipeClient.IsConnected) {
    Write-Status "Failed to connect to PSES named pipe '$actualPipeName' within 15s"
    try { $psesProc.Kill() } catch {}
    throw "PSES named pipe never became available"
}

Write-Status "Connected to PSES pipe '$actualPipeName'. Bridging stdio <-> named pipe."

# --- 5. Bidirectional byte copy: stdin -> pipe, pipe -> stdout ---
$cts = [System.Threading.CancellationTokenSource]::new()

$stdinToPipe  = $stdin.CopyToAsync($pipeClient, 4096, $cts.Token)
$pipeToStdout = $pipeClient.CopyToAsync($stdout, 4096, $cts.Token)

# Wait for either side to finish (LSP shutdown, connection drop, or PSES exit).
try {
    [System.Threading.Tasks.Task]::WaitAny(@($stdinToPipe, $pipeToStdout)) | Out-Null
} catch {
    Write-Status "Bridge error: $($_.Exception.Message)"
}

# --- 6. Cleanup ---
$cts.Cancel()
try { $pipeClient.Dispose() } catch {}
try {
    if (-not $psesProc.HasExited) {
        $psesProc.Kill()
        $psesProc.WaitForExit(5000) | Out-Null
    }
} catch {}
Remove-Item -Path $sessionFile -Force -ErrorAction SilentlyContinue
Write-Status "Bridge shut down (PSES exit code: $(if ($psesProc.HasExited) { $psesProc.ExitCode } else { 'still running' }))."
