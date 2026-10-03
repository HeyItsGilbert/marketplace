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
    PSES release version in `X.Y.Z` or `X.Y.Z-prerelease` form. Defaults to
    env var CLAUDE_PSES_VERSION, else 4.5.0. GitHub tag prefixes (for example,
    `v4.5.0`) and non-release values are rejected.

.EXAMPLE
    pwsh -NoLogo -NoProfile -File (Join-Path $env:CLAUDE_PLUGIN_ROOT 'scripts/start-pses-lsp.ps1') -PsesVersion '4.5.0'
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

if ($PsesVersion -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$') {
    throw "PSES version '$PsesVersion' must match the PSES release format X.Y.Z or X.Y.Z-prerelease."
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
$cacheRoot   = Get-CacheRoot
$installDir  = Join-Path -Path $cacheRoot -ChildPath $PsesVersion
$startScript = Join-Path -Path $installDir -ChildPath 'PowerShellEditorServices/Start-EditorServices.ps1'

if (-not (Test-Path -Path $startScript)) {
    $bootstrapMutex = [System.Threading.Mutex]::new($false, "claude-code-powershell-lsp-$PsesVersion")
    $mutexAcquired = $false
    try {
        try {
            $mutexAcquired = $bootstrapMutex.WaitOne([TimeSpan]::FromMinutes(2))
        } catch [System.Threading.AbandonedMutexException] {
            # The previous bootstrapper died; its installation was never published atomically.
            $mutexAcquired = $true
        }
        if (-not $mutexAcquired) {
            throw "Timed out waiting to bootstrap PSES v$PsesVersion."
        }

        # A concurrent launcher may have completed while this instance waited for the lock.
        if (-not (Test-Path -Path $startScript)) {
            Write-Status "PowerShellEditorServices v$PsesVersion not cached. Downloading from GitHub releases..."
            New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
            $stagingDir         = Join-Path -Path $cacheRoot -ChildPath ".${PsesVersion}-$([guid]::NewGuid().ToString('N')).staging"
            $previousInstallDir = $null
            $tempZip            = Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath "pses-$PsesVersion-$([guid]::NewGuid()).zip"
            $preserveZip        = $false

            try {
                $downloadUrl = "https://github.com/PowerShell/PowerShellEditorServices/releases/download/v$PsesVersion/PowerShellEditorServices.zip"
                $oldProgress = $ProgressPreference
                $ProgressPreference = 'SilentlyContinue'
                try {
                    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZip -UseBasicParsing
                } finally {
                    $ProgressPreference = $oldProgress
                }

                $actualHash   = (Get-FileHash -Path $tempZip -Algorithm SHA256).Hash
                $expected     = Get-PsesExpectedHashFromGitHub -Version $PsesVersion
                $expectedFrom = 'GitHub Releases API'
                if (-not $expected) {
                    $expected     = $FallbackHashes[$PsesVersion]
                    $expectedFrom = 'hardcoded fallback table'
                }
                if (-not $expected) {
                    throw "No trusted SHA-256 is available for PSES v$PsesVersion. Refusing to extract unverified archive: $tempZip"
                }
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

                Write-Status "Extracting PSES v$PsesVersion into staging..."
                Expand-Archive -Path $tempZip -DestinationPath $stagingDir -Force
                $stagedStartScript = Join-Path -Path $stagingDir -ChildPath 'PowerShellEditorServices/Start-EditorServices.ps1'
                if (-not (Test-Path -Path $stagedStartScript)) {
                    throw "PSES extraction did not produce expected file: $stagedStartScript"
                }

                # Publish only a complete, verified installation while still holding the version lock.
                # Renames within the cache root are atomic; preserve a legacy partial install until
                # the staged installation is successfully published.
                if (Test-Path -Path $installDir) {
                    $previousInstallDir = "$installDir.previous-$([guid]::NewGuid().ToString('N'))"
                    Move-Item -Path $installDir -Destination $previousInstallDir -ErrorAction Stop
                }
                Move-Item -Path $stagingDir -Destination $installDir -ErrorAction Stop
                $stagingDir = $null
                if ($previousInstallDir) {
                    Remove-Item -Path $previousInstallDir -Recurse -Force -ErrorAction SilentlyContinue
                    $previousInstallDir = $null
                }
                Write-Status "PowerShellEditorServices v$PsesVersion installed."
            } catch {
                if ($previousInstallDir -and (Test-Path -Path $previousInstallDir) -and -not (Test-Path -Path $installDir)) {
                    Move-Item -Path $previousInstallDir -Destination $installDir -ErrorAction SilentlyContinue
                }
                if ($stagingDir -and (Test-Path -Path $stagingDir)) {
                    Remove-Item -Path $stagingDir -Recurse -Force -ErrorAction SilentlyContinue
                }
                throw
            }
            finally {
                if (-not $preserveZip -and (Test-Path -Path $tempZip)) {
                    Remove-Item -Path $tempZip -Force -ErrorAction SilentlyContinue
                }
            }
        }
    } finally {
        if ($mutexAcquired) {
            $bootstrapMutex.ReleaseMutex()
        }
        $bootstrapMutex.Dispose()
    }
}

if (-not (Test-Path -Path $startScript)) {
    throw "PSES installation did not produce expected file: $startScript"
}

$tempBase    = [System.IO.Path]::GetTempPath()
$logPath     = Join-Path -Path $tempBase -ChildPath 'pses-claude-lsp.log'
$sessionFile = Join-Path -Path $tempBase -ChildPath "pses-claude-lsp-session-$PID-$([guid]::NewGuid().ToString('N')).json"

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
        SessionDetailsPath  = $sessionFile
        LogPath             = $logPath
        LogLevel            = 'Information'
    }
    try {
        & $startScript @directSplat
    } finally {
        Remove-Item -Path $sessionFile -Force -ErrorAction SilentlyContinue
    }
    return
}

# --- 3. Windows: spawn PSES in a separate pwsh process with named-pipe transport ---
# Use a bare pipe name — .NET NamedPipeServerStream / NamedPipeClientStream take just the
# name; the OS prepends \\.\pipe\ automatically. Passing the prefix produces a double-
# prefixed pipe that the client cannot reach.
$pipeName = "claude-pses-$([guid]::NewGuid().ToString('N').Substring(0, 12))"

Write-Status "Starting PSES with bare pipe name '$pipeName' (OS path: \\.\pipe\$pipeName)"

# Pass paths as process arguments rather than interpolating them into PowerShell source.
# This supports legal apostrophes and other special characters in cache and temp paths.
$psesPsi = [System.Diagnostics.ProcessStartInfo]::new()
$psesPsi.FileName = 'pwsh'
foreach ($argument in @(
    '-NoLogo', '-NoProfile', '-File', $startScript,
    '-HostName', 'claude-lsp',
    '-HostProfileId', 'ClaudeLSP',
    '-HostVersion', '1.0.0',
    '-LanguageServiceOnly',
    '-LanguageServicePipeName', $pipeName,
    '-SessionDetailsPath', $sessionFile,
    '-LogPath', $logPath,
    '-LogLevel', 'Information'
)) {
    $psesPsi.ArgumentList.Add($argument)
}
$psesPsi.UseShellExecute        = $false
$psesPsi.CreateNoWindow         = $true
# Detach PSES from our stdio entirely — it uses the named pipe, not stdio.
$psesPsi.RedirectStandardOutput = $true
$psesPsi.RedirectStandardError  = $true
$psesPsi.RedirectStandardInput  = $true

$psesProc = $null
$pipeClient = $null
$cts = $null
$cleanupCompleted = $false
try {
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
            $sessionPipeName = $null
            foreach ($field in @('languageServicePipeName', 'languageServiceTransport', 'languageServicePipeNameInbound')) {
                if ($session.PSObject.Properties[$field] -and $session.$field) {
                    $sessionPipeName = [string]$session.$field
                    break
                }
            }
            if (-not $sessionPipeName) {
                $sessionPipeName = $pipeName
            }
            if ($sessionPipeName -match '^\\\\\.\\pipe\\(.+)$') {
                $sessionPipeName = $Matches[1]
            }
            $actualPipeName = $sessionPipeName
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
        $pipeConnection = [System.IO.Pipes.NamedPipeClientStream]::new(
            '.',
            $actualPipeName,
            [System.IO.Pipes.PipeDirection]::InOut,
            [System.IO.Pipes.PipeOptions]::Asynchronous
        )
        $pipeConnection.Connect(1000)
        if ($pipeConnection.IsConnected) {
            $pipeClient = $pipeConnection
            break
        }
        $pipeConnection.Dispose()
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
$bridgeFailure = $null
$bridgeTasks = @($stdinToPipe, $pipeToStdout)
try {
    $completedIndex = [System.Threading.Tasks.Task]::WaitAny($bridgeTasks)
    $bridgeTasks[$completedIndex].GetAwaiter().GetResult()

    # A simultaneous fault must not be hidden by the first normally completed task.
    foreach ($bridgeTask in $bridgeTasks) {
        if ($bridgeTask.IsCompleted) {
            $bridgeTask.GetAwaiter().GetResult()
        }
    }
} catch {
    $bridgeFailure = $_.Exception
}

# --- 6. Cleanup ---
# Give PSES a short opportunity to report its own exit before terminating it.
$terminatedByCleanup = $false
$childExitCode = $null
if ($psesProc.WaitForExit(250)) {
    $childExitCode = $psesProc.ExitCode
}

$cts.Cancel()
try { $pipeClient.Dispose() } catch {}
try {
    if ($null -eq $childExitCode -and -not $psesProc.HasExited) {
        $psesProc.Kill()
        $terminatedByCleanup = $true
        $psesProc.WaitForExit(5000) | Out-Null
    }
} catch {}

if (-not $terminatedByCleanup -and $psesProc.HasExited) {
    $childExitCode = $psesProc.ExitCode
}

$cts.Dispose()
$psesProc.Dispose()
$cleanupCompleted = $true
Write-Status "Bridge shut down (PSES exit code: $(if ($null -ne $childExitCode) { $childExitCode } else { 'terminated by launcher' }))."

if ($bridgeFailure) {
    throw "Bridge error: $($bridgeFailure.Message)"
}
if ($null -ne $childExitCode -and $childExitCode -ne 0) {
    throw "PSES exited unexpectedly with exit code $childExitCode."
}
} finally {
    if (-not $cleanupCompleted) {
        if ($cts) {
            try { $cts.Cancel() } catch {}
        }
        if ($pipeClient) {
            try { $pipeClient.Dispose() } catch {}
        }
        if ($psesProc) {
            try {
                if (-not $psesProc.HasExited) {
                    $psesProc.Kill()
                    $psesProc.WaitForExit(5000) | Out-Null
                }
            } catch {}
            $psesProc.Dispose()
        }
        if ($cts) {
            $cts.Dispose()
        }
    }
    Remove-Item -Path $sessionFile -Force -ErrorAction SilentlyContinue
}
