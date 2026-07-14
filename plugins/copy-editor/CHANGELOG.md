# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `copy-edit`: the "Forbidden Characters" rule was unfollowable — every banned
  character had been flattened to ASCII, making it byte-identical to its own
  prescribed replacement (the rule read "never use `--`, use `--` instead").
  Restored the smart quotes and em dash, and anchored each to its Unicode
  codepoint so a future de-smart-quoting pass cannot silently break it again.

## [1.0.1] - 2026-05-10

### Changed

- Tightened `copy-edit` skill description for sharper trigger matching

## [1.0.0] - 2026-04-26

### Added

- `/copy-edit` skill for writing, editing, and polishing content
  while preserving Gilbert's voice across blogs, emails, LinkedIn,
  Bluesky, social replies, and newsletters
