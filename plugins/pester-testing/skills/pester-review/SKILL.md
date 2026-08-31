---
name: pester-review
description: Review Pester 5 tests for compatibility, behavioral quality, and source-to-test coverage gaps.
allowed-tools: PowerShell(*), Bash(find *), Bash(git diff *)
---

# Pester 5 Test Reviewer

Assess whether Pester tests provide reliable behavioral confidence.

## Review workflow

1. **Establish the tested surface.** Read each supplied test with its source and, for modules, enumerate public exports. Complete when every relevant exported behavior is accounted for as tested, untested, or intentionally out of scope.
2. **Check Pester 5 compatibility.** Find removed `Assert-MockCalled`, `BeforeAll` variables consumed without `$script:`, mocks that rely on v4 scope leakage, and vestigial parameter-filter syntax. Complete when every applicable migration risk is classified as breaking or cleanup.
3. **Assess behavioral quality.** Check that `It` names describe outcomes, fixtures are isolated, mocks do not hide the behavior under test, and assertions cover success plus applicable error, null, empty, boundary, permission, and dependency-failure behavior. Complete when every material confidence gap is recorded.
4. **Report once by impact.** Use Breaking Issues, Warnings, Suggestions, Coverage Gaps, and Summary. Cite the test behavior or source behavior for each finding. Complete when compatibility risks, quality concerns, and coverage gaps have all been considered.

## Compatibility reference

- Replace `Assert-MockCalled` with `Should -Invoke`.
- Keep module loading outside `It` blocks.
- Use `BeforeEach` for mutable fixtures shared by no test.
- Treat a test which can pass only because a value is `$null` as unreliable.

Keep the assessment focused on Pester tests. Do not create new tests unless the user asks for implementation.