# Claude Code Plugin Marketplace

A collection of plugins that extend [Claude Code](https://claude.ai/code) with
custom skills.

## Available Plugins

| Plugin                    | Skill / Command   | Description                                                                                   |
|---------------------------|-------------------|-----------------------------------------------------------------------------------------------|
| `architecture-decisions`  | `/adr`            | Create and manage Architecture Decision Records committed to the repo                         |
| `architecture-decisions`  | `/rfc`            | Draft and manage Requests for Comments for decisions that need team discussion                 |
| `code-review-team`        | `/team-review`    | Seven-perspective parallel code review (Staff SWE, Architect, Nitpicker, Junior, Grey Hat, Docs, Test Strategist) |
| `copy-editor`             | `/copy-edit`      | Write, brainstorm, polish, and review content while preserving Gilbert's voice                |
| `pester-testing`          | `/pester-write`   | Write Pester 5 test files for PowerShell functions, modules, and scripts                      |
| `pester-testing`          | `/pester-review`  | Review existing Pester tests for correctness, idiomatic usage, and coverage gaps              |
| `pester-testing`          | `/pester-run`     | Run Pester 5 tests with agent-optimized output (failures and summary only)                    |
| `pester-testing`          | `/pester-patterns`| Ready-to-use Pester 5 recipes — mocks for filesystem, REST, credentials, DSC, and more        |
| `presentation-review`     | `/death-by-ppt`   | Review MARP presentations for "Death by PowerPoint" issues                                    |
| `release-manager`         | `/release`        | Update CHANGELOG.md and bump project versions following Keep a Changelog and SemVer           |
| `static-site-tools`       | `/og-image-design`| Design Open Graph and social sharing images with platform specs and HTML templates            |

## Installation

Add this marketplace inside Claude Code, then install the plugins you want:

```text
/plugin marketplace add HeyItsGilbert/marketplace
/plugin install pester-testing@my-plugins
```

Browse and toggle plugins interactively with `/plugin`. Once installed, skills
are available in any Claude Code session — type the skill name (e.g.
`/release`) or describe what you want and Claude will activate the matching
skill automatically.

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
