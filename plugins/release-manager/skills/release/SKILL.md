---
name: release
description: Release a project by classifying changes, updating its changelog and version manifests, and committing the release.
allowed-tools: Bash(git log *), Bash(git diff *), Bash(git add *), Bash(git commit *), Bash(git status *), Bash(git checkout *), Bash(git branch *), Bash(gh pr *)
---

# Release Manager

Prepare a versioned release using Keep a Changelog and Semantic Versioning.

## Workflow

1. **Identify release inputs.** Read the existing changelog, all relevant version manifests, and commits since the last released version. Complete when the release baseline and affected package manifests are known.
2. **Classify the change.** Use SemVer: major for incompatible published-interface changes, minor for backward-compatible features, and patch for backward-compatible fixes. Apply **Version rules**. When evidence is ambiguous, state the evidence and ask for the release decision. Complete when a single version is selected.
3. **Update release records.** Move release entries from `## [Unreleased]` into a new `## [version] - YYYY-MM-DD` section, retain `Unreleased` for future changes, and apply **Changelog rules**. Complete when every released manifest version and changelog entry agree.
4. **Validate the release material.** Read the final changelog section and manifests, then run repository-documented validation relevant to changed release files; when no validation is documented, record that fact. Complete when the observed output supports the release contents.
5. **Commit and publish the release change.** Stage only the release files, commit with the release version, then create or update the release PR if requested. Complete when the commit and requested PR state are reported.

## Version rules

From the established released version, increment exactly one selected SemVer component and reset lower components. Use prerelease or build identifiers only when established project conventions or an explicit user request require them.

## Manifest recognition

Recognise `package.json`, PowerShell module manifests, `pyproject.toml`, `Cargo.toml`, and `.csproj` version fields. If several release units are present, establish which package is being released before changing any version.

## Changelog rules

Keep a Changelog entries use Added, Changed, Deprecated, Removed, Fixed, and Security as applicable. A major release may include Removed; a patch release uses Fixed and Security only. Preserve manual edits and existing comparison-link conventions.
