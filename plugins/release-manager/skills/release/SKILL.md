---
name: release
description: Prepare a release for a version bump, a hotfix, a first stable 1.0.0, or SemVer normalization.
allowed-tools: Bash(git log *), Bash(git diff *), Bash(git add *), Bash(git commit *), Bash(git status *), Bash(git checkout *), Bash(git branch *), Bash(gh pr *)
---

# Release Manager

Prepare a versioned release using Keep a Changelog and Semantic Versioning.

## Workflow

1. **Identify release inputs.** Read the existing changelog when present, all relevant version manifests, and commits since the most recent release recorded in the changelog. For a first release, use the repository's initial commit as the baseline. Complete when the baseline and every affected package manifest are known.
2. **Classify the change.** Apply **Version rules** to select one release version. When the history and diffs leave the change ambiguous, state the evidence and ask for the release decision. Complete when one version is selected.
3. **Update release records.** Create a Keep a Changelog header and `## [Unreleased]` when no changelog exists; otherwise add `## [Unreleased]` when it is absent. Move released entries into `## [version] - YYYY-MM-DD` below `Unreleased`, apply **Changelog rules**, and update every released manifest. Complete when the new changelog entry and all released manifest versions agree.
4. **Validate the release material.** Read the final changelog section and manifests, then run repository-documented validation relevant to changed release files; when no validation is documented, record that fact. Complete when the observed output supports the release contents.
5. **Commit and publish the release change.** Stage only release files, commit with the release version, then create or update the release PR if requested. Complete when the commit and requested PR state are reported.

## Version rules

- Normalize a non-SemVer manifest version to `MAJOR.MINOR.PATCH` before selecting the release version; for example, normalize `1.2.3.0` to `1.2.3`.
- When a pre-1.0 project is explicitly making its first stable release, select `1.0.0`.
- Otherwise, select MAJOR for incompatible published-interface changes, MINOR for backward-compatible features, and PATCH for backward-compatible fixes. Read diffs when commit messages do not establish the change type.
- Increment exactly the selected component from the normalized released version and reset lower components. Use prerelease or build identifiers only when established project conventions or an explicit user request require them.

## Manifest recognition

Recognise `package.json`, PowerShell module manifests, `pyproject.toml`, `Cargo.toml`, and `.csproj` version fields. If several release units are present, establish which package is being released before changing any version.

## Changelog rules

Keep a Changelog entries use Added, Changed, Deprecated, Removed, Fixed, and Security as applicable. Patch releases use Fixed and Security only; minor releases use Added, Changed, Deprecated, Fixed, and Security; major releases may additionally use Removed. Preserve manual edits and existing comparison-link conventions.
