# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-05-03

### Added

- `pester-testing` plugin: `userConfig` settings prompted at enable
  time — `coverageThreshold` (0–100, default 80) and `psesPath`
  (optional) for PowerShell Editor Services
- `pester-testing` plugin: PowerShell Editor Services LSP integration
  via stdio — provides PSScriptAnalyzer diagnostics and Pester 5 code
  lens across `.ps1`, `.psm1`, `.psd1`
- `pester-testing` plugin: `FileChanged` hook that re-runs tests when
  a `*.Tests.ps1` file is modified
- `pester-testing` plugin: code coverage section in the `pester-run`
  skill that respects `coverageThreshold`
- `pester-testing` plugin: pre-commit hook extracted to a testable
  PowerShell script (`hooks/pre-commit-pester.ps1`) with matching
  Pester tests
- `$schema` reference in plugin manifests for editor validation
  (`code-review-team`, `copy-editor`, `presentation-review`,
  `release-manager`, `static-site-tools`)
- Hooks convention in CLAUDE.md: prefer PowerShell scripts with
  matching Pester tests

### Changed

- `pester-testing` plugin: pre-commit hook now scopes to staged
  `*.ps1` files and exits with code 2 (the documented blocking
  signal) instead of code 1
- `pester-testing` plugin: `pester-run` skill and `/pester` command
  use direct property assignment (`$cfg.Run.PassThru = $true`)
  — `.Value` setters are read-only on Pester 5.7+ option types

### Removed

- `pester-testing` plugin: redundant `pester-file-watcher` monitor
  (superseded by the `FileChanged` hook)

## [1.0.0] - 2026-04-29

### Added

- `copy-editor` plugin: `/copy-edit` skill for writing, editing, and
  polishing content while preserving Gilbert's voice across blogs,
  emails, LinkedIn, Bluesky, social replies, and newsletters
- `static-site-tools` plugin: `/og-image-design` skill for Open Graph
  and social sharing image design with platform specs and HTML templates
- `code-review-team` plugin: `/team-review` command for seven-perspective
  parallel code review (Jordan B., Sage, Brent, Chip, DualCore,
  Shawn Wee!-ler, Glenn)
- `pester-testing` plugin: `/pester-write`, `/pester-review`, and
  `/pester-run` skills for writing, auditing, and running Pester 5 tests
  in PowerShell; includes Glenn agent for strategic testing guidance and
  a pre-commit hook that blocks commits with failing tests
- `architecture-decisions` plugin: `/adr` and `/rfc` skills for creating
  and managing Architecture Decision Records and Requests for Comments
  committed to the repo
- `release-manager` plugin: `/release` skill for updating CHANGELOG.md
  and bumping project versions following Keep a Changelog and SemVer
- `presentation-review` plugin: `/death-by-ppt` skill for reviewing MARP
  presentations against Death by PowerPoint principles

[Unreleased]: https://github.com/HeyItsGilbert/marketplace/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/HeyItsGilbert/marketplace/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/HeyItsGilbert/marketplace/releases/tag/v1.0.0
