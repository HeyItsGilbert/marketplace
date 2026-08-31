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

Use `$result.FailedCount`, `$result.PassedCount`, `$result.SkippedCount`, and `$result.Failed` rather than parsing output. For tags, set `$cfg.Filter.Tag` and, when appropriate, `$cfg.Filter.ExcludeTag`.

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
$logPath = Join-Path $PWD 'output/test.log'
New-Item -Path (Split-Path $logPath) -ItemType Directory -Force | Out-Null
$pathSetting = "`$cfg.Run.Path = $($selectedPath | ConvertTo-Json -Compress)"
$tagSetting = if ($selectedTags) { "`$cfg.Filter.Tag = $($selectedTags | ConvertTo-Json -Compress)" }
$excludeSetting = if ($excludedTags) { "`$cfg.Filter.ExcludeTag = $($excludedTags | ConvertTo-Json -Compress)" }
$nameSetting = if ($selectedName) { "`$cfg.Filter.FullName = $($selectedName | ConvertTo-Json -Compress)" }
$pesterCommand = @"
Set-Location '$PWD'
`$cfg = New-PesterConfiguration
`$cfg.Output.Verbosity = 'Normal'
$pathSetting
$tagSetting
$excludeSetting
$nameSetting
Invoke-Pester -Configuration `$cfg *>&1 | Out-File '$logPath' -Encoding utf8
"@
$process = Start-Process pwsh -ArgumentList '-NoProfile', '-NonInteractive', '-Command', $pesterCommand -WindowStyle Hidden -PassThru
$process | Wait-Process
Get-Content $logPath
```

Read the completed log and report its final Pester summary. Use this mode only for VS Code's integrated session; it does not provide the in-process structured result object.

## Report

1. Report the total result and duration. For passing runs, state the passing count only.
2. For failures, report each failed test's full path and error message, then the passed, failed, and skipped totals.
3. If Pester 5 is unavailable, state that prerequisite and provide the installation command; do not claim a run occurred.

Do not re-run a clean result. Enable code coverage only when the user requests a full-suite coverage target and provides the target and source paths.
