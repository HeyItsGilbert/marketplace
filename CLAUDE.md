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

**Skill file** (`SKILL.md`): The actual skill content. YAML frontmatter provides `name` and `description` (used for trigger matching). The markdown body is the prompt/instructions that Claude Code follows when the skill is invoked.

## Adding a New Plugin

1. Create `plugins/<plugin-name>/.claude-plugin/plugin.json` with name, description, and version.
2. Create `plugins/<plugin-name>/skills/<skill-name>/SKILL.md` with frontmatter and skill instructions.
3. Register the plugin in `.claude-plugin/marketplace.json` by adding an entry to the `plugins` array.

## Conventions

- Skill descriptions in SKILL.md frontmatter should list trigger phrases so Claude Code knows when to activate the skill.
- Skill names use kebab-case (e.g., `death-by-ppt`).
- Plugin names use kebab-case (e.g., `presentation-review`).
- The `source` field in the marketplace manifest uses relative paths prefixed with `./`.
