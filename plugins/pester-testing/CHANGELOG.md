# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.1] - 2026-05-10

### Changed

- Tightened skill descriptions across `pester-write`, `pester-review`,
  `pester-run`, and `pester-patterns` for sharper trigger matching
- Extracted detailed `pester-patterns` recipes into
  `references/patterns.md`, leaving the SKILL.md as a slim index that
  loads the references on demand (progressive disclosure)

## [1.4.0] - 2026-05-04

### Changed

- Pre-commit hook prints a skip message when no PowerShell files are
  staged or when Pester 5 is not installed
- Pre-commit hook surfaces specific per-failure reasons instead of a
  generic blocked message

## [1.3.0] - 2026-05-04

### Added

- Pre-commit logic extracted to `hooks/pre-commit-pester.ps1` with
  matching Pester tests (`hooks/pre-commit-pester.Tests.ps1`)
- `$schema` reference in plugin manifest for editor validation

### Changed

- Pre-commit hook scoped to staged `*.ps1` files only (previously ran
  the full suite unconditionally)
- Pre-commit hook exits with code 2 (the documented blocking signal)
  instead of code 1
- `pester-run` skill and `/pester` command use direct property
  assignment (`$cfg.Run.PassThru = $true`) — `.Value` setters are
  read-only on Pester 5.7+ option types

### Removed

- `pester-file-watcher` monitor (superseded by the `FileChanged` hook)

## [1.2.0] - 2026-05-02

### Added

- `userConfig` settings prompted at enable time: `coverageThreshold`
  (0–100, default 80) and `psesPath` (optional path to PowerShell
  Editor Services)
- PowerShell Editor Services LSP integration via stdio — provides
  PSScriptAnalyzer diagnostics and Pester 5 code lens across `.ps1`,
  `.psm1`, `.psd1`
- `FileChanged` hook that re-runs tests when a `*.Tests.ps1` file is
  modified
- Code coverage section in the `pester-run` skill that respects
  `coverageThreshold`

## [1.0.0] - 2026-04-24

### Added

- `/pester-write` skill for writing Pester 5 tests in PowerShell
- `/pester-review` skill for auditing existing Pester test suites
- `/pester-run` skill (`/pester` command) for running tests with
  agent-optimized output (failures and summary only)
- Glenn agent for strategic testing guidance
- Pre-commit hook that blocks commits when Pester tests fail
