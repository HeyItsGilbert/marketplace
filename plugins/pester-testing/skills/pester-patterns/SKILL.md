---
name: pester-patterns
description: Ready-to-use Pester 5 test patterns and recipes for PowerShell modules — mocking (filesystem, REST, credentials, DSC), VS Code hang fixes, parametrized tests. Use when asking for a test template, mock example, or how to test a specific scenario. Triggers: "pester pattern", "mock REST", "mock file system", "mock credential", "test DSC resource", "pester hangs", "VS Code freezes pester", "test template", "pester recipe". Not for running (use pester-run), reviewing (use pester-review), or scaffolding fresh tests (use pester-write).
allowed-tools:
  - PowerShell(*)
---

# Pester 5 Test Patterns & Recipes

Ready-to-use test patterns for common PowerShell testing scenarios using Pester 5.

## When to Use

- You need to mock an external dependency (file system, REST API, database, etc.)
- You need a test template for a specific scenario
- You want proven patterns for testing complex PowerShell code
- You need to test credential handling, DSC resources, or async operations
- You need to run Pester tests without hanging VS Code

## Pattern 0: Run Tests via Start-Process (Detached)

**Scope: VS Code's integrated PowerShell session only.** Running Pester on the
PowerShell extension's session thread can hang or freeze the editor — in-process
`Invoke-Pester`, `InModuleScope` locking, and a stalled output pipe all block the
language server. Inside VS Code, run detached via `Start-Process`.

**For agent test runs, use [`pester-run`](../pester-run/SKILL.md) instead** — an
in-process `New-PesterConfiguration` + `Invoke-Pester` run is correct and does not
hang outside VS Code's integrated session. Do not reach for `Start-Process` just
because a run is automated; it costs you the structured result object for nothing.

### Quick Start — Run All Tests

```powershell
$logPath = Join-Path $PWD 'output\test.log'
New-Item -Path (Split-Path $logPath) -ItemType Directory -Force | Out-Null
Remove-Item $logPath -ErrorAction SilentlyContinue

Start-Process -FilePath pwsh -ArgumentList @(
    '-NoProfile', '-NonInteractive', '-Command',
    "Set-Location '$PWD'; Invoke-Pester -Path './tests' -Output Detailed *>&1 | Out-File -FilePath '$logPath' -Encoding utf8"
) -WindowStyle Hidden -PassThru

# Poll for completion
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep 3
    if (Test-Path $logPath) {
        $c = Get-Content $logPath -Raw -ErrorAction SilentlyContinue
        if ($c -match 'Tests Passed|Tests Failed|Invoke-Pester.*completed') {
            Get-Content $logPath -Tail 30
            break
        }
    }
}
```

### With Full Configuration

```powershell
$logPath = Join-Path $PWD 'output\test.log'
New-Item -Path (Split-Path $logPath) -ItemType Directory -Force | Out-Null
Remove-Item $logPath -ErrorAction SilentlyContinue

$pesterCmd = @"
Set-Location '$PWD'
`$config = New-PesterConfiguration
`$config.Run.Path = './tests'
`$config.Run.Exit = `$true
`$config.Output.Verbosity = 'Detailed'
`$config.CodeCoverage.Enabled = `$true
`$config.CodeCoverage.Path = @('./source/Public/*.ps1', './source/Private/*.ps1')
`$config.TestResult.Enabled = `$true
`$config.TestResult.OutputFormat = 'NUnitXml'
`$config.TestResult.OutputPath = './output/testResults.xml'
Invoke-Pester -Configuration `$config *>&1 | Out-File -FilePath '$logPath' -Encoding utf8
"@

Start-Process -FilePath pwsh -ArgumentList @(
    '-NoProfile', '-NonInteractive', '-Command', $pesterCmd
) -WindowStyle Hidden -PassThru
```

### Run a Single Test File

```powershell
$logPath = Join-Path $PWD 'output\test.log'
Remove-Item $logPath -ErrorAction SilentlyContinue

Start-Process -FilePath pwsh -ArgumentList @(
    '-NoProfile', '-NonInteractive', '-Command',
    "Set-Location '$PWD'; Invoke-Pester -Path './tests/Unit/Get-Widget.Tests.ps1' -Output Detailed *>&1 | Out-File -FilePath '$logPath' -Encoding utf8"
) -WindowStyle Hidden -PassThru
```

### Run by Tag

```powershell
$logPath = Join-Path $PWD 'output\test.log'
Remove-Item $logPath -ErrorAction SilentlyContinue

$pesterCmd = @"
Set-Location '$PWD'
`$config = New-PesterConfiguration
`$config.Run.Path = './tests'
`$config.Filter.Tag = @('Unit')
`$config.Output.Verbosity = 'Detailed'
`$config.Run.Exit = `$true
Invoke-Pester -Configuration `$config *>&1 | Out-File -FilePath '$logPath' -Encoding utf8
"@

Start-Process -FilePath pwsh -ArgumentList @(
    '-NoProfile', '-NonInteractive', '-Command', $pesterCmd
) -WindowStyle Hidden -PassThru
```

### Sampler Projects

```powershell
$logPath = Join-Path $PWD 'output\test.log'
Remove-Item $logPath -ErrorAction SilentlyContinue

Start-Process -FilePath pwsh -ArgumentList @(
    '-NoProfile', '-NonInteractive', '-Command',
    "Set-Location '$PWD'; .\build.ps1 -Tasks test *>&1 | Out-File -FilePath '$logPath' -Encoding utf8"
) -WindowStyle Hidden -PassThru
```

### Key Rules

- **Log files go to `output/`** (gitignored), never the project root.
- **Always use `-WindowStyle Hidden`** to prevent a visible console flash.
- Poll the log for completion markers (`Tests Passed`, `Build succeeded`, etc.).

### Why This Matters

| Problem | Cause |
|---|---|
| VS Code freezes with `pwsh -Command` | Terminal synchronously waits for child; Pester output stalls the pipe |
| VS Code freezes with in-process Pester | Blocks the PowerShell extension's thread |
| Module state leaks between runs | `Import-Module -Force` in-process may not fully unload assemblies |
| `InModuleScope` deadlocks | Locking conflicts with the language server |
| Stale `$Error` / breakpoints | Previous debug sessions pollute the session |

## Pattern Index

Detailed patterns live in **`references/patterns.md`**. Load that file when the user's request matches one of these patterns:

| Pattern | When to load |
|---|---|
| 1. Mock filesystem | `Get-Content`, `Set-Content`, `Test-Path`, `TestDrive:` scenarios |
| 2. Mock REST APIs | `Invoke-RestMethod`, `Invoke-WebRequest`, paginated endpoints |
| 3. Mock credentials | `PSCredential`, `SecureString` parameters |
| 4. DSC resources | Class-based or MOF-based DSC resource tests |
| 5. PowerShell classes | Constructors, methods, `ToString` overrides |
| 6. Pipeline functions | Pipeline-bound parameter tests |
| 7. Errors / warnings | `ErrorVariable`, warning streams, verbose streams |
| 8. Dates and times | Mocking `Get-Date` |
| 9. ShouldProcess | `-WhatIf`, `-Confirm` paths |
| 10. Environment vars | Tests that set/restore `$env:` values |
| 11. Module exports | Asserting public/private function exposure |
| 12. Private functions | `& (Get-Module X) { ... }` scope-invocation |
| 13. External fixtures | Avoiding nested here-strings; loading from disk |
| Mock cheat sheet | Quick lookup of what mock command to use |

Read the relevant section of `references/patterns.md` (grep by pattern number or heading) — do not load the full file unless the user wants a broad survey.

