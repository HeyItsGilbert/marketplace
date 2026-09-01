---
name: pester-run
description: Run Pester 5 tests for a suite, path, tag, exclusion, name filter, or failing-change verification.
allowed-tools: PowerShell(*), Bash(find *)
---

# Pester 5 Test Runner

Run Pester with a structured result object and report failures concisely.

## Choose the execution mode

1. **Identify the host.** If running from an agent or a normal PowerShell process, use the in-process mode. If running inside VS Code's integrated PowerShell session, use detached mode to avoid blocking the PowerShell extension. Complete when exactly one mode is selected.
2. **Choose the narrowest requested target.** Use a file, directory, tag, or name filter when supplied; discover `*.Tests.ps1` files only when no target is known. Complete when the configuration matches the requested test scope.

### In-process mode

```powershell
$cfg = New-PesterConfiguration
$cfg.Output.Verbosity = 'Normal'
$cfg.Run.PassThru = $true

# Set only the filters the request supplies.
# $cfg.Run.Path = './tests/Get-Widget.Tests.ps1'
# $cfg.Filter.Tag = @('Unit')
# $cfg.Filter.ExcludeTag = @('Slow')
# $cfg.Filter.FullName = '*Get-Widget*returns*'
$result = Invoke-Pester -Configuration $cfg
```

Use `$result.FailedCount`, `$result.PassedCount`, `$result.SkippedCount`, and `$result.Failed` rather than parsing output. For tags, set `$cfg.Filter.Tag` and `$cfg.Filter.ExcludeTag` only when the request supplies them.

### VS Code detached mode

```powershell
# Populate these from the selected request. Leave arrays empty when not supplied.
$selectedPath = @()       # Requested file or directory; otherwise discovered test files.
$selectedTags = @()       # Requested -Tag values.
$excludedTags = @()       # Requested -ExcludeTag values.
$selectedName = $null     # Requested test-name pattern.

if (-not $selectedPath) {
  $selectedPath = Get-ChildItem -Recurse -Filter '*.Tests.ps1' | Select-Object -ExpandProperty FullName
}

$workspace = Join-Path ([IO.Path]::GetTempPath()) "pester-run-$([guid]::NewGuid())"
New-Item -Path $workspace -ItemType Directory -Force | Out-Null
$payloadPath = Join-Path $workspace 'request.json'
$resultPath = Join-Path $workspace 'result.clixml'
$childScriptPath = Join-Path $workspace 'run-pester.ps1'

[pscustomobject]@{
  WorkingDirectory = $PWD.Path
  Paths = @($selectedPath)
  Tags = @($selectedTags)
  ExcludedTags = @($excludedTags)
  FullName = $selectedName
  ResultPath = $resultPath
} | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $payloadPath -Encoding utf8

@'
param([string] $PayloadPath)

$payload = Get-Content -Raw -LiteralPath $PayloadPath | ConvertFrom-Json
$envelope = [ordered]@{ Result = $null; Error = $null }
try {
  Set-Location -LiteralPath $payload.WorkingDirectory
  $cfg = New-PesterConfiguration
  $cfg.Output.Verbosity = 'Normal'
  $cfg.Run.PassThru = $true
  $cfg.Run.Path = @($payload.Paths)
  if ($null -ne $payload.Tags -and @($payload.Tags).Count -gt 0) { $cfg.Filter.Tag = @($payload.Tags) }
  if ($null -ne $payload.ExcludedTags -and @($payload.ExcludedTags).Count -gt 0) { $cfg.Filter.ExcludeTag = @($payload.ExcludedTags) }
  if ($payload.FullName) { $cfg.Filter.FullName = $payload.FullName }
  $envelope.Result = Invoke-Pester -Configuration $cfg
}
catch {
  $envelope.Error = [pscustomobject]@{
    Message = $_.Exception.Message
    FullyQualifiedErrorId = $_.FullyQualifiedErrorId
    ScriptStackTrace = $_.ScriptStackTrace
  }
}
[pscustomobject] $envelope | Export-Clixml -LiteralPath $payload.ResultPath
if ($envelope.Error -or $envelope.Result.FailedCount -gt 0) { exit 1 }
'@ | Set-Content -LiteralPath $childScriptPath -Encoding utf8

$process = Start-Process pwsh -ArgumentList @(
  '-NoProfile', '-NonInteractive', '-File', "`"$childScriptPath`"", "`"$payloadPath`""
) -PassThru
$process | Wait-Process
$run = Import-Clixml -LiteralPath $resultPath
Remove-Item -LiteralPath $workspace -Recurse -Force
```

Use `$run.Result.FailedCount`, `$run.Result.PassedCount`, `$run.Result.SkippedCount`, and `$run.Result.Failed` for the report. If `$run.Error` is present, report its message, error ID, and stack trace. This mode preserves the same selected path, tag, exclusion-tag, and name scope as the in-process mode.

## Report

1. Report the total result and duration. For passing runs, state the passing count only.
2. For failures, report each failed test's full path and error message, then the passed, failed, and skipped totals.
3. If Pester 5 is unavailable, state that prerequisite and provide the installation command; do not claim a run occurred.

Treat a clean completed result as final.
