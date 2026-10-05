# Wayfinder star map — PROTOTYPE, throwaway

**Question this answers:** can a Bun-served page render a Wayfinder — a
central task/map and its dependency graph — as a navigable star system, with
a working jump between systems? Not a design-option comparison (no
`?variant=` switcher); this is a feasibility spike per the user's explicit
"just prove I could do this" ask.

Wayfinder's shape, per the user: a central task/map is the **sun**, its
direct dependencies are **planets**, and a dependency's own dependencies are
**moons** — a directed graph, not just two tiers. To avoid inventing fake
fixtures, that shape is grounded in this repo's real marketplace dependency
graph:

- **sun** = a plugin (the central task/map)
- **planet** = a skill or agent that plugin depends on
- **moon** = a tool that skill/agent depends on (its `allowed-tools` entries)

No persistence, no tests, no polish. Data is read live from
`plugins/*/.claude-plugin/plugin.json`, `plugins/*/skills/*/SKILL.md`, and
`plugins/*/agents/*.md` on every request — the systems you see are the real
marketplace catalog, not fixtures.

## Run it

```sh
bun run prototypes/wayfinder-star-map/server.ts
```

Then open the printed URL (defaults to http://localhost:4173).

## What it proves

- A `<canvas>` can render a three-tier orbit graph (sun → planets → moons,
  moons orbiting their *planet's current position*, not the sun) plus a
  twinkling starfield, at a steady frame rate from plain Bun + vanilla JS —
  no game engine, no WebGL, no build step.
- Jumping between systems (click a system name in the bottom bar, or
  `←`/`→`) is just a `fetch` for new system data plus an orbit-layout
  rebuild; no page reload needed.
- Plugins with no `skills/` dir (e.g. `code-review-team`) fall back to
  `agents/*.md` as planets, so the graph degrades sensibly when a system has
  a different dependency shape.

## Verdict

[fill in after you've looked at it]
