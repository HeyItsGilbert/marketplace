---
name: pester-write
description: Write Pester 5 test files for PowerShell functions, modules, scripts, DSC resources, or classes. Use when the user asks to write tests, add test coverage, create a test file, scaffold *.Tests.ps1, or generate Pester specs. Also activate when asked to test a specific function, cover an edge case, write a mock, add unit tests, add integration tests, or test a changed function. Trigger phrases include "write Pester tests", "add tests for", "create a test file", "test coverage", "unit tests for", "mock this dependency", "Pester spec", "test this function", "scaffold tests". PROACTIVELY suggest writing tests when the user adds or modifies a PowerShell function or module without updating a corresponding test file. Works with any PowerShell project type: modules (.psm1/.psd1), standalone scripts (.ps1), DSC resources, Azure Functions, or class-based modules. Both Windows PowerShell 5.1 and PowerShell 7+ are supported. Do NOT use for: running tests (use pester-run), reviewing existing test quality (use pester-review), CI/CD test pipeline configuration, or non-Pester frameworks.
allowed-tools: Bash(pwsh *), Bash(powershell *), Bash(find *), Bash(git diff *), Bash(git log *)
---

# Pester 5 Test Writer

Write well-structured, idiomatic Pester 5 tests for PowerShell code.

## Efficiency Guidelines

- Read the source file and any existing test file in parallel before writing a single line.
- Use `git diff HEAD` to identify recently changed functions when adding coverage for new code — target those first.
- To enumerate a module's exported functions without reading every source line:
  `pwsh -Command "Import-Module .\<name>.psd1 -Force; Get-Command -Module <name> | Select-Object Name"`
- Write all tests for a function in one pass — avoid multiple small edits to the same file.

## File Naming and Placement

| Source file | Test file |
|---|---|
| `Get-Widget.ps1` | `Get-Widget.Tests.ps1` |
| `MyModule.psm1` | `MyModule.Tests.ps1` |
| `src/Invoke-Deploy.ps1` | `tests/Invoke-Deploy.Tests.ps1` |

Place test files adjacent to source files in small projects. Use a mirrored `tests/` directory for modules with many functions.

## Top-Level Structure

Every test file follows this skeleton:

```powershell
BeforeAll {
    # Import the module or dot-source the script exactly once, here.
    . $PSCommandPath.Replace('.Tests.ps1', '.ps1')          # for scripts
    Import-Module (Join-Path $PSScriptRoot '../MyModule.psd1') -Force  # for modules
}

Describe 'Get-Widget' -Tag 'Unit' {
    Context 'when the widget ID is valid' {
        It 'returns the expected widget object' {
            $result = Get-Widget -Id 42
            $result.Id | Should -Be 42
            $result.Name | Should -Not -BeNullOrEmpty
        }
    }

    Context 'when the widget ID is negative' {
        It 'throws an ArgumentException' {
            { Get-Widget -Id -1 } | Should -Throw -ExceptionType ([System.ArgumentException])
        }
    }
}

AfterAll {
    Remove-Module MyModule -ErrorAction SilentlyContinue
}
```

**Rules:**
- `BeforeAll` at the top level handles all module/script loading. Never dot-source inside `It` blocks.
- `AfterAll` at the top level unloads modules to prevent pollution across test runs.
- One `Describe` block per public function or coherent behavior group.
- Use `Context` to differentiate input scenarios, states, or code paths.

## Block Lifecycle

| Block | Runs | Variables visible in `It` |
|---|---|---|
| `BeforeAll` | Once before all `It` in its container | Only with `$script:` scope |
| `BeforeEach` | Before every `It` in its container | Yes — same scope as `It` |
| `AfterEach` | After every `It` in its container | Yes |
| `AfterAll` | Once after all `It` in its container | `$script:` only |

**Critical Pester 5 scoping rule:** Variables assigned in `BeforeAll` are NOT automatically visible inside `It` blocks. Use `$script:` to bridge them:

```powershell
Describe 'Get-Widget' {
    BeforeAll {
        $script:baseline = Get-Widget -Id 1  # shared fixture
    }

    It 'has the expected name' {
        $script:baseline.Name | Should -Be 'Sprocket'
    }
}
```

Alternatively, define the variable in `BeforeEach` — those variables share scope with the `It` block that follows:

```powershell
BeforeEach {
    $widgetId = New-TestWidgetId  # visible inside the It block below
}
It 'accepts the generated ID' {
    Get-Widget -Id $widgetId | Should -Not -BeNullOrEmpty
}
```

## Mocking

Mocks in Pester 5 are scoped to the block in which they are defined and its children. Define shared mocks at the `Describe` level in `BeforeAll`; define scenario-specific overrides at the `Context` level.

```powershell
Describe 'Invoke-WidgetSync' {
    BeforeAll {
        Mock Invoke-RestMethod { return [PSCustomObject]@{ status = 'ok'; id = 1 } }
        Mock Write-Error {}  # silence error output in all contexts
    }

    Context 'when the upstream API returns an error' {
        BeforeAll {
            Mock Invoke-RestMethod { throw 'Service unavailable' }  # overrides outer mock
        }

        It 'calls Write-Error exactly once' {
            Invoke-WidgetSync -Id 1
            Should -Invoke Write-Error -Times 1 -Exactly
        }

        It 'does not re-throw to the caller' {
            { Invoke-WidgetSync -Id 1 } | Should -Not -Throw
        }
    }

    Context 'when the API succeeds' {
        It 'does not call Write-Error' {
            Invoke-WidgetSync -Id 1
            Should -Invoke Write-Error -Times 0
        }

        It 'invokes the REST endpoint with the correct URI' {
            $expectedUri = 'https://api.example.com/widgets/1'
            Invoke-WidgetSync -Id 1
            Should -Invoke Invoke-RestMethod -Times 1 -Exactly `
                -ParameterFilter { $Uri -eq $expectedUri }
        }
    }
}
```

### Should -Invoke reference

| Parameter | Purpose |
|---|---|
| `-CommandName <name>` | Mocked command to assert against |
| `-Times <n>` | Expected call count (at least n, unless `-Exactly`) |
| `-Exactly` | Count must be precisely n |
| `-ParameterFilter { ... }` | Assert only calls matching this condition |
| `-Scope <block>` | Limit assertion to a specific block scope |

`Assert-MockCalled` is removed in Pester 5. Always use `Should -Invoke`.

### Parameter filters

Pester 5 no longer requires `param()` in `-ParameterFilter` — use bound parameter names directly:

```powershell
Mock Get-Content -ParameterFilter { $Path -eq 'C:\config.json' } `
    -MockWith { '{"key":"value"}' }
Mock Get-Content  # fallback mock for all other paths
```

Use `$PesterBoundParameters` (Pester 5.2+) when you need to inspect which parameters were actually bound vs. defaulted inside a mock scriptblock.

## InModuleScope

Use `InModuleScope` to test private (unexported) functions or to mock commands called from within a module's internal scope:

```powershell
Describe 'MyModule internals' {
    BeforeAll {
        Import-Module .\MyModule.psd1 -Force
    }

    InModuleScope MyModule {
        It 'calls the private helper with the correct argument' {
            Mock Invoke-InternalHelper { return 'mocked' }
            Get-ProcessedData -Input 'test'
            Should -Invoke Invoke-InternalHelper -Times 1 -Exactly `
                -ParameterFilter { $Value -eq 'test' }
        }

        It 'can access the private function directly' {
            $result = Format-InternalData -Raw 'abc'
            $result | Should -Be 'ABC'
        }
    }
}
```

## TestDrive

`TestDrive:` is a per-container PSDrive for isolated filesystem operations. Items created in a `Describe` block persist through its `Context` children; items created inside a `Context` are cleaned up when that context exits. The entire drive is removed after the container finishes.

```powershell
Describe 'Export-Report' {
    It 'creates the CSV file at the specified path' {
        $output = 'TestDrive:\report.csv'
        Export-Report -Path $output -Data @('row1', 'row2')
        $output | Should -Exist
        (Import-Csv $output) | Should -HaveCount 2
    }

    It 'overwrites an existing file without error' {
        Set-Content 'TestDrive:\old.csv' 'stale data'
        { Export-Report -Path 'TestDrive:\old.csv' -Data @('new') } | Should -Not -Throw
        Get-Content 'TestDrive:\old.csv' | Should -Be 'new'
    }
}
```

Use `TestDrive:\path` with PowerShell cmdlets. Use `$TestDrive\path` (resolves to the real temp path) when calling .NET APIs or external executables that don't understand PSDrives.

`TestRegistry:` works identically for Windows registry keys — use `TestRegistry:\` for isolated registry operations.

## Tags

Apply tags at `Describe`, `Context`, or `It` level. Tags inherit downward.

```powershell
Describe 'Get-Widget' -Tag 'Unit' {
    It 'returns fast' -Tag 'Smoke' { ... }
    It 'reads from the database' -Tag 'Integration' { ... }
}
```

Recommended tag conventions:

| Tag | Meaning |
|---|---|
| `Unit` | No external dependencies; runs in <1s |
| `Integration` | Requires network, filesystem, DB, or external services |
| `Smoke` | Minimal happy-path set for fast CI gates |
| `Slow` | Expected to take >1s per test |

## Should Assertion Reference

```powershell
$v | Should -Be 'expected'                  # case-insensitive equality
$v | Should -BeExactly 'Expected'           # case-sensitive equality
$v | Should -BeGreaterThan 5
$v | Should -BeLessOrEqual 10
$v | Should -BeTrue
$v | Should -BeFalse
$v | Should -BeNullOrEmpty
$v | Should -BeOfType [DateTime]
$v | Should -BeEquivalentTo $expected       # deep object comparison
$a | Should -Contain 'item'
$a | Should -HaveCount 3
$a | Should -BeIn @('a', 'b', 'c')
$p | Should -Exist                          # path exists
$s | Should -Match 'regex'                  # case-insensitive regex
$s | Should -MatchExactly '^exact$'         # case-sensitive regex
{ expr } | Should -Throw
{ expr } | Should -Throw -ExceptionType ([System.IO.IOException])
{ expr } | Should -Not -Throw

# -Not negates any assertion:
$v | Should -Not -Be 'wrong'
$a | Should -Not -Contain 'absent'

# -Because adds a custom failure message:
$v | Should -Be 42 -Because 'the seed dataset has exactly 42 items'
```

## Test File Checklist

Before finalizing a test file:

- [ ] `BeforeAll` at the top level imports the module or dot-sources the script
- [ ] No module imports or dot-sourcing inside `It` blocks
- [ ] Shared fixture state uses `$script:` scope or `BeforeEach`
- [ ] All mock assertions use `Should -Invoke` (not `Assert-MockCalled`)
- [ ] Each `It` description reads as a sentence: `It 'returns $null when the user is not found'`
- [ ] At least one negative test per function (invalid input, error path, null/empty)
- [ ] Filesystem tests use `TestDrive:`, not `$env:TEMP` or literal paths
- [ ] Private function tests are inside `InModuleScope`
- [ ] Tags applied — at minimum `Unit` or `Integration`
- [ ] `AfterAll` unloads the module if it was imported
