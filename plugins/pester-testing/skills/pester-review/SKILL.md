---
name: pester-review
description: Review existing Pester test files for correctness, idiomatic Pester 5 usage, coverage gaps, and quality. Use when the user asks to review, audit, improve, or grade their Pester tests. Activate when asked whether tests are good, to find gaps in test coverage, to check a *.Tests.ps1 file for issues, to migrate from Pester v4 to v5, to improve test names, or to verify tests would actually catch regressions. Trigger phrases: "review my tests", "are these tests good", "audit test coverage", "improve pester tests", "check my test file", "v4 to v5 migration", "pester migration", "fix test patterns", "test quality review", "what am I missing in my tests", "are my tests idiomatic". Also activate when shown a *.Tests.ps1 file and asked for feedback or a second opinion. Do NOT use for: writing new tests (use pester-write), running tests (use pester-run), or reviewing non-test PowerShell code.
allowed-tools: Bash(pwsh *), Bash(powershell *), Bash(find *), Bash(git diff *)
---

# Pester 5 Test Reviewer

Review Pester test files for correctness, Pester 5 idioms, and quality.

## Efficiency Guidelines

- Read the test file and its corresponding source file in parallel — you need both to assess coverage gaps.
- For modules, enumerate exports first: `Get-Command -Module <name>` to list the public API surface, then cross-reference against `Describe` blocks in the test file.
- Group findings by severity and report once — don't repeat the same issue for every occurrence.

## Breaking Issues (Pester v4 Patterns That Fail in v5)

Report these as **Breaking** — they will silently pass or hard-fail at runtime.

### 1. `Assert-MockCalled` removed

```powershell
# BROKEN — removed in Pester 5
Assert-MockCalled Write-Log -Times 1 -Scope It

# CORRECT
Should -Invoke Write-Log -Times 1 -Exactly
```

### 2. `BeforeAll` variables not visible in `It` blocks

```powershell
# BROKEN — $result is $null inside the It block
Describe 'Get-Widget' {
    BeforeAll { $result = Get-Widget -Id 1 }
    It 'has the right Id' { $result.Id | Should -Be 1 }  # always passes: $null -eq ...
}

# CORRECT
Describe 'Get-Widget' {
    BeforeAll { $script:result = Get-Widget -Id 1 }
    It 'has the right Id' { $script:result.Id | Should -Be 1 }
}
```

This is the most common silent failure when migrating from v4. Tests appear to pass because `$null` comparisons resolve unexpectedly — look for `It` blocks that reference variables set in `BeforeAll` without `$script:`.

### 3. Mock scope changed — v4 mocks bled across `Context` blocks

In Pester 5, a mock defined inside a `Context` block is NOT visible to sibling `Context` blocks. Code relying on v4's Describe-wide mock bleeding may test the real implementation silently:

```powershell
# MAY BE BROKEN after v4→v5 migration
Describe 'Sync-Data' {
    Context 'with a populated cache' {
        Mock Get-CacheEntry { return $fakeEntry }
        It 'uses cached data' { ... }  # mock applies here
    }
    Context 'with an empty cache' {
        It 'fetches from the API' { ... }  # Get-CacheEntry is NOT mocked here in v5
    }
}

# CORRECT: shared mocks at Describe level
Describe 'Sync-Data' {
    BeforeAll {
        Mock Get-CacheEntry { return $fakeEntry }
    }
    ...
}
```

### 4. `param()` in `-ParameterFilter` (vestigial, not breaking)

Old `param($Path)` syntax inside `-ParameterFilter` still works in v5 but is no longer needed. Flag as a cleanup item if encountered.

---

## Quality Warnings

Report these as **Warning** — tests run but coverage or reliability is degraded.

### Missing negative test cases

Every function that can fail, throw, return `$null`, or return `$false` should have at least one test for each failure path. Flag any `Describe` block where all `It` blocks only exercise the success path:

- No `Should -Throw` or `-Not -Throw`
- No null/empty input test
- No boundary value test (0, -1, `[int]::MaxValue`, empty string, empty array)

### Dot-sourcing or importing inside `It` blocks

```powershell
# BAD — re-imports the module on every single test; slow and stateful
It 'does something' {
    Import-Module .\MyModule.psd1 -Force
    Get-Widget -Id 1 | Should -Not -BeNullOrEmpty
}
```

Module loading belongs in `BeforeAll` at the `Describe` level.

### `BeforeAll` used where `BeforeEach` is needed

```powershell
# WRONG INTENT — object is shared across all Its; mutations from one test affect the next
Describe 'Update-Widget' {
    BeforeAll { $script:widget = [PSCustomObject]@{ Id = 1; Name = 'A' } }
    It 'updates the name' { Update-Widget -Widget $script:widget -Name 'B'; $script:widget.Name | Should -Be 'B' }
    It 'does not change the Id' { $script:widget.Id | Should -Be 1 }  # may fail if prior It mutated it
}

# CORRECT — fresh object per test
Describe 'Update-Widget' {
    BeforeEach { $widget = [PSCustomObject]@{ Id = 1; Name = 'A' } }
    ...
}
```

### Overly broad mocks hiding real failures

```powershell
# BAD — swallows all errors and hides whether real code paths are exercised
Mock Invoke-RestMethod { }
Mock Write-Error { }

# BETTER — mock only what you're controlling; let unexpected calls surface as failures
Mock Invoke-RestMethod -ParameterFilter { $Uri -eq $expectedUri } -MockWith { $fakeResponse }
```

### Magic literals without explanation

```powershell
# BAD — why 42? what does 'PENDING' mean?
$result | Should -Be 42
$result.Status | Should -Be 'PENDING'

# BETTER
$seedDataCount = 42
$result | Should -Be $seedDataCount -Because 'the seed fixture contains exactly 42 records'
```

### `It` descriptions that name implementation instead of behavior

| Avoid | Prefer |
|---|---|
| `'calls Invoke-RestMethod'` | `'returns an error when the API is unreachable'` |
| `'sets the flag to true'` | `'marks the widget as processed after sync'` |
| `'test 1'` | `'returns $null when the widget ID does not exist'` |

`It` descriptions should complete the sentence: *"It [description]"* — readable, behavioral, no implementation details.

### Tests that always pass

```powershell
# Always passes — $null -eq $null is $true
Describe 'Get-Widget' {
    BeforeAll { $result = Get-Widget -Id 1 }  # $result is $null in It scope
    It 'is not null' { $result | Should -Not -BeNullOrEmpty }  # passes for wrong reasons
}
```

Look for assertions on variables that are `$null` due to the `BeforeAll` scope issue — they may be vacuously true.

---

## Coverage Gaps

Cross-reference the test file against the source to identify untested surface area:

1. List public exports: `Get-Command -Module <name>` or scan for `function` declarations
2. List `Describe` block names in the test file
3. Flag exports with no corresponding `Describe`
4. Within each tested function, check for missing scenarios:

| Scenario type | Example |
|---|---|
| Error / exception path | What happens if a required parameter is `$null`? |
| Empty collection input | `@()`, empty string, empty hashtable |
| Boundary values | `0`, `-1`, `[int]::MaxValue`, very long string |
| Permission failure | What if the file/registry key is read-only? |
| Dependency failure | What if the mocked API throws? |

---

## Output Format

Structure findings as:

```
## Breaking Issues
- [File.Tests.ps1:42] `Assert-MockCalled` must be replaced with `Should -Invoke`
- [Describe: Get-Widget] `$result` assigned in `BeforeAll` used in `It` without `$script:` — will be $null

## Warnings
- [Describe: Invoke-Sync] No negative test cases — missing error path, null input, and API failure scenario
- [Describe: Export-Report] `BeforeAll` creates shared `$script:report` object; mutations in one `It` affect siblings
- [It: 'processes the payload'] Magic literal `'PENDING'` — add a named variable with `-Because`

## Suggestions
- [Describe: Get-Widget, Describe: Remove-Widget] Split into `-Tag 'Unit'` and `-Tag 'Integration'` groups
- [File] Consider `InModuleScope` for the private `Format-InternalRecord` helper — currently untestable

## Coverage Gaps
- `Remove-Widget` — no Describe block found
- `Get-Widget` — success path only; missing: negative ID, non-existent ID, null input

## Summary
2 breaking, 3 warnings, 2 suggestions. ~60% of exported functions have test coverage.
```
