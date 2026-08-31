---
name: pester-patterns
description: Ready-to-use Pester 5 recipes for common PowerShell testing scenarios.
disable-model-invocation: true
allowed-tools:
  - PowerShell(*)
---

# Pester 5 Test Patterns and Recipes

Use this user-invoked reference to find a focused Pester 5 recipe. For running tests, use `pester-run`; this skill does not define execution modes.

## Pattern index

Detailed patterns live in `references/patterns.md`. Load only the relevant section.

| Pattern | Use for |
| --- | --- |
| 1. Mock filesystem | File reads, writes, paths, and `TestDrive:` |
| 2. Mock REST APIs | `Invoke-RestMethod`, `Invoke-WebRequest`, and pagination |
| 3. Mock credentials | `PSCredential` and `SecureString` |
| 4. DSC resources | Class-based and MOF-based DSC resources |
| 5. PowerShell classes | Constructors, methods, and overrides |
| 6. Pipeline functions | Pipeline-bound parameters |
| 7. Errors and warnings | Error, warning, and verbose streams |
| 8. Dates and times | `Get-Date` and time-dependent behavior |
| 9. ShouldProcess | `-WhatIf` and `-Confirm` |
| 10. Environment variables | Setting and restoring `$env:` |
| 11. Module exports | Public and private function exposure |
| 12. Private functions | Module-scope invocation |
| 13. External fixtures | Loading complex fixture data from disk |
| 14. Unavailable external modules | Stubbing and mocking optional module commands |
| Mock cheat sheet | Selecting the appropriate mock form |

The reference is authoritative for recipe details. Apply the recipe to the requested behavior rather than copying an example blindly.