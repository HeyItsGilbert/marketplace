# Wayfinder visual encoding — PROTOTYPE, throwaway

**Question this answers:** ticket [#56](https://github.com/HeyItsGilbert/marketplace/issues/56),
"Visual encoding for ticket state x type," a child of map
[#52](https://github.com/HeyItsGilbert/marketplace/issues/52). Given a
rendered planet/moon, what color/shape/icon/label treatment distinguishes
its 4 states (closed / open+blocked / open+unblocked+unclaimed=frontier /
open+claimed) crossed with its 4 types (research/prototype/grilling/task)?

Structural channels were already locked via a `/grilling` round through
grill-ui before this was built:

- **state → ring/border treatment** (not brightness, not shape)
- **type → icon drawn on the body** (not hue, not texture)
- **closed tickets stay visually prominent**, not receded
- **labels are hover/click-only** (HUD panel), never always-on canvas text

What's still a felt, show-not-tell question — and what these three variants
disagree on:

- **Variant A** — hue keeps the precedent prototype's per-name identity
  hash; icons only render at planet scale, moons fall back to a plain
  colored dot.
- **Variant B** — hue is repurposed as an urgency/dependency-distance heat
  (warm = frontier, cool = blocked); icon size is decoupled from body
  radius so even moons get a legible glyph.
- **Variant C** — hue is freed for a future channel (cross-link highlight
  per [#53](https://github.com/HeyItsGilbert/marketplace/issues/53)'s
  diamond-dependency model) and stays neutral for now; "stays prominent"
  for closed tickets is made literal with a bold, fully-saturated ring in
  its own dedicated color rather than just "not dimmed."

Extends the orbit/starfield/layout mechanics proven in
`prototypes/wayfinder-star-map/`, but swaps its live plugin/skill/tool data
for **fixture tickets**: one synthetic ticket per type×state cell (16
planets), plus a few moons hung off two planets specifically to stress-test
icon legibility at moon scale.

No persistence, no tests, no polish.

## Run it

```sh
bun run prototypes/wayfinder-ticket-56-visual-encoding/server.ts
```

Then open the printed URL (defaults to http://localhost:4174) and flip
between `?variant=A`, `?variant=B`, `?variant=C` via the floating bottom
bar or the `←`/`→` arrow keys.

## Verdict

[fill in after you've looked at it]
