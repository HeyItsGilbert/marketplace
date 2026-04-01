---
name: release
description: Update CHANGELOG.md and project version for a new release. Use when asked to prepare a release, bump version, update changelog, cut a release, or when terms like "release", "version bump", "changelog update", or "new version" appear in the context of shipping a new version.
allowed-tools: Bash(git log *), Bash(git diff *), Bash(git add *), Bash(git commit *), Bash(git status *), Bash(git checkout *), Bash(git branch *), Bash(gh pr *)
---

# Release Manager Skill

Automatically update the CHANGELOG.md and project version for a new
release, following Keep a Changelog and Semantic Versioning.

## Efficiency Guidelines

- Read CHANGELOG.md and the version manifest in parallel. Read at
  least 100 lines of the changelog (older entries help you match the
  existing style) and at least 50 lines of the manifest.
- Use a single git log command to get all commit details since the
  last release — multiple commands waste time and can miss context:
  `git log <baseline>..HEAD --format="%h %s%n%b"`
  where `<baseline>` is the commit hash of the last released version
  from the changelog.
- Update both the version manifest and CHANGELOG.md before committing
  so they stay in sync.
- Validate changes by checking exit codes, not full output — reading
  large outputs burns context for no benefit.

## Workflow

### 1. Gather Context (in parallel)

Read these in parallel to minimize round-trips:

- **CHANGELOG.md** (first 100 lines). If it doesn't exist, you'll
  create one in step 3.
- **Version manifest** — detect the project type and read the
  appropriate file:

  | Project Type | Manifest File     | Version Field          |
  |-------------|-------------------|------------------------|
  | Node.js     | `package.json`    | `"version": "X.Y.Z"`  |
  | PowerShell  | `*.psd1`          | `ModuleVersion = 'X.Y.Z'` |
  | Python      | `pyproject.toml`  | `version = "X.Y.Z"`   |
  | Rust        | `Cargo.toml`      | `version = "X.Y.Z"`   |
  | .NET        | `*.csproj`        | `<Version>X.Y.Z</Version>` |

  If multiple manifests exist, ask which one to update. If none exist,
  skip the version manifest update and note this to the user.

- **Git log** — get all commits since the last release:
  `git log <baseline>..HEAD --format="%h %s%n%b"`
  `<baseline>` = the commit hash from the last version entry in the
  changelog. For a first release, use the repo's initial commit.

### 2. Determine Version Bump

Always use strict Semantic Versioning (MAJOR.MINOR.PATCH). If the
project uses a non-standard scheme (e.g., `1.2.3.0` or `1.2.3-beta`),
normalize to three-part semver — `1.2.3.0` becomes `1.2.3`, and the
next bump follows from there.

| Bump  | When                                      |
|-------|-------------------------------------------|
| MAJOR | Breaking changes                          |
| MINOR | New features, backward-compatible         |
| PATCH | Bug fixes, backward-compatible            |

**First stable release (0.x → 1.0.0):** If the current version is
below 1.0.0 (e.g., 0.0.1, 0.1.0) and the user says "first release",
"first real release", "ready for production", or similar language
signaling stability, bump to **1.0.0**. Pre-1.0 versions are
development placeholders — a "first real release" means the project
is ready for consumers, which is what 1.0.0 represents in semver.

Determine the bump level using this approach, in order:

1. **Commit messages first.** Scan for conventional commit prefixes
   (`feat:`, `fix:`, `BREAKING CHANGE:`) — these are the fastest
   signal.
2. **Read the diffs.** When commit messages are vague or don't follow
   conventions, read the actual code changes with
   `git diff <baseline>..HEAD` to understand what changed. New public
   APIs or exported functions → MINOR. Bug fixes and internal
   refactors → PATCH. Removed or renamed public APIs, changed
   function signatures, breaking config changes → MAJOR.
3. **Ask only as a last resort.** If the changes are genuinely
   ambiguous after reading the code (e.g., a large refactor that
   might or might not break consumers), ask the user — but present
   your best guess with reasoning so they can confirm quickly.

- If re-running for an unreleased version, keep the existing version
  unless a higher bump is now needed.

### 3. Update Files

**CHANGELOG.md:**

- Add a new `## [X.Y.Z] - YYYY-MM-DD` section (note the dash
  between version and date) below `## [Unreleased]`. If no
  Unreleased section exists, add one above the new version entry.
- If this is the first release and no CHANGELOG.md exists, create one
  with the Keep a Changelog header format, including an
  `## [Unreleased]` section.
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
  For a first release, comparison links are optional.

**Version manifest:**

- Update the version field in the detected manifest file to match the
  new version. Use the format appropriate for the project type (see
  table in step 1).

### 4. Commit and Create PR

- Stage changed files and commit:
  `git add <files> && git commit -m "chore(release): X.Y.Z"`
- If not already on a release branch, create one: `release/X.Y.Z`
- Create or update a PR:
  `gh pr create --title "chore(release): X.Y.Z" --body "<changelog section for this version>"`
  If a PR already exists for this branch, update it instead:
  `gh pr edit <number> --body "<updated changelog section>"`

## Standards

- [Keep a Changelog](https://keepachangelog.com/)
- [Semantic Versioning](https://semver.org/)
