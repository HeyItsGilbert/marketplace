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
| `pester-testing`          | `/pester-patterns`| Explicitly invoked Pester 5 recipe reference — mocks for filesystem, REST, credentials, DSC, and more |
| `presentation-review`     | `/death-by-ppt`   | Explicitly invoke to review MARP presentations against Death by PowerPoint principles         |
| `release-manager`         | `/release`        | Update CHANGELOG.md and bump project versions following Keep a Changelog and SemVer           |
| `powershell-lsp`          | —                 | PowerShell language server for .ps1/.psm1/.psd1. Downloads PowerShellEditorServices on first launch. |
| `static-site-tools`       | `/og-image-design`| Explicitly invoke to design Open Graph and social sharing images                             |

The `grill-ui` plugin (`/grill-ui` — grilling-style interviews rendered as a
local Typeform-style browser page, driven by a bundled Bun server) is **not**
in this table because it's omp only and lives in a separate catalog; see
[Repository Structure](#repository-structure).

## Installation

Add this marketplace inside Claude Code, then install the plugins you want:

```text
/plugin marketplace add HeyItsGilbert/marketplace
/plugin install pester-testing@my-plugins
```

omp reads the same repository but prefers its own catalog
(`.omp-plugin/marketplace.json`) over the Claude one when both exist, so an
omp user adding this marketplace sees every plugin above plus `grill-ui`:

```text
/marketplace add HeyItsGilbert/marketplace
/marketplace install grill-ui@my-plugins
```

Browse and toggle plugins interactively with `/plugin`. Once installed, skills
are available in any Claude Code session — type the skill name (e.g.
`/release`). Model-invoked skills can also activate when you describe matching
work; user-invoked reference skills must be typed explicitly.

## Retired plugin

`architecture-decisions` is no longer available from this marketplace. For ADR
workflow guidance, add `mattpocock/skills` and use `domain-modeling` or
`grill-with-docs`; this is not a one-for-one `/adr` replacement. RFC authoring
is discontinued. Installed copies are cached and receive no automatic notice;
see [the retirement record](docs/architecture-decisions-retirement.md).

## Repository Structure

```
.claude-plugin/marketplace.json   # Claude Code catalog — every plugin except grill-ui
.omp-plugin/marketplace.json      # omp catalog — every plugin, including the omp-only grill-ui
plugins/
  <plugin-name>/
    .claude-plugin/plugin.json    # Plugin manifest — name, description, version
    skills/
      <skill-name>/
        SKILL.md                  # Skill definition — frontmatter + prompt
```

omp prefers `.omp-plugin/marketplace.json` and falls back to
`.claude-plugin/marketplace.json` only when the omp-specific file is absent —
the two catalogs are read exclusively, never merged. A plugin that only works
under omp (like `grill-ui`, which launches a local Bun server via omp's
`bash` service conventions) belongs in `.omp-plugin/marketplace.json` alone,
so Claude Code users never see an entry they can't use. A plugin that works
under both stays listed in both files.

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
3. Register it in `.claude-plugin/marketplace.json` (and, if it works under
   omp too, `.omp-plugin/marketplace.json`) by adding an entry to the
   `plugins` array. If the plugin only works under omp, register it in
   `.omp-plugin/marketplace.json` alone.
