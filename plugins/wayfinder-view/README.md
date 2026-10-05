# wayfinder-view

A marketplace plugin that adds `/wayfinder-view`: a read-only, local browser viewer that renders a `/wayfinder` map as a navigable star system — the map is the sun, its unblocked tickets are planets, and their dependents are moons orbiting the planet that gates them — instead of reconstructing that shape by re-reading issue bodies and `Blocked by:`/sub-issue lists. Works under any coding-agent harness that can run a persistent background process and issue plain HTTP requests, mirroring `grill-ui`'s precedent.

## What it adds

A bundled Bun server computes one theme-neutral JSON view-model per map load — tiering (planet vs. moon), diamond-dependency resolution (a dependent shared by 2+ primaries gets one canonical host plus cross-link lines to the rest), and a 4-way ticket status (`closed > blocked > claimed > frontier`) — from either a GitHub (`gh` CLI, native issue dependencies) or local-markdown (`.scratch/<effort>/`) tracker, auto-detected the same way `/wayfinder` itself resolves a tracker. A canvas page draws that view-model as an organic phyllotaxis (golden-angle) orbit scatter with pan/zoom, an always-visible minimap, and a hover/click HUD — never always-on canvas text.

The server is a single shared process, like `grill-ui`: concurrent repos each get their own session (`/s/<id>`), and it refuses to silently relocate to a fallback port if its expected one (`4830` by default — distinct from `grill-ui`'s `4829` so both can run at once) is already taken. Data loads once per page visit and again only on an explicit "Refresh" click — never polling, never a live push, and nothing in the viewer ever writes back to the tracker (no claiming, closing, commenting, or editing).

## Installation

```text
/marketplace add HeyItsGilbert/marketplace
/marketplace install wayfinder-view@my-plugins
```

or, under Claude Code:

```text
/plugin marketplace add HeyItsGilbert/marketplace
/plugin install wayfinder-view@my-plugins
```

**Prerequisites:** [Bun](https://bun.sh) on `PATH` — the server is a `.ts` file run directly with `bun run`. Viewing a GitHub-tracked repo's maps additionally needs the [`gh` CLI](https://cli.github.com) installed and authenticated against that repo; a local-markdown-tracked repo needs nothing beyond Bun.

## Configuration

`WAYFINDER_VIEW_HOST`/`WAYFINDER_VIEW_PORT` env vars override the bind host/port for a single launch (defaults: `127.0.0.1` / `4830`), following the same convention as `grill-ui`'s `GRILL_UI_HOST`/`GRILL_UI_PORT`.

## Usage

`/wayfinder-view` is **user-invoked** (`disable-model-invocation: true`) — see `skills/wayfinder-view/SKILL.md` for the full agent-facing protocol (`POST /sessions`, the `/s/:id/api/...` data endpoints, adapter resolution). The intended flow is that a `/wayfinder` chart or work-through session offers this viewer's link as its closing step, so the user lands on the map just touched without a separate launch step; `wayfinder-view` can also be opened standalone against any repo with wayfinder maps.

## Development

```sh
cd plugins/wayfinder-view
bun install
npm test
```

Two required test seams (see the plugin's originating issue's Testing Decisions for the full rationale): `skills/wayfinder-view/server/view-model.test.ts` unit-tests the pure, adapter-agnostic `computeMap` function (status precedence, tier/diamond resolution, gist parsing) against fixtures shaped like both adapters' raw output; `skills/wayfinder-view/server/server.test.ts` exercises the HTTP/session API (`bun test` against a real `Bun.serve` binding, following `grill-ui`'s `server.test.ts` precedent) using the local-markdown adapter against real temp-directory fixtures — fully hermetic, no `gh` CLI or network required. Canvas rendering (orbit placement, connector lines, ring/icon/hue drawing) and pan/zoom/hover/click interaction are verified by manual/visual smoke run only, per the issue's own seam decision — not pinned by permanent tests, since pixel-level canvas assertions would test rendering mechanics rather than user-visible behavior.

## Requirements

- [Bun](https://bun.sh) on `PATH` — the server is a `.ts` file run directly with `bun run`.
- A harness that can run a long-lived background process and issue plain HTTP requests — true of omp and Claude Code's own Bash tool.
- The [`gh` CLI](https://cli.github.com), authenticated against the target repo, only when that repo's tracker doc resolves to GitHub (see `SKILL.md`'s **Adapter resolution**). A local-markdown-tracked repo needs nothing beyond Bun.
