---
name: pester-review
description: Review Pester 5 tests for compatibility, behavioral quality, and source-to-test coverage gaps.
allowed-tools: PowerShell(*), Bash(find *), Bash(git diff *)
---

# Pester 5 Test Reviewer

Assess whether Pester tests provide reliable behavioral confidence.

## Review workflow

1. **Establish the tested surface.** Read each supplied test with its source and, for modules, enumerate public exports. Classify every public export or supplied script entry behavior against named `It` coverage or as intentionally out of scope. Complete when every relevant behavior is classified as tested, untested, or intentionally out of scope.
2. **Check Pester 5 compatibility.** Find the compatibility risks in the reference below. Complete when every applicable migration risk is classified as breaking or cleanup.
3. **Assess behavioral quality.** Check that `It` names describe outcomes, fixtures are isolated, mocks do not hide the behavior under test, and assertions cover success plus applicable error, null, empty, boundary, permission, and dependency-failure behavior. Complete when every material confidence gap is recorded.
4. **Report once by impact.** Use Breaking Issues, Warnings, Suggestions, Coverage Gaps, and Summary. Cite the test behavior or source behavior for each finding. Complete when compatibility risks, quality concerns, and coverage gaps have all been considered.

## Compatibility reference

- `Assert-MockCalled` is removed; use `Should -Invoke`.
- Values created in `BeforeAll` and needed in `It` require `$script:` scope or a `BeforeEach` fixture.
- Context-local mocks do not flow to sibling `Context` blocks; shared mocks belong at the appropriate enclosing scope.
- `param(...)` in `-ParameterFilter` is vestigial cleanup, not a Pester 5 runtime failure.
- Treat a test which can pass only because a value is `$null` as unreliable.

Keep the assessment focused on Pester tests. Report proposed tests as coverage gaps rather than implementing them.