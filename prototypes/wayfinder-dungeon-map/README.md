# Wayfinder dungeon map — PROTOTYPE, throwaway

**Question this answers (ticket #60):** can a watabou-style procedural
**dungeon** layout — rooms + corridors, generated from wayfinder-view's
existing theme-neutral view-model (`tier`/`hostId`/`crossLinkIds`, ticket
type, 4-way status) — be rendered client-side in the same shape as
`prototypes/wayfinder-star-map/` (Bun serves JSON + static files only; a
plain `<canvas>` + vanilla JS does layout and drawing in the browser, no
build step), and does it look/feel like a viable second theme?

Sibling prototype to `prototypes/wayfinder-star-map/`, reusing its shape
exactly: same server split (API route + static file serving, no build
step), same static-layout-then-draw client structure. Rather than vendor
rot.js (surveyed in `research-procgen-dungeon-theme.md` §2 but adds a
dependency / fetch for a one-screen feasibility check), this uses a small
hand-rolled layout — a named, documented algorithm choice in the spirit of
Duskbound's MST-plus-loop-edges approach (§2.3 of the research doc), not
Watabou's unpublished symmetric-tree algorithm (§1, confirmed nowhere
published to clone):

- The map itself is the **entrance** (a stairwell), centered.
- `tier: "primary"` tickets are **rooms**, fanned in a ring around the
  entrance, one corridor each.
- `tier: "dependent"` tickets are **side-chambers**, fanned further out
  from their `hostId` room, one short corridor each.
- `crossLinkIds` are **secret doors** — dashed lines from a shared
  chamber to the other room(s) it's also gated behind.

Data is this repo's **real** wayfinder maps — every issue labelled
`wayfinder:map` (open and closed), fetched live via the `gh` CLI on every
request, exactly like the star-map prototype's own "no fake fixtures"
rule. The server computes the canonical view-model (issue #55's schema)
including the capped-two-tier diamond resolution (issue #53): a ticket's
`tier` is `"primary"` iff it has no blockers; a `"dependent"` ticket's
`hostId` is the lowest-numbered primary ticket transitively reachable
through its blockers, with any other primary ancestors becoming
`crossLinkIds` — this repo's own map #10 (house-standard decisions) has a
real 3-root, up-to-depth-3 diamond-dependency graph that exercises this
exactly (ticket #19 is transitively gated behind all three of #11/#12/#13).

## Run it

```sh
bun run prototypes/wayfinder-dungeon-map/server.ts
```

Then open the printed URL (defaults to http://localhost:4174). Requires
`gh` authenticated against this repo (same convention as
`docs/agents/issue-tracker.md`).

## What it proves

- The star-map prototype's server/client split (Bun → JSON + static
  files, canvas + vanilla JS → layout + draw, no build step) carries over
  cleanly to a structurally different renderer — nothing about that shape
  is star-map-specific.
- The theme-neutral view-model (`tier`/`hostId`/`crossLinkIds`, 4-way
  `status`, ticket `type`) is sufficient on its own to drive a dungeon
  layout — no additional fields were needed, confirming issue #59's
  "additive, not a schema break" expectation for a second renderer.
- Reusing #56's structural visual channels (ring/border = state, icon =
  type, hue = state-urgency heat, icon size decoupled from body size)
  translates directly from "orbit ring around a circle" to "border around
  a room rectangle" with no redesign — those decisions really were
  theme-agnostic, not accidentally star-map-shaped.
- A real diamond-dependency graph (map #10's tickets #11–#20) renders
  legibly: one room with five side-chambers fanned around it, two of them
  with secret doors reaching across the dungeon to two other rooms.

## What it doesn't prove / open gaps

- **No real frontier/blocked ticket exists in this repo's current data**
  to visually confirm the pulsing-orange / dashed-purple states in situ —
  only closed (green double-ring) and one claimed (gold glow) state are
  exercised by live data. The code path is the same for all four states
  (`stateRingStyle`), just unexercised by what's real right now.
- **Layout is a simple radial fan, not Watabou's symmetric-tree-plus-loops.**
  Watabou's actual algorithm isn't published (research doc §1), so this
  doesn't attempt to clone it — it borrows his *vocabulary* (entrance,
  rooms, side-chambers, secret doors) over a different, simpler placement
  scheme. A real second theme would need a real decision on which layout
  family (§2/§2.3 of the research doc) to commit to; this prototype picked
  "whichever gets something on screen fastest" per the ticket's own
  instruction, not a recommendation.
- **No collision avoidance.** The radial-fan math keeps rooms/chambers
  apart by construction at this repo's current scale (≤13 tickets per
  map), but doesn't generalize to "dozens+ tickets" — the same open
  question the star-map theme already has unresolved in the parent map's
  "Not yet specified" (Readability at scale).

## Verdict

**Worth keeping in view as a candidate second theme, not immediately
pursuing further.** The feasibility bar the ticket set — same
server/client shape, theme-neutral schema needs no changes, #56's visual
channels transfer — is cleared cleanly. But the result reads more like "a
hub-and-spoke diagram wearing dungeon skin" than a dungeon: a real
watabou- or rot.js-flavored room/corridor generator (organic room shapes,
actual wall/floor tiles, non-radial corridor routing) would look
meaningfully more "dungeon" than this radial fan does, and that's a
bigger build than this one-screen check. Static (non-orbiting) layout
does read as a point-in-time "explored map" in a way that contrasts
pleasantly with the star map's constant motion — worth keeping as a
genuine differentiator if a second theme is ever greenlit, rather than
just a reskin.
