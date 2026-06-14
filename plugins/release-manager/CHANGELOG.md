# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-06-13

### Added

- CHANGELOG section-name enforcement by release type: patch releases
  are restricted to `Fixed` and `Security`; minor releases add
  `Added`, `Changed`, `Deprecated`; major releases also allow
  `Removed`; non-standard headings (`Docs`, `Chore`, `Misc`, etc.)
  are blocked entirely
- Post-draft validation step: after writing a changelog entry the
  skill scans every `###` heading and confirms compliance before
  committing
- Patch-release warning when `feat:` / `Added` commits appear in a
  patch entry, prompting a minor-bump or collapsing under `### Fixed`

## [1.0.1] - 2026-05-10

### Changed

- Tightened `release` skill description for sharper trigger matching

## [1.0.0] - 2026-04-01

### Added

- `/release` skill for updating `CHANGELOG.md` and bumping project
  version manifests following Keep a Changelog and Semantic
  Versioning
- Eval workspace with test cases and grading results for iterating on
  skill quality

### Fixed

- Version bump logic and changelog format handling
