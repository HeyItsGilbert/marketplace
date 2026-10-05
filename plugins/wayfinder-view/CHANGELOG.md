# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
