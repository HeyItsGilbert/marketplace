# Wayfinder dungeon map — PROTOTYPE, throwaway

**Question this answers (ticket #60):** can a watabou-style procedural
**dungeon** layout — rooms + corridors, generated from wayfinder-view's
existing theme-neutral view-model (`tier`/`hostId`/`crossLinkIds`, ticket
type, 4-way status) — be rendered client-side in the same shape as
`prototypes/wayfinder-star-map/` (Bun serves JSON + static files only; a
plain `<canvas>` + vanilla JS does layout and drawing in the browser, no
build step), and does it look/feel like a viable second theme?

**Revised after a first pass that missed the point.** The first cut
proved the data plumbing (real GitHub data → canonical view-model → canvas)
but laid rooms out on a plain ring around the entrance — it read as a
hub-and-spoke diagram wearing a dungeon-colored skin, not something you'd
mistake for a Watabou map. This version replaces that layout with
Watabou's own documented algorithm and an ink/parchment look chasing his
actual visual style, not just his vocabulary.

## The algorithm, from his own words

Quoted directly in `research-procgen-dungeon-theme.md` §1.1 (watabou,
itch.io): *"we pick one of the rooms and add symmetrical children to it:
two on both sides from the entrance, one on the opposite end from the
entrance or both (three children)... This way we get a symmetrical tree of
connected rooms."* That's implemented literally as `growTree()` in
`public/app.js`: a room has an entry direction (the way you walked in);
its children spawn **left**, **right**, and **straight ahead** of that
direction, recursing outward. Applied twice — the map (entrance) grows the
primary-tier rooms, and each room grows its own dependent-tier
side-chambers off *its* entry direction, continuing away from the
entrance.

One deviation from a literal reading, found by actually running it on real
data: a room with a further sibling continuing past it in the same
generation (i.e. not the last room in its own chain) can't also sprout a
child *straight ahead* — that direction is already the corridor running
through it to its sibling. Only a chain's terminal room gets all three
slots; everything upstream is restricted to left/right. Skipping this
caused real overlaps on this repo's own data (issue #55's chamber landed
underneath issue #59's room, both hung off the same "continue straight"
direction) — not a cosmetic nit, a structural requirement once you're
laying out more than a 3-node tree.

`crossLinkIds` are drawn as dashed **secret doors** — the "loops" step
Watabou adds after the tree ("a decent map needs loops, so we add some
loops by connecting adjacent rooms, adding tunnels") — except ours connect
semantically cross-linked rooms (a shared chamber's other blockers, per
#53's diamond-dependency resolution), not physically adjacent ones.

## The look

- Parchment background with a faint graph-paper grid, not deep space.
- Corridors drawn as walled passages (parallel ink rails + floor fill),
  not bare lines.
- Rooms are ink-outlined rectangles with a short jittered hatching stroke
  along the inner wall — an approximation of the Poisson-disk-sampled
  "Dyson hatching" Watabou describes for 1PDG's shading (§1.4), not a real
  Poisson-disk implementation.
- A door-jamb tick mark at the wall each room's corridor enters through.
- The entrance is a stairs-down glyph in its own room, not a glowing
  circle.
- State (#56's channels, reused): solid red pulse = frontier, dashed
  purple = blocked, gold wash = claimed, ink double-outline ("surveyed
  room") = closed. Type icon (flask/pencil/flame/checklist) unchanged,
  redrawn in ink instead of gold-on-black.

## Data

This repo's **real** wayfinder maps — every issue labelled `wayfinder:map`
(open and closed), fetched live via the `gh` CLI on every request, no
fake fixtures (same rule the star-map prototype set). The server computes
the canonical view-model (#55's schema) including #53's capped-two-tier
diamond resolution: a ticket's `tier` is `"primary"` iff it has no
blockers; a `"dependent"` ticket's `hostId` is the lowest-numbered primary
ticket transitively reachable through its blockers, with any other primary
ancestors becoming `crossLinkIds`. Map #10 (house-standard decisions) has
a real diamond-dependency graph that exercises this hard: all seven of its
dependent tickets (#14–#20) collapse onto one host room (#11), with two of
them (#18, #20) reaching #11 only *transitively* through another
dependent, and #19 reaching all three primary rooms (#11/#12/#13) at once.
Map #52 (this very map) has its own real edge: #55 is blocked by #54, so
it renders as a side-chamber, not a seventh standalone room.

## Run it

```sh
bun run prototypes/wayfinder-dungeon-map/server.ts
```

Then open the printed URL (defaults to http://localhost:4174). Requires
`gh` authenticated against this repo (same convention as
`docs/agents/issue-tracker.md`).

## What it proves

- Watabou's own documented room-growth rule is directly implementable as
  a small, deterministic function over wayfinder-view's existing
  `tier`/`hostId`/`crossLinkIds` fields — no additional schema needed,
  confirming #59's "additive, not a schema break" expectation.
- The star-map prototype's server/client shape (Bun → JSON + static
  files, canvas + vanilla JS → layout + draw, no build step) carries over
  unchanged to a structurally different renderer.
- #56's structural visual channels (ring/border = state, icon = type, icon
  size decoupled from body size) translate cleanly from "ring around a
  circle" to "outline around a room" with no redesign.
- Run against this repo's two real, structurally different wayfinder maps
  (#10's deep diamond graph, #52's single blocked-pair edge), the same
  generator produces a legible, genuinely dungeon-shaped map for both —
  not hand-tuned to one fixture.

## What it doesn't prove / open gaps

- **No collision avoidance beyond the terminal-slot rule.** It keeps
  rooms apart at this repo's current scale (≤13 tickets/map) by
  construction, but a host room with many dependents chains them in a
  straight row that can run off-canvas (seen on map #10's 7-chamber room)
  — the same "dozens+ tickets" readability-at-scale question the star-map
  theme already has open.
- **Hatching is jittered-even-spacing, not real Poisson-disk sampling** —
  a visual approximation, flagged as such, not a claim to have implemented
  Watabou's actual shading algorithm.
- **Room shapes are still plain rectangles.** Watabou's own room-shape
  rules were never published (research doc §1.2 — an open gap even in the
  sourced material), so there was nothing authoritative to clone there;
  this doesn't attempt organic/non-rectangular rooms.
- **No real frontier/blocked ticket exists in this repo's current data**
  to show the pulsing-red / dashed-purple states in situ — only closed and
  claimed are exercised live. Same code path for all four states, just
  unexercised by what's real right now.

## Verdict

**Clears the bar this ticket actually set: it looks like a Watabou map,**
not a reskinned diagram. The symmetric tree-growth rule, walled corridors,
ink hatching, and door jambs combine to produce something a person
glancing at it would call a dungeon map, grown from this repo's real
ticket graph with no fake data and no schema changes. The remaining gap to
a *faithful* clone is squarely in the parts Watabou never published source
for (room shapes, exact asymmetry tuning, true Poisson-disk hatching) —
not in anything this prototype could have gotten more right by trying
harder. Worth keeping as a genuine candidate second theme if one is ever
greenlit; the static (non-orbiting) layout also reads as a point-in-time
"explored map" in a way that's a real stylistic contrast to the star map's
constant motion, not just a palette swap.
