---
name: pester-write
description: Write Pester 5 tests for PowerShell functions, modules, scripts, DSC resources, or classes.
allowed-tools: PowerShell(*), Bash(find *), Bash(git diff *), Bash(git log *)
---

# Pester 5 Test Writer

Write behavior-focused, isolated Pester 5 tests.

## Workflow

1. **Inspect the public behavior.** Read the source and related tests, and identify exported functions, inputs, observable outcomes, dependencies, and error paths. Record which success, failure, boundary, null/empty, permission, and dependency-failure categories are applicable or inapplicable for each requested behavior. Complete when each requested behavior has that scenario list.
2. **Choose test placement and isolation.** Follow the repository's existing test layout. Load a script or module once in top-level `BeforeAll`; use `BeforeEach` for mutable fixtures, `TestDrive:` for filesystem behavior, and mocks only for external dependencies. Complete when tests cannot depend on execution order or host state.
3. **Implement one behavior at a time.** Give every `It` a behavioral sentence. Exercise a representative success path and each applicable failure, boundary, null, empty-input, permission, or dependency-failure path. Complete when the scenario list is covered by observable assertions.
4. **Use Pester 5 semantics.** Assert mock interactions with `Should -Invoke`; use `$script:` only for fixture state that must cross from `BeforeAll` into `It`; use `InModuleScope` only when the required behavior is private-module behavior. Complete when no v4-only assertion or scope assumption remains.
5. **Verify the requested scope.** Run the focused test file first, then report the observed result. Complete when the test passes or the failure is reported with its cause.

## Conditional reference

Before implementing a test involving filesystem, REST, credentials, DSC, classes, pipelines, errors or output, dates, `ShouldProcess`, environment variables, exports, private members, external fixtures, or unavailable external modules, load the matching numbered section in `pester-patterns/references/patterns.md`. When selecting a mock form, load its **Mock cheat sheet**. That file is the sole recipe authority.
