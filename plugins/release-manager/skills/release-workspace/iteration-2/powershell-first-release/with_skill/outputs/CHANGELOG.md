# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-04-01

### Added

- `Get-CloudResource` function for retrieving cloud resources
  by name.
- `New-CloudResource` function for creating cloud resources
  with name, type, and tags.
- `Remove-CloudResource` function with `-Force` safety prompt
  to prevent accidental deletions.
- Basic Pester tests for module functionality.
