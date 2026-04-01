# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [2.2.0] - 2026-04-01

### Added
- Batch processing support via `batchProcess` function
- Retry utility with configurable attempts and backoff delay

### Fixed
- Use `TypeError` instead of generic `Error` for invalid input
  in validator

## [2.1.0] - 2026-02-20

### Added
- Data validation pipeline
- Transform step with timestamps

### Fixed
- Array type checking in validator

## [2.0.0] - 2026-01-10

### Changed
- Complete rewrite of processing engine
- New API surface (breaking)

[Unreleased]: https://github.com/test/data-processor/compare/v2.2.0...HEAD
[2.2.0]: https://github.com/test/data-processor/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/test/data-processor/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/test/data-processor/releases/tag/v2.0.0
