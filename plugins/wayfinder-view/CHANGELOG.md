# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Dungeon theme**: a second renderer alongside the star map (#64,
  following up on the #60 prototype), implementing Watabou's own
  documented symmetric tree-growth algorithm — the map is the entrance
  (a stairs-down glyph), primary-tier tickets grow outward as rooms
  (two side children plus one straight-ahead child per generation),
  dependent-tier tickets grow the same way as side-chambers off their
  host room, and `crossLinkIds` render as dashed secret doors. Ink/
  parchment styling (graph-paper grid, walled corridors, jittered wall
  hatching, door jambs) reuses #56's structural visual channels
  (ring = status, icon = type) in its own palette. Static by design —
  no pan/zoom/minimap — a point-in-time "explored map" feel, a
  deliberate contrast to the star map's orbital motion.
- A topbar **theme toggle** switches between the star map and dungeon
  renderers as an instant client-side re-render of the already-fetched
  view-model — never a refetch or page reload. The choice persists
  per-browser (`localStorage`), overridable per-link via a `?theme=`
  URL param.
- `server/public/` split into a shared, theme-agnostic controller
  (`app.js`: session/picker/topbar/HUD/URL-param plumbing, pan/zoom
  input handling) plus swappable renderer modules under
  `server/public/themes/` (`starmap.js`, `dungeon.js`) implementing a
  common interface (`buildLayout`/`draw`/`drawMinimap` plus
  `usesPanZoom`/`usesMinimap` capability flags) — no server or
  `view-model.ts` changes; both themes consume the identical
  `MapViewModel` JSON.


## [1.0.0] - 2026-10-05

### Added

- `/wayfinder-view` skill: a read-only, local browser viewer that renders a
  `/wayfinder` map as a navigable star system — the map is the sun, its
  tickets with no open blockers are planets, their dependents are moons
  orbiting the planet that canonically blocks them. A bundled Bun server
  (`server/server.ts`), mirroring `grill-ui`'s shared-process pattern on
  its own well-known port (`4830` default, `WAYFINDER_VIEW_HOST`/
  `WAYFINDER_VIEW_PORT`), exposes one session per repo at `/s/<id>`.
- `server/view-model.ts`: the canonical, theme-neutral, adapter-agnostic
  view-model — `computeMap` derives a 4-way ticket status
  (`closed > blocked > claimed > frontier`, from live open-blocker state)
  and orbit tiering/diamond-dependency resolution (from stable open+closed
  blocker history, so a blocker later closing reflows status but never
  reshapes the map) as one pure function, proven against fixtures shaped
  like both shipped adapters' raw output.
- `server/adapters/github.ts` and `server/adapters/local-markdown.ts`: the
  two tracker adapters, grouped under `adapters/` so a future third lands
  in the same predictable place. GitHub reads native issue dependencies
  and sub-issues via the `gh` CLI; local-markdown reads the
  `.scratch/<effort>/map.md` + `issues/NN-*.md` convention. The server
  auto-detects which to use per repo path by the same
  `docs/agents/issue-tracker*.md` "Wayfinding operations" convention rule
  `/wayfinder` itself resolves by — no separate flag, no second
  convention to keep in sync.
- Star-map renderer (`server/public/`): organic phyllotaxis (golden-angle)
  orbit placement for both planets around the sun and moons around their
  planet, with rotation-safe radial spacing (the gap between any two
  orbit-adjacent planets alone clears both planets' full moon-shell radii,
  independent of angular position); sun/planet body size as a crowding
  signal (`√(planet count)` / per-dependent growth, capped past ~6
  dependents); an always-visible minimap; pan/zoom with an initial
  legible-default scale; a persistent cross-system jump bar (each map's
  destination plus closed/total count); a hover/click HUD (name,
  type/status, size/priority if populated, a closed ticket's gist, a link
  to its real page) — titles never render as always-on canvas text.
  Status renders as ring/border treatment (solid+pulse frontier, dashed
  blocked, glow claimed, a bold dedicated-color ring for closed that stays
  visually prominent rather than fading); ticket type as a body icon
  (flask/pencil/flame/checklist) sized independently of body radius; hue
  carries state-urgency heat, not per-ticket identity. A diamond-shared
  dependent renders as exactly one body with a thin cross-link line out to
  each non-canonical primary it's also blocked behind.
- Strictly read-only end to end: no claiming, closing, commenting, or
  editing a ticket from the viewer. Data refreshes only on page load or an
  explicit "Refresh" click — never polling, never a live push.
- An optional config file (`$XDG_CONFIG_HOME/wayfinder-view/config.json`,
  or `WAYFINDER_VIEW_CONFIG_PATH`) for a user who always wants a
  non-default port or a non-loopback advertised hostname (a Tailscale/VPN
  name, a reverse-proxy domain) without exporting `WAYFINDER_VIEW_*` env
  vars on every launch — mirrors `grill-ui`'s identical feature. Fields
  (`host`, `port`, `advertiseHost`) are each independently optional;
  precedence per field is env var > config file > built-in default. A new
  `WAYFINDER_VIEW_ADVERTISE_HOST` env var (and matching `advertiseHost`
  config field) overrides the hostname printed in the startup log line /
  handed to the user, independent of the bind host — e.g. binding
  `WAYFINDER_VIEW_HOST=0.0.0.0` to also serve the local network while
  still advertising a stable `advertiseHost` link.
