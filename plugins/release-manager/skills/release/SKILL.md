---
name: release
description: Update CHANGELOG.md and module manifest version for a new release. Use when asked to prepare a release, bump version, update changelog, cut a release, or when terms like "release", "version bump", "changelog update", or "new version" appear in the context of shipping a new version.
allowed-tools: Bash(git log *), Bash(git diff *), Bash(git add *), Bash(git commit *), Bash(git status *), Bash(git checkout *), Bash(git branch *), Bash(gh pr *)
---

# Release Manager Skill

Automatically update the CHANGELOG.md and module manifest version for a new release, following Keep a Changelog and Semantic Versioning.

## Efficiency Guidelines

- Read CHANGELOG.md and the module manifest (*.psd1) in parallel — at least 100 lines for the changelog, 50 for the manifest.
- Use a single git log command to get all commit details since the last release:
  `git log <baseline>..HEAD --format="%h %s%n%b"`
  where `<baseline>` is the last released commit hash from the changelog.
- Update both the manifest version and CHANGELOG.md before committing.
- Validate changes by checking exit codes, not full output.

## Workflow

### 1. Gather Context (in parallel)

- Read CHANGELOG.md (first 100 lines) and the module manifest (*.psd1, first 50 lines).
- Get all commits since the last release with one git command:
  `git log <baseline>..HEAD --format="%h %s%n%b"`
  `<baseline>` = the commit hash associated with the last version entry in the changelog.

### 2. Determine Version Bump

Apply Semantic Versioning:

| Bump  | When                                      |
|-------|-------------------------------------------|
| MAJOR | Breaking changes                          |
| MINOR | New features, backward-compatible         |
| PATCH | Bug fixes, backward-compatible            |

- If re-running for an unreleased version, keep the existing version unless a higher bump is now needed.
- If the correct bump level is unclear, ask for clarification and suggest options.

### 3. Update Files

Update the module manifest version and CHANGELOG.md:

- Add a new `## [X.Y.Z] YYYY-MM-DD` section below `## [Unreleased]` (or at the top if no Unreleased section exists).
- Categorize changes using Keep a Changelog categories:
  - **Added** — new features
  - **Changed** — changes in existing functionality
  - **Deprecated** — soon-to-be removed features
  - **Removed** — removed features
  - **Fixed** — bug fixes
  - **Security** — vulnerability fixes
- Only include categories that have entries.
- Keep lines to 80 characters or fewer.
- Preserve any manual edits if re-running.
- Add a comparison link at the bottom if the repo already uses them.
- Update `ModuleVersion` in the *.psd1 manifest to match.

### 4. Commit and Create PR

- Stage changed files and commit: `git add <files> && git commit -m "chore(release): X.Y.Z"`
- If not already on a release branch, create one: `release/X.Y.Z`
- Run `New-PRFromChangeLog -Version X.Y.Z` to create a PR, or `Update-PRFromChangeLog` if a PR already exists.

## Standards

- [Keep a Changelog](https://keepachangelog.com/)
- [Semantic Versioning](https://semver.org/)
