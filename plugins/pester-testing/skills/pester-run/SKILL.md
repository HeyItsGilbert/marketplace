---
name: pester-run
description: Run Pester 5 tests for a suite, path, tag or exclusion filter, test-name filter, failing-change verification, or from VS Code without blocking PowerShell.
allowed-tools: PowerShell(*), Bash(find *)
---

# Pester 5 Test Runner

Run Pester with a structured result object and report failures concisely.

## Run Pester

1. **Choose the execution mode.** Use the in-process mode from an agent or normal PowerShell process. Use detached mode only from VS Code's integrated PowerShell session, where Pester could block the PowerShell extension. Complete when exactly one mode is selected.
2. **Choose the narrowest requested scope.** Use a supplied file, directory, tag, exclusion tag, or full-name filter. Discover `*.Tests.ps1` files only when no target is known. Complete when the configuration matches the requested scope.
3. **Execute the selected mode.** For in-process execution, use the configuration below. For detached VS Code execution, load [VS Code detached execution](references/vscode-detached-execution.md) and follow its procedure. Complete when Pester returns a structured result or a structured execution error.
4. **Report the result.** State total result and duration. For passing runs, state the passing count only. For failures, report each failed test's full path and error message, then passed, failed, and skipped totals. For a structured execution error, report its message, error ID, and stack trace. Complete when the user receives the applicable result.

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

Use `$result.FailedCount`, `$result.PassedCount`, `$result.SkippedCount`, and `$result.Failed` rather than parsing output. Set `$cfg.Filter.Tag` and `$cfg.Filter.ExcludeTag` only when the request supplies them.

If Pester 5 is unavailable, report that prerequisite and provide `Install-Module Pester -MinimumVersion 5.0.0 -Scope CurrentUser -Force`; do not claim a run occurred. Treat a clean completed result as final.
