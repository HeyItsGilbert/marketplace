# Claude Code Plugin Marketplace

A collection of plugins that extend [Claude Code](https://claude.ai/code) with
custom skills.

## Available Plugins

| Plugin                | Skill           | Description                                                                         |
|-----------------------|-----------------|-------------------------------------------------------------------------------------|
| `presentation-review` | `/death-by-ppt` | Review MARP presentations for "Death by PowerPoint" issues                          |
| `release-manager`     | `/release`      | Update CHANGELOG.md and bump project versions following Keep a Changelog and SemVer |

## Installation

Install the entire marketplace or individual plugins using the Claude Code CLI:

```bash
# Install all plugins from this marketplace
claude plugin add HeyItsGilbert/marketplace

# Or install a single plugin
claude plugin add presentation-review@marketplace
```

You can also install directly from a Git URL:

```bash
# Install all plugins
claude plugin add https://github.com/HeyItsGilbert/marketplace

# Install a single plugin
claude plugin add https://github.com/HeyItsGilbert/marketplace/plugins/release-manager
```

Once installed, skills are available in any Claude Code session. Type the skill
name (e.g. `/release`) or describe what you want and Claude will activate the
matching skill automatically.

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
