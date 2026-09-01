# Claude Code Plugin Marketplace

A collection of plugins that extend [Claude Code](https://claude.ai/code) with
custom skills.

## Available Plugins

| Plugin                    | Skill / Command   | Description                                                                                   |
|---------------------------|-------------------|-----------------------------------------------------------------------------------------------|
| `code-review-team`        | `/team-review`    | Seven-perspective parallel code review (Staff SWE, Architect, Nitpicker, Junior, Grey Hat, Docs, Test Strategist) |
| `copy-editor`             | `/copy-edit`      | Write, brainstorm, polish, and review content while preserving Gilbert's voice                |
| `pester-testing`          | `/pester-write`   | Write Pester 5 test files for PowerShell functions, modules, and scripts                      |
| `pester-testing`          | `/pester-review`  | Review existing Pester tests for correctness, idiomatic usage, and coverage gaps              |
| `pester-testing`          | `/pester-run`     | Run Pester 5 tests with agent-optimized output (failures and summary only)                    |
| `pester-testing`          | `/pester-patterns`| User-invoked Pester 5 recipe and mock reference                                               |
| `presentation-review`     | `/death-by-ppt`   | User-invoked MARP presentation review                                                          |
| `release-manager`         | `/release`        | Update CHANGELOG.md and bump project versions following Keep a Changelog and SemVer           |
| `static-site-tools`       | `/og-image-design`| User-invoked Open Graph and social sharing image guidance                                      |

## Installation

Add this marketplace inside Claude Code, then install the plugins you want:

```text
/plugin marketplace add HeyItsGilbert/marketplace
/plugin install pester-testing@my-plugins
```

Browse and toggle plugins interactively with `/plugin`. Model-invoked skills
activate for matching requests. User-invoked reference skills
(`/pester-patterns`, `/death-by-ppt`, and `/og-image-design`) must be invoked
explicitly.

## Retired plugin

`architecture-decisions` is no longer available from this marketplace. For ADR
workflow guidance, add `mattpocock/skills` and use `domain-modeling` or
`grill-with-docs`; this is not a one-for-one `/adr` replacement. RFC authoring
is discontinued. Installed copies are cached and receive no automatic notice;
see [the retirement record](docs/architecture-decisions-retirement.md).

## Repository Structure

```
.claude-plugin/marketplace.json   # Marketplace manifest — indexes all plugins
plugins/
  <plugin-name>/
    .claude-plugin/plugin.json    # Plugin manifest — name, description, version
    skills/
      <skill-name>/
        SKILL.md                  # Skill definition — frontmatter + prompt
```

## Creating Your Own Plugin

1. Create `plugins/<your-plugin>/.claude-plugin/plugin.json`:

   ```json
   {
     "name": "your-plugin",
     "description": "What your plugin does",
     "version": "1.0.0"
   }
   ```

2. Create `plugins/<your-plugin>/skills/<your-skill>/SKILL.md` with YAML
   frontmatter (`name`, `description`) and the skill prompt as the markdown
   body.
3. Register it in `.claude-plugin/marketplace.json` by adding an entry to the
   `plugins` array.
