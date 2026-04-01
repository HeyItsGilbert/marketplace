# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A Claude Code plugin marketplace — a collection of plugins that extend Claude Code with custom skills. The root `.claude-plugin/marketplace.json` is the marketplace manifest that indexes all available plugins.

## Architecture

```
.claude-plugin/marketplace.json    # Marketplace manifest: lists all plugins with name, source path, description
plugins/
  <plugin-name>/
    .claude-plugin/plugin.json     # Plugin manifest: name, description, version
    skills/
      <skill-name>/
        SKILL.md                   # Skill definition: frontmatter (name, description) + prompt content
```

**Marketplace manifest** (`.claude-plugin/marketplace.json`): Top-level registry. Each entry in `plugins[]` has a `name`, `source` (relative path to the plugin directory), and `description`.

**Plugin manifest** (`plugin.json`): Declares a single plugin's identity and version.

**Skill file** (`SKILL.md`): The actual skill content. YAML frontmatter provides `name` and `description` (used for trigger matching). The markdown body is the prompt/instructions that Claude Code follows when the skill is invoked. Optional frontmatter fields include `allowed-tools` (scoped auto-approved tools, e.g., `Bash(git log *)`).

## Adding a New Plugin

1. Create `plugins/<plugin-name>/.claude-plugin/plugin.json` with name, description, and version.
2. Create `plugins/<plugin-name>/skills/<skill-name>/SKILL.md` with frontmatter and skill instructions.
3. Register the plugin in `.claude-plugin/marketplace.json` by adding an entry to the `plugins` array.

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

- Skill descriptions in SKILL.md frontmatter should list trigger phrases so Claude Code knows when to activate the skill. Descriptions should be "pushy" — include explicit trigger contexts and near-miss exclusions to improve activation accuracy.
- Skill names use kebab-case (e.g., `death-by-ppt`).
- Plugin names use kebab-case (e.g., `presentation-review`).
- The `source` field in the marketplace manifest uses relative paths prefixed with `./`.
