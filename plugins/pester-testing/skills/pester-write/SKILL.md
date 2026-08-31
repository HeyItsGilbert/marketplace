---
name: pester-write
description: Write Pester 5 tests for PowerShell functions, modules, scripts, DSC resources, or classes.
allowed-tools: PowerShell(*), Bash(find *), Bash(git diff *), Bash(git log *)
---

# Pester 5 Test Writer

Write behavior-focused, isolated Pester 5 tests.

## Workflow

1. **Inspect the public behavior.** Read the source and related tests, and identify exported functions, inputs, observable outcomes, dependencies, and error paths. Complete when each requested behavior has a scenario list.
2. **Choose test placement and isolation.** Follow the repository's existing test layout. Load a script or module once in top-level `BeforeAll`; use `BeforeEach` for mutable fixtures, `TestDrive:` for filesystem behavior, and mocks only for external dependencies. Complete when tests cannot depend on execution order or host state.
3. **Implement one behavior at a time.** Give every `It` a behavioral sentence. Exercise a representative success path and each applicable failure, boundary, null, empty-input, permission, or dependency-failure path. Complete when the scenario list is covered by observable assertions.
4. **Use Pester 5 semantics.** Assert mock interactions with `Should -Invoke`; use `$script:` only for fixture state that must cross from `BeforeAll` into `It`; use `InModuleScope` only when the required behavior is private-module behavior. Complete when no v4-only assertion or scope assumption remains.
5. **Verify the requested scope.** Run the focused test file first, then report the observed result. Complete when the test passes or the failure is reported with its cause.

## Conditional reference

For a detailed recipe or assertion example, load only the relevant numbered section or mock cheat sheet in `pester-patterns/references/patterns.md`. That reference is the sole recipe authority; do not copy its templates into this workflow.

## Completion checklist

- The test observes public behavior rather than implementation plumbing.
- Test names explain the behavior and failures diagnose it.
- Mocks isolate dependencies without replacing the behavior under test.
- The test uses the project's existing layout and passes at the requested scope.
