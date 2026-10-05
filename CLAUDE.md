# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A Claude Code plugin marketplace — a collection of plugins that extend Claude Code with custom skills. The root `.claude-plugin/marketplace.json` is the Claude Code marketplace manifest; `.omp-plugin/marketplace.json` is the parallel catalog omp prefers (exclusively — it does not fall back to the Claude path once present). Every current plugin works under both tools and is registered in both files. A future plugin that only works under one tool (e.g. one that depends on a tool only that harness provides) would be registered in that tool's catalog alone.

## Architecture

```
.claude-plugin/marketplace.json    # Claude Code catalog: plugins usable in Claude Code
.omp-plugin/marketplace.json       # omp catalog: kept in sync with the Claude one
plugins/
  <plugin-name>/
    .claude-plugin/plugin.json     # Plugin manifest: name, description, version
    skills/
      <skill-name>/
        SKILL.md                   # Skill definition: frontmatter (name, description) + prompt content
```

**Marketplace manifests** (`.claude-plugin/marketplace.json`, `.omp-plugin/marketplace.json`): Top-level registries, same schema. Each entry in `plugins[]` has a `name`, `source` (relative path to the plugin directory), and `description`. omp reads whichever file is present, preferring the omp-specific one; a plugin not usable under a given tool is omitted from that tool's catalog.

**Plugin manifest** (`plugin.json`): Declares a single plugin's identity and version.

**Skill file** (`SKILL.md`): The actual skill content. YAML frontmatter provides `name` and `description` (used for trigger matching). The markdown body is the prompt/instructions that Claude Code follows when the skill is invoked. Optional frontmatter fields include `allowed-tools` (scoped auto-approved tools, e.g., `Bash(git log *)`).

## Adding a New Plugin

1. Create `plugins/<plugin-name>/.claude-plugin/plugin.json` with name, description, and version.
2. Create `plugins/<plugin-name>/skills/<skill-name>/SKILL.md` with frontmatter and skill instructions.
3. Register the plugin in `.claude-plugin/marketplace.json`, and in `.omp-plugin/marketplace.json` too unless it only works under one of the two tools.

## Eval Workspaces

Skills can have an eval workspace at `skills/<skill-name>-workspace/` containing test cases, benchmarks, and grading results used to iterate on skill quality with the `skill-creator` plugin.

```
skills/<skill-name>-workspace/
  create-test-repos.sh       # Recreates test git repos from scratch
  evals/evals.json           # Test cases: prompts, expected outputs, assertions
  eval_set.json              # Trigger eval queries for description optimization
  iteration-N/               # Results per iteration
    <eval-name>/
      eval_metadata.json     # Assertions for this eval
      with_skill/            # Outputs, grading, timing (skill-guided run)
      without_skill/         # Outputs, grading, timing (baseline run)
    benchmark.json           # Aggregated pass rates, timing, tokens
    feedback.json            # User review feedback from eval viewer
```

To rerun evals: `bash create-test-repos.sh` to regenerate repos, clone into a new `iteration-N/`, spawn agents with and without the skill, grade against assertions, and generate the eval viewer via `skill-creator`'s `generate_review.py`.

## Conventions

- Skills and agent authoring follows [`docs/agents/skill-and-agent-authoring.md`](docs/agents/skill-and-agent-authoring.md).
- Skill names use kebab-case (e.g., `death-by-ppt`).
- Plugin names use kebab-case (e.g., `presentation-review`).
- The `source` field in the marketplace manifest uses relative paths prefixed with `./`.

## Hooks

Prefer commands to be PowerShell scripts. They should have matching Pester tests to validate.

## Agent skills

### Issue tracker

Issues are tracked in this repository’s GitHub Issues. See `docs/agents/issue-tracker.md`.

### Domain docs

This repository uses a single-context domain-document layout. See `docs/agents/domain.md`.
