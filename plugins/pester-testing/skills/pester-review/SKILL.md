---
name: pester-review
description: Review Pester 5 tests for compatibility, behavioral quality, and source-to-test coverage gaps.
allowed-tools: PowerShell(*), Bash(find *), Bash(git diff *)
---

# Pester 5 Test Reviewer

Assess whether Pester tests provide reliable behavioral confidence.

## Review workflow

1. **Establish the tested surface.** Read each supplied test with its source and, for modules, enumerate public exports. Classify every public export or supplied script entry behavior against named `It` coverage or as intentionally out of scope. Complete when every relevant behavior is classified as tested, untested, or intentionally out of scope.
2. **Check Pester 5 compatibility.** Review every applicable migration category in the reference below. Classify each as breaking, deprecated cleanup, or not applicable. Complete when no applicable category is unclassified.
3. **Assess behavioral quality.** Check that `It` names describe outcomes, fixtures are isolated, mocks do not hide the behavior under test, and assertions cover success plus applicable error, null, empty, boundary, permission, and dependency-failure behavior. Complete when every material confidence gap is recorded.
4. **Report once by impact.** Use Breaking Issues, Warnings, Suggestions, Coverage Gaps, and Summary. Cite the test behavior or source behavior for each finding. Complete when compatibility risks, quality concerns, and coverage gaps have all been considered.

## Pester 4-to-5 compatibility reference

- **Discovery and run:** Test code belongs in `It`, `BeforeAll`, `BeforeEach`, `AfterAll`, or `AfterEach`; code directly in a `Describe`, `Context`, or file runs during Discovery. Pass Discovery-time data to tests with `-ForEach` or `-TestCases`; `BeforeAll` values are unavailable while these are evaluated.
- **Fixtures and paths:** `BeforeAll` shares setup with child tests, including unscoped values. Use `BeforeEach` when each test needs an isolated mutable fixture. Use `$PSCommandPath` or `$PSScriptRoot`, not `$MyInvocation.MyCommand.Path`, to locate tested code.
- **Mocks:** Mock scope and invocation count follow placement rather than the entire enclosing `Describe` or `Context`; sibling contexts do not share a context-local mock. `param(...)` in `-ParameterFilter` is vestigial cleanup, not a runtime failure.
- **Mock assertions:** `Assert-MockCalled` and `Assert-VerifiableMock` are deprecated; recommend `Should -Invoke` and `Should -InvokeVerifiable` as cleanup. `Assert-VerifiableMocks` is removed.
- **Assertions and test state:** Legacy `Should Be` syntax is removed; use `Should -Be`. `Should -Throw` matches messages with `-like`, so partial messages require wildcards. Treat assertions that can pass only because a value is `$null` as unreliable.
- **Runner interface:** Prefer `New-PesterConfiguration` or the Pester 5 simple parameters. The legacy `Invoke-Pester` parameter set is deprecated and has compatibility limits; `-PesterOption` and `-Show` are removed, `-TestName` becomes `-FullNameFilter`, and `-Script` becomes path-only `-Path`.
- **Removed or constrained features:** Gherkin is removed; `TestDrive` exists only during Run and cannot populate `-ForEach`; `Set-ItResult -Pending` is deprecated; automatic `-CI` code coverage is disabled, so configure coverage explicitly; PowerShell 2 and `-Strict` are unsupported.

Keep the assessment focused on Pester tests. Report proposed tests as coverage gaps rather than implementing them.