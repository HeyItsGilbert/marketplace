---
name: pester-run
description: Run Pester 5 tests in PowerShell and report results in a format optimized for agents — failures and summary only, no passing-test noise. Use when asked to run tests, execute the test suite, check if tests pass, run a specific test file, run tests with a tag filter, verify a change didn't break anything, or find out which tests are currently failing. Trigger phrases: "run the tests", "run Pester", "execute the test suite", "check if tests pass", "run unit tests", "run integration tests", "does this break any tests", "what tests are failing", "run only the smoke tests", "run tests for this function", "are all tests green". This skill focuses on invocation and result interpretation. Do NOT use for: writing new tests (use pester-write) or reviewing test quality (use pester-review).
allowed-tools: PowerShell(*), Bash(find *)
---

# Pester 5 Test Runner

Run Pester 5 tests with agent-optimized output: failures and summary only.

## Efficiency Guidelines

- Always use `New-PesterConfiguration` with `Run.PassThru.Value = $true` — this gives you a structured result object so you can check `$result.FailedCount` rather than parsing text output.
- Set `Output.Verbosity.Value = 'Normal'` for all agent runs. This suppresses passing-test lines while showing full failure details and the final summary.
- Run a focused subset first (by tag or path) when verifying a specific change. Run the full suite only to confirm a branch is clean.
- Never re-run after a clean pass — report success and stop.

## Standard Invocation Patterns

### Whole suite

```powershell
$cfg = New-PesterConfiguration
$cfg.Output.Verbosity.Value = 'Normal'
$cfg.Run.PassThru.Value     = $true
$result = Invoke-Pester -Configuration $cfg
```

### Specific file or directory

```powershell
$cfg = New-PesterConfiguration
$cfg.Run.Path.Value         = './tests/Get-Widget.Tests.ps1'
$cfg.Output.Verbosity.Value = 'Normal'
$cfg.Run.PassThru.Value     = $true
$result = Invoke-Pester -Configuration $cfg
```

### Filter by tag

```powershell
$cfg = New-PesterConfiguration
$cfg.Filter.Tag.Value        = @('Unit')
$cfg.Filter.ExcludeTag.Value = @('Slow', 'Integration')
$cfg.Output.Verbosity.Value  = 'Normal'
$cfg.Run.PassThru.Value      = $true
$result = Invoke-Pester -Configuration $cfg
```

### Filter by test name pattern

```powershell
$cfg = New-PesterConfiguration
$cfg.Filter.FullName.Value  = '*Get-Widget*returns*'
$cfg.Output.Verbosity.Value = 'Normal'
$cfg.Run.PassThru.Value     = $true
$result = Invoke-Pester -Configuration $cfg
```

## Reading the Result Object

Check `$result.FailedCount` — do not parse text output.

| Property | Type | Description |
|---|---|---|
| `$result.FailedCount` | `int` | Number of failed tests |
| `$result.PassedCount` | `int` | Number of passed tests |
| `$result.SkippedCount` | `int` | Number of skipped tests |
| `$result.TotalCount` | `int` | Total tests executed |
| `$result.Duration` | `TimeSpan` | Total wall-clock time |
| `$result.Failed` | `TestResult[]` | Array of failed test objects |
| `$result.Failed[n].ExpandedPath` | `string` | Full test path: `Describe > Context > It` |
| `$result.Failed[n].ErrorRecord.Exception.Message` | `string` | Human-readable failure reason |

## Reporting Format

Report results concisely. Do not reproduce passing-test output.

**All passing:**
```
All 47 tests passed (3.2s)
```

**With failures:**
```
3 of 47 tests failed (4.1s)

✗ Get-Widget > when Id is negative > throws ArgumentException
  Expected exception [System.ArgumentException] but got [System.Exception]: Value was invalid.

✗ Invoke-Sync > when the API is unreachable > calls Write-Error once
  Expected Write-Error to be called 1 time(s) but was called 0 time(s).

✗ Export-Report > creates the output file
  Expected 'TestDrive:\report.csv' to exist, but it did not.

Passed: 44 | Failed: 3 | Skipped: 0 (4.1s)
```

## Discovering Test Files

When no path is specified and the project layout is unknown, find all test files first:

```powershell
# PowerShell
Get-ChildItem -Recurse -Filter '*.Tests.ps1' | Select-Object -ExpandProperty FullName
```

```bash
# Bash
find . -name '*.Tests.ps1' -not -path '*/node_modules/*'
```

Run from the project root so `$PSCommandPath`-relative imports and module paths resolve correctly.

## Verbosity Reference

| Level | Output | Use when |
|---|---|---|
| `None` | Silent | CI pipelines consuming XML test results only |
| `Normal` | Failures + final summary | Agent runs — default for this skill |
| `Detailed` | All test names with pass/fail status | Interactive debugging |
| `Diagnostic` | Internal Pester state + debug messages | Diagnosing Pester itself |

## Common Failure Patterns

When `$result.FailedCount -gt 0`, match the error message before reporting to help the user understand root cause:

| Error message contains | Likely cause |
|---|---|
| `Cannot find module` | Module not imported in `BeforeAll`; check path |
| `The term '...' is not recognized` | Missing mock, wrong scope, or function not loaded |
| `Expected ... to be called` | Mock defined in wrong scope (move to `Describe`-level `BeforeAll`) |
| `Expected '...' to exist` | `TestDrive:` path typo or file creation step missing |
| `Cannot bind parameter` | Source function signature changed; parameter name mismatch |
| `is $null` | `BeforeAll` variable used in `It` without `$script:` scope |

## Pester 5 Installation Check

If Pester is missing or below v5, install before running:

```powershell
$pester = Get-Module Pester -ListAvailable | Sort-Object Version -Descending | Select-Object -First 1
if (-not $pester -or $pester.Version -lt [version]'5.0') {
    Install-Module Pester -MinimumVersion 5.0.0 -Scope CurrentUser -Force
}
```

`-Scope CurrentUser` avoids needing admin rights. On systems with both PS 5.1 and PS 7+, install into both if needed.
