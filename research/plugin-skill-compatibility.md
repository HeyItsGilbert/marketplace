# Installed-plugin compatibility when skills change

## Decision

A skill directory name is the public invocation suffix: `skills/hello/SKILL.md` in `my-plugin` creates `/my-plugin:hello` ([Create plugins — “Add a skill”](https://code.claude.com/docs/en/plugins#add-a-skill)). Therefore, renaming or merging a skill changes a user-facing command name; removing it removes the source definition for that command in a new plugin release.

Anthropic documents **no individual-skill rename, alias, deprecation, or migration mechanism**. The documented `renames` mechanism applies only to *marketplace plugin entry names*, not skill names. Treat a skill rename, merge, or removal as a breaking interface change for any user, documentation, automation, agent, or prompt that invokes the old `/plugin:skill` name. This is an engineering conclusion from the documented naming rule, not a documented runtime compatibility guarantee.

## What an already-installed user has

### Before a plugin update is applied

Marketplace installation copies the plugin into the local, versioned cache at `~/.claude/plugins/cache` (except command-source link mode) ([Plugin marketplaces — “Plugin sources”](https://code.claude.com/docs/en/plugin-marketplaces#plugin-sources)): “Claude Code copies each installed plugin into the local versioned plugin cache.” The technical reference further says that each installed version has “its own copy of the plugin's files” ([Plugins reference — “Plugin caching and file resolution”](https://code.claude.com/docs/en/plugins-reference#plugin-caching-and-file-resolution)).

Accordingly, a repository or marketplace change alone does not retroactively alter that cached copy. The documentation does **not** separately specify the precise command inventory for an individual skill that was renamed or removed upstream before the user updates; the supported statement is that the user's installed version is a cached copy until Claude Code installs a different resolved version.

The documented ordinary update paths are:

* A user can run `claude plugin update <plugin>`; its documented purpose is “Update a plugin to the latest version” ([Plugins reference — `plugin update`](https://code.claude.com/docs/en/plugins-reference#plugin-update)).
* When enabled, auto-update refreshes marketplace data and “updates installed plugins to their latest versions on disk” after startup, with a random delay of up to ten minutes ([Discover plugins — “Configure auto-updates”](https://code.claude.com/docs/en/discover-plugins#configure-auto-updates)). The running session continues using the version loaded at launch; it prompts for `/reload-plugins` after an update or uses the new version on next launch. Auto-update is enabled by default for the official Anthropic marketplace and most other official Anthropic marketplaces, but can be disabled per marketplace or through `DISABLE_AUTOUPDATER` (same source).

Catalog refresh and installed-plugin update are distinct. `/plugin marketplace update` retrieves marketplace “new plugins and version changes”; a qualified `/plugin install plugin@marketplace` also refreshes that marketplace before lookup, even when auto-update is disabled ([Plugin marketplaces — `plugin marketplace update`](https://code.claude.com/docs/en/plugin-marketplaces#plugin-marketplace-update); [Discover plugins — “Install plugins”](https://code.claude.com/docs/en/discover-plugins#install-plugins)).

**Answer: do stale skills remain before update/reinstall?** The docs establish that the installed artifact is cached and versioned, so its contents remain the installed copy until an update installs another version. They do not document a skill-level “stale” status, nor do they require a reinstall as the normal update path. A post-update reload/restart may be needed before the current session uses changed components ([Discover plugins — “Apply plugin changes without restarting”](https://code.claude.com/docs/en/discover-plugins#apply-plugin-changes-without-restarting)).

### After an update

Claude Code uses the resolved plugin version as both cache key and update signal: it “skips the update if it matches what's already installed” ([Plugins reference — “Version management”](https://code.claude.com/docs/en/plugins-reference#version-management)). A successfully updated copied plugin has a new version-directory copy of its files. The previous version directory is marked orphaned and removed in a background sweep roughly 14 days later, so concurrent sessions that already loaded it can continue without errors; Claude's Glob and Grep skip those orphaned directories ([Plugins reference — “Plugin caching and file resolution”](https://code.claude.com/docs/en/plugins-reference#plugin-caching-and-file-resolution)).

Skills and commands are “automatically discovered when the plugin is installed” ([Plugins reference — “Skills”](https://code.claude.com/docs/en/plugins-reference#skills)). However, Anthropic does **not** document a separate individual-skill update migration contract—for example, whether an old skill invocation produces a particular error after the updated release omits its directory, or whether it receives an alias. Do not rely on either behavior.

A root-level singleton `SKILL.md` needs an explicit frontmatter `name` for a stable invocation: without one it falls back to the installation-directory name, which for a marketplace-installed plugin is a version string that changes on every update ([Plugins reference — “Skills”](https://code.claude.com/docs/en/plugins-reference#skills)). This is a documented naming hazard, not a migration feature.

## Migration and deprecation support

### Supported: plugin-entry rename or removal

At the **marketplace-plugin** level, `name` is a stable identifier used in `enabledPlugins`, `pluginConfigs`, and `/plugin install`; Anthropic says changing it “breaks every existing install” ([Plugin marketplaces — “Rename or remove a plugin”](https://code.claude.com/docs/en/plugin-marketplaces#rename-or-remove-a-plugin)). Marketplace authors can add top-level `renames` to map a former plugin name to its replacement, or to `null` when it is removed:

```json
{
  "renames": {
    "old-plugin": "new-plugin",
    "removed-plugin": null
  }
}
```

This mechanism automatically migrates existing users on Claude Code v2.1.193 or later. For a rename, Claude Code loads the new name, displays a notice, and rewrites `enabledPlugins` and `pluginConfigs` keys in user, project, and local settings. For `null`, it drops the old key and reports removal. `renames` is append-only and follows chains. Older Claude Code ignores the field and reports `plugin-not-found`; read-only managed/policy settings cannot be rewritten automatically and repeat the notice until the administrator updates them (same source).

For a renamed plugin with a remote source, the automatic settings migration can still leave no local copy of the new plugin; Claude Code reports `plugin-cache-miss` and documents a one-time `/plugin install` requirement ([Plugin marketplaces — “Rename or remove a plugin”](https://code.claude.com/docs/en/plugin-marketplaces#rename-or-remove-a-plugin)). This caveat is about a **plugin-entry** rename, not a renamed skill.

This does **not** map `/old-plugin:old-skill` to `/new-plugin:new-skill`, and the schema has no documented skill-level equivalent. Using `displayName` instead of changing a plugin's `name` is the documented way to change only the plugin's UI label without breaking plugin installs (same source).

### Not documented: individual-skill migration

Across Anthropic's plugin creation guide, marketplace guide, and plugin reference, no documented feature was found for any of the following at individual-skill granularity:

* a `renames` map from an old skill folder/invocation to a new skill;
* an alias or forwarding command for a retired skill;
* a deprecation notice or grace period for a skill invocation; or
* automatic rewriting of prompts, documentation, settings, or automation that refer to an old skill name.

Thus a skill merge is not covered by the plugin-entry `renames` feature. The absence above is a documentation finding, **not** a claim that an undocumented implementation behavior cannot exist.

## Why the plugin version is release-critical

For every source other than `command`, version resolution prefers, in order: `plugin.json` `version`, marketplace-entry `version`, source commit SHA (git-backed sources), archive digest, then `unknown` for npm or local non-git sources ([Plugins reference — “Version management”](https://code.claude.com/docs/en/plugins-reference#version-management)).

* With an explicit `version`, users receive updates **only** after that field changes; pushing new commits without a version bump has no effect and `plugin update` reports that the plugin is already current.
* With no explicit version in either location, a changed resolved git commit (or archive digest, as applicable) creates the update signal.
* `command` sources instead derive a content hash (or `version-hash`) and can update when the produced content changes.

Therefore, a skill rename/removal can reach already-installed marketplace users only when the source resolves to a new plugin version. For explicit-version releases, a version bump is required. Anthropic recommends semantic versioning and specifies MAJOR for breaking changes, MINOR for new features, and PATCH for fixes (same source); a skill-namespace break fits the documented definition of a breaking change, although the docs do not explicitly classify skill renames.

## Practical conclusion for the audit

1. Keep a skill directory/invocation stable whenever existing callers may use it.
2. If a skill must be renamed, merged, or removed, record it as a breaking change and release it as a new resolvable plugin version. Do **not** claim that marketplace `renames` preserves the old skill invocation.
3. Use top-level marketplace `renames` only when the marketplace **plugin entry** itself is renamed or removed; retain it as append-only history and note the v2.1.193 minimum client version.
4. The upstream cache behavior and automatic-update timing are documented; individual-skill stale-command behavior and migration are not. Any release communication or compatibility plan must account for that documented gap.
