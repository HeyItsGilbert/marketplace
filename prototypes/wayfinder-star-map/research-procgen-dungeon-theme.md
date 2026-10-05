# Research: a procedural-dungeon theme for wayfinder-view

**Status: pure research, non-binding.** This does not change the scope of
issue #52, does not touch any GitHub issue, and proposes no architecture.
It answers four questions the user raised while informally exploring
whether a watabou-style dungeon map could become a *second*, user-selectable
theme for wayfinder-view's existing theme-neutral view-model
(`tier: "primary"|"dependent"`, `hostId`, `crossLinkIds`, plus ticket type,
a 4-way status enum, size/priority). Issue #59's decision explicitly leaves
room for "a future alternate renderer (not currently planned)" — this
document is input to that still-open, still-undecided question, nothing more.

Every claim below is tagged as one of:

- **[WATABOU]** — a direct quote or close paraphrase of Oleg Dolya
  ("watabou")'s own words, with the exact URL and post timestamp.
- **[SOURCE]** — read directly from a library's/spec's own repo, docs, or
  package metadata (not Watabou, not inference).
- **[THIRD-PARTY / INFERENCE]** — not traceable to Watabou or to a primary
  source; explicitly flagged as such, including when I looked and could not
  find a primary source.
- **[SYNTHESIS]** — my own reasoning for this document, not sourced to
  anyone; clearly isolated in section 4.

---

## 1. Watabou's One Page Dungeon generator: what he has actually said about it

Watabou has not published the One Page Dungeon generator's source code. His
GitHub profile (`github.com/watabou`, read 2026-10-05) lists 8 public
repositories — `TownGeneratorOS` (his *Medieval Fantasy City Generator*,
Haxe, GPL-3.0), `PD-classes`, `RuneGeneratorOS`, `pixel-dungeon`,
`CompassOS`, `openfl.org`, `switch-hook`, `pixel-dungeon-gdx` — none of
which is the dungeon generator. **[SOURCE]** So there is no algorithm source
to read for 1PDG specifically; everything below comes from his own written
explanations in itch.io comments, Patreon posts, and his generator-hub FAQ
page, not from code.

I also searched specifically for a recorded talk (GDC Vault, Roguelike
Celebration's event pages for past years, YouTube, Reddit) under both
"watabou" and his real name "Oleg Dolya". **I found no talk, slide deck, or
video by Watabou about 1PDG's algorithm.** The Roguelike Celebration /
"Practical Procedural Generation for Everyone" / "I gave a talk at Roguelike
Celebration…" results that surfaced are by other procgen authors, not
Watabou. **[THIRD-PARTY / INFERENCE — absence, not presence]**: treat "he
gave a conference talk about this" as unconfirmed; his own text posts are
the only primary material that exists.

### 1.1 Room-placement algorithm — in his own words

The most complete description, from an itch.io comment reply by watabou
(`itch.io/post/11093690`, posted "1 year ago" under *One Page Dungeon*
comments, viewed 2026-10-05):

> "There are many algorithms for dungeon generation. This one is my own
> invention and as such it's not exactly elegant. Its advantage is that it
> can produce maps that look kind of human-made, because they are they are
> 'partly symmetrical'. Here is how it works:
>
> - First we create a 'root' room. Every room incl. this one has an
>   origin/entrance.
> - Until some end condition is reached (e.g. we've spawned enough rooms),
>   we pick one of the rooms and add symmetrical children to it: two on
>   both sides from the entrance, one on the opposite end from the
>   entrance or both (three children).
> - This way we get a symmetrical tree of connected rooms. Perfect
>   symmetry doesn't look good, so occasionally we spawn children rooms
>   unsymmetrically - of different sizes or just one to the side from
>   entrance etc.
> - This gives us a 'partly symmetrical' map, but it's still a tree and a
>   decent map needs loops, so we add some loops by connecting adjacent
>   room, adding tunnels etc.
>
> That's it. There are some nuances to make it work and more nuances to
> make it work adequately, but that's the idea." **[WATABOU]**

An earlier, independent comment reply (`itch.io/post/5713119`, "4 years
ago") describes the same idea with slightly different emphasis, including
the "chaos" tuning knob:

> "the generator builds imperfectly symmetrical dungeons. Every dungeon is
> grown recursively and when a room needs to be expanded, usually identical
> wings are spawned to the left and to the right from it. Usually, but not
> every time - occasionally these wings are not identical, but still
> (imperfectly) symmetrical. How often this happens depends on the desired
> level of chaos. This all is supposed to produce something in between
> boring perfectly symmetrical cross-like or T-like plans and too chaotic
> layouts typical for more common algorithms." **[WATABOU]**

A third, shorter restatement (`itch.io/post/10121880`, "2 years ago") makes
explicit that he does not consider this a named/standard algorithm:

> "Not an algorithm, but the idea: the main difference with this generator
> is that its output contains elements of 'local symmetry'. This is
> supposed to make a dungeon look human-made, like there was a purpose or a
> plan for it." **[WATABOU]**

And his own generator-hub tagline (`watabou.github.io/dungeon.html`,
"Watabou's Procgen Arcana: Dungeon", read 2026-10-05) summarizes it as:

> "Unique algorithm for producing 'human-designed' looking semi-symmetrical
> layouts." **[WATABOU]**

**Answering "BSP vs agent-walk vs cellular" directly**: none of the three.
Watabou explicitly frames this as *his own invented* algorithm, distinct
from "more common algorithms" (his words), built as a **recursive tree of
rooms grown by spawning symmetric sibling children off an entrance, with
loops stitched in afterward to break the pure-tree topology**. It is not a
space-partitioning scheme (no mention of recursively splitting a bounding
rectangle), not an agent/drunkard's-walk corridor digger, and not a
cellular automaton (no mention of birth/survive rules or smoothing passes).
Any claim beyond his own four quotes above — e.g. a specific data structure,
exact probability of asymmetry, or room-count formula per recursion depth —
is **not available**; he says "there are some nuances… but that's the idea"
and has not published more detail than this.

Room-count tiers *are* directly sourced: he states dungeons tagged *small*
run 3–6 rooms, *medium* 6–12, and *large* 12–25
(`itch.io/post/10455756`, "2 years ago"). **[WATABOU]**

### 1.2 Room shapes

**Not found in any primary source.** I searched his itch.io comments,
devlog, and Patreon tag `1pdg` for a description of room shape rules
(rectangular-only vs. free-form polygons) and found none. The generator's
own preview thumbnail (`watabou.github.io/images/desc_dungeon.png`, linked
from the dungeon.html FAQ) visually shows non-rectangular, somewhat organic
room outlines, but that is an **[THIRD-PARTY / INFERENCE]** observation
from a thumbnail image, not a sourced claim — Watabou has not written about
how room *shape* (as opposed to room *placement*) is generated, and I am
flagging this as an open gap rather than guessing.

### 1.3 Door and corridor connection rules — in his own words

A user building a third-party viewer asked watabou directly to confirm the
meaning of the JSON export's door `type` field (devlog post "Keyboard
shortcuts", `itch.io/one-page-dungeon/devlog/491830/keyboard-shortcuts`,
comment thread). The asker's working list (type integers 0–9: connection,
door, archway, stairs, portcullis, special, secret, door, longstairs,
longstairs) was mostly confirmed by watabou, who corrected the ambiguous
ones (`itch.io/post/15073501`, "291 days ago"):

> "You get it all mostly right... - 3 - Entrance depicted as a staircase
> leading **to the room**. - 5 - Locked door. The key is somewhere on the
> map. - 7 - Barred door. Semantically it's the same as portcullis i.e.
> it's impassable. - 8 - Exit depicted as a staircase leading **from the
> room**. - 9 - Steps. Basically the same as type 1, but with a hint of a
> difference in level between the two rooms." **[WATABOU]**

So the sourced door vocabulary is: **open connection** (never blocks
vision), **standard door** (blocks vision when closed), **archway** (never
blocks), **stairs in/out** (entrance/exit flavor of the same connector,
never blocks), **portcullis** (raisable, doesn't block), **locked door**
(blocks, requires a key placed elsewhere on the map), **secret door**
(blocks when closed, hidden from the player-facing view), **barred door**
(impassable, semantically = portcullis), and **steps** (same as a standard
door but signals a floor-level change). This list is as close to a
"corridor/door rulebook" as Watabou has published, and it comes straight
from him, not from third-party reverse-engineering.

Secret rooms/doors are a first-class, user-toggleable concept: the same
devlog's keyboard-shortcut list includes "**H** - toggle secrets"
**[WATABOU]**, and a much older comment thread (`itch.io/one-page-dungeon
/comments?after=0`) shows a user asking for a "player version" of the map
with secret rooms hidden — confirming secret rooms are a map-author-only
layer the generator already distinguishes from the rest of the plan.

### 1.4 Visual rendering — hatching, not geometry

The one part of 1PDG's *rendering* Watabou has written up in real technical
depth is **not the room/corridor algorithm but the line-hatching shading**,
in a Patreon post titled "Hatching in 1PDG"
(`patreon.com/watawatabou/posts/hatching-in-1pdg-31716880`, Nov 20 2019,
read 2026-10-05). Key points, quoted/paraphrased directly from him:

> "The hatching I use in 1PDG is my attempt to reproduce Dyson hatching...
> named after Dyson Logos, the inventor (or a popularizer?) of this style."
> He implements it by scattering "clusters" of three short strokes, first
> tried at uniform-random positions (too much overlap / too many empty
> gaps), then switched to **Poisson disk sampling**: "a distribution of
> points where any two points are not closer to each other than a certain
> limit... pretty close to how the hatching is implemented in 1PDG,"
> followed by scaling each cluster's stroke length/spacing up to the
> distance to its nearest neighbor to close remaining gaps. **[WATABOU]**

This is the one place Watabou names an actual, citable algorithm (Poisson
disk sampling) rather than "my own invention" — but it governs wall-shading
texture, not the dungeon's room/corridor layout.

The generator's own FAQ page also states (not a talk, just page copy) that
the hatching is "including Dyson hatching" with a link to Dyson Logos's own
hand-drawing tutorial (`dysonlogos.blog/2011/09/03/dungeon-doodles-a
-crosshatching-tutorial/`) **[WATABOU, attributing a third party]**, and
that exports support PNG/SVG/Markdown/VOX/JSON, with JSON importable into
"RPG Map Editor" or "Dungeon Scrawl" **[SOURCE: dungeon.html page copy]**.

### 1.5 Summary table — sourced vs. not

| Question | Answer | Status |
|---|---|---|
| BSP / agent-walk / cellular? | None — his own recursive symmetric-tree-of-rooms-plus-loops, explicitly "my own invention" | **[WATABOU]** |
| Room shapes | Not described anywhere found; thumbnail shows non-rectangular outlines | **[THIRD-PARTY / INFERENCE]**, gap flagged |
| Door/corridor types | 10 documented door `type` codes, confirmed by him line-by-line | **[WATABOU]** |
| Secret doors/rooms | Explicit toggle, user-facing concept | **[WATABOU]** |
| Room-count tiers | small 3–6, medium 6–12, large 12–25 | **[WATABOU]** |
| Hatching/shading algorithm | Poisson-disk-sampled stroke clusters, Dyson-hatching style | **[WATABOU]** |
| Conference talk on the algorithm | None found despite searching GDC Vault / Roguelike Celebration / YouTube | **[THIRD-PARTY / INFERENCE]** — absence noted, not proven impossible |
| Open algorithm source code | None — 1PDG is not among his 8 public GitHub repos | **[SOURCE]** (GitHub profile) |

---

## 2. Browser-runnable dungeon-layout libraries for a Bun-served, no-build-step app

The existing prototype's constraint is strict: Bun serves static files +
JSON only (`prototypes/wayfinder-star-map/server.ts`), and all layout +
drawing happens client-side via plain `<canvas>` and vanilla JS
(`prototypes/wayfinder-star-map/public/app.js`), with no bundler and no
game engine. Anything considered for a dungeon theme has to fit that same
shape: either a `bun add` dependency whose **ES module build can be
`<script type="module">`-imported directly in the browser with zero
transpile step**, or something small enough to vendor as a single file.

### 2.1 rot.js (`rot-js` on npm) — the only actively-relevant, maintained option found

Repo: `github.com/ondras/rot.js` **[SOURCE]**. License: `BSD-3-Clause`,
confirmed in `package.json` **[SOURCE]**. It ships prebuilt output in three
forms exactly matching the no-build-step constraint, per its own README:

> "The `lib/` directory contains the code in ES2015 modules. These can be
> used in modern browsers directly, without any transpilation/bundling
> step... If you do not fancy modern modules and/or transpilation, you can
> grab a pre-built bundle (`dist/rot.js`) and include it in your page using
> a traditional `<script>` tag... puts rot.js into a global `ROT`
> namespace and uses ES5." **[SOURCE: rot.js README]**

I downloaded the prebuilt bundle directly
(`raw.githubusercontent.com/ondras/rot.js/master/dist/rot.min.js`) and
measured it: **68,729 bytes minified, 22,337 bytes gzipped** for the
*entire* toolkit (all map generators, all five display backends, FOV,
pathfinding, noise, RNG, scheduler) **[measured directly, this session]**.
Importing only the ES module files actually needed (`map/digger.js`,
`map/uniform.js`, `map/cellular.js`, `map/dungeon.js`, `map/features.js`)
via the `lib/` ES2015-module build would be substantially smaller than the
full 22 KB gzipped bundle, since the display/FOV/pathfinding/noise code
would simply never be fetched — but I did not measure that trimmed subset's
exact byte count, so treat "smaller" as directional, not a number.
`bun add rot-js` would work (it is a plain npm package with zero runtime
deps, confirmed in `package.json`: `"files": [...], ` no `dependencies`
key), or the single `dist/rot.js` file could be vendored directly into
`public/` with no package manager involvement at all, matching the
prototype's "no build step" ethos even more literally.

**What it actually offers, read from its own source** (not hearsay):

- `ROT.Map.Digger` (`src/map/digger.ts`) — doc comment: *"Random dungeon
  generator using human-like digging patterns. Heavily based on Mike
  Anderson's ideas from the 'Tyrant' algo, mentioned at
  http://roguebasin.com/index.php/Dungeon-Building_Algorithm."*
  **[SOURCE]**. Mechanically (read from the code): it carves a first room,
  then repeatedly finds a dig-able wall tile, tries attaching a randomly
  chosen room-or-corridor feature off it, and stops once a target
  percentage of the map area (`dugPercentage`, default 0.2) is carved or a
  time limit (default 1000 ms) is hit; doors are added afterward by
  scanning each room's perimeter for open neighbors (`_addDoors`).
- `ROT.Map.Uniform` (`src/map/uniform.ts`) — doc comment: *"Dungeon
  generator which tries to fill the space evenly. Generates independent
  rooms and tries to connect them."* **[SOURCE]**. It drops independent
  random rectangular rooms until a dug-percentage target is hit, then
  greedily connects each room to its nearest already-connected neighbor
  with an L- or S-shaped corridor (`_connectRooms`), retrying the whole
  room layout if corridor-routing fails within an attempt budget. This is
  the closest of rot.js's generators to a classic "place rectangles, then
  wire them up" layout, though it is not BSP (rooms are placed
  independently at random, not by recursively splitting a parent region).
- `ROT.Map.Cellular` (`src/map/cellular.ts`) — a textbook birth/survive
  cellular automaton (default `born: [5,6,7,8]`, `survive: [4,5,6,7,8]`,
  8-neighbor topology), plus a separate `connect()` pass that guarantees
  full reachability by repeatedly tunneling the nearest disconnected region
  to the connected set. **[SOURCE]** — reads as cave-like rather than
  room-and-corridor, so less analogous to 1PDG's aesthetic.

Separately, **`ROT.Display`** (`src/display/display.ts`) is itself a
concrete, already-shipped example of exactly the "swappable renderer over
one data model" pattern this research is also asked to survey (see §3.1) —
worth noting here because it means rot.js's map *generation* output
(abstract room/corridor/wall grid) is already decoupled from its *drawing*
backend in the same codebase being considered for layout.

### 2.2 Other libraries considered and rejected/not pursued

- A `github.com/denetor/dungeon-generator` cellular-automaton repo and a
  `github.com/rithviik/...` itch.io BSP demo surfaced in search results,
  but I did not find evidence either is actively maintained or has
  meaningful adoption (no README-stated license read, no npm package), so
  I am not treating them as "concrete, currently-maintained" per the
  question's bar — noting them only as search noise, not recommending them.
- No second maintained, browser-ready, dungeon-specific JS/TS library
  (beyond rot.js) turned up in searches for "procedural dungeon generator"
  + "javascript"/"typescript" + "npm"/"github" with real stars/maintenance
  signals. **[THIRD-PARTY / INFERENCE — absence, not exhaustive proof]**:
  this reflects what surfaced in the searches run for this document, not a
  certified absence of any other option.

### 2.3 Duskbound's dungeon generator — a real production example of deterministic, shared-code generation

Added per a follow-up pointer from the user during this research, read
directly from the primary source: `duskboundga.me/blog/procedural-worlds`
("Worlds from a seed · Duskbound dev blog", published 2026-09-27, read
2026-10-05) **[SOURCE]** — Duskbound's own dev blog, with its own code
excerpts, not a third-party writeup. This is not a library to `bun add`;
it's a concrete, shipped architecture for exactly the "procgen in a JS/TS
app with no server-authored map payload" shape this research is scoped to,
so it is captured here as a worked precedent rather than folded into §3's
theme-swap survey.

**The core move, quoted directly**: "the server sends a zone id and one
`uint32`, and the browser builds the same map bit for bit" — no map data
ever crosses the wire, because "procgen must be pure. No `Math.random`, no
`Date.now`, no unspecified iteration order, no engine-dependent float
shortcuts," with the generator code living in a shared module with "no DOM
and no `node:*` imports" importable from both server and browser builds
**[SOURCE, direct quotes]**. This is a stronger and more specific version of
the "pluggable, portable layout code" constraint this research's §2 opened
with — not just browser-runnable, but *provably identical* across two
separate runtimes from the same four-byte seed, verified in their own test
suite by generating every sample twice at three fixed seeds and comparing
output buffers byte-for-byte **[SOURCE]**.

**Their dungeon generator specifically** (one of four generator kinds
behind one `generateZone(input)` entry point), quoted from their own
summary table: "rectangles or cellular-automata caves, MST corridors plus
~15% loops, modular walls; boss room = farthest walk from entrance" plus
two hand-authored exceptions ("Mirror Halls (symmetric) and Gloam Heart
(spiral) use fixed layouts") **[SOURCE]**. Mechanically this is a different
family again from both Watabou's symmetric-tree-plus-loops (§1.1) and
rot.js's Digger/Uniform (§2.1): place rooms (rectangular or
automaton-carved caves), connect them with a **minimum spanning tree** so
every room is reachable with no redundant edges, then re-add roughly 15% of
the pruned edges back in as deliberate loops — a named, well-known
graph-theory approach (MST + loop-edges-back), not an invented one.
Wilderness/dungeon generation also BFS-walks every tile's distance from the
entrance and stores it as a normalized `depth` value, which they use to
push monster spawns away from the entrance **[SOURCE]** — a directly
relevant idea for wayfinder-view, where `tier`/`hostId` already encode a
comparable notion of "how far from the map's entrance point" per ticket.

**Connectivity-safe placement** is the other idea worth flagging: rather
than generate-then-repair, every object that can block a path goes through
a `Placer` that only accepts a placement if it provably preserves full
connectivity — a cheap local "simple point" topology test for single
tiles (a tile is safe to block if its walkable neighbors all form one
contiguous run around it), escalating to a windowed BFS and finally a
full-grid BFS only when the cheap test can't decide, quoted directly from
their own code comment: "Every accepted placement preserves global
connectivity by construction, so generators never have to repair maps
afterwards" **[SOURCE]**. This is a concrete answer to a failure mode any
room-and-corridor generator (Watabou's, rot.js's, or a new one) has to
solve one way or another — generate-then-validate-then-retry vs.
construct-so-it-can't-fail — and Duskbound's own test suite runs a
50-seeds-per-sample BFS-reachability check as the generate-then-validate
backstop regardless **[SOURCE]**, so even their "can't fail by
construction" placer isn't trusted as the sole correctness guarantee.

Performance, for scale calibration only (their zones run far larger than a
wayfinder map's ticket count would need): their own measured budget is
50ms for the largest maps, with a 104×104 dungeon level generating in
1.6ms and nav-grid build in 0.04ms on their dev machine, median of nine
seeds **[SOURCE]**. Not directly transferable to wayfinder-view's scale
(dozens of tickets, not thousands of tiles/props), but confirms room/corridor
generation plus connectivity validation is cheap enough to run synchronously
client-side with no loading-screen concern at wayfinder-view's data sizes.

**Caveat**: Duskbound's generator code itself is not public (the blog shows
excerpts, not a repo), so nothing here can be vendored or `bun add`-ed —
unlike rot.js (§2.1), this is a pattern/precedent to learn from, not a
dependency to take.

---

## 3. Patterns for a swappable visual theme over one data model

Three concrete, source-grounded examples, each actually read (not
generic "use CSS variables" advice):

### 3.1 rot.js: generator output and display backend are separate modules, registry-selected

Read directly from `src/display/display.ts` **[SOURCE]**: the `Display`
class holds a `BACKENDS` lookup object —

```ts
const BACKENDS = {
  "hex": Hex,
  "rect": Rect,
  "tile": Tile,
  "tile-gl": TileGL,
  "term": Term
}
```

— and `setOptions({ layout })` does `let ctor = BACKENDS[options.layout]; this._backend = new ctor();`
to swap the active rendering backend at runtime. The *map data* (what a
`Digger`/`Uniform`/`Cellular` instance produces via its `create(callback)`
walk over an x/y/value grid) never changes; only which `Backend`
implementation consumes `Display.draw(x, y, ch, fg, bg)` calls changes —
term-style ASCII, a plain `<canvas>` rect grid, a hex grid, or a
WebGL-tiled renderer are four register-able strategies over one identical
stream of draw calls. This is a direct, working precedent for "one
theme-neutral model, pluggable renderer chosen from a small registry,"
which is structurally close to what a `?theme=star-map|dungeon` switch
over wayfinder-view's JSON would need.

### 3.2 UVTT ("Universal VTT"): one JSON schema, many independent renderers

Universal VTT is a JSON file format — not Watabou's invention — created by
the developer behind Wonderdraft/Dungeondraft (Megasploot), per Roll20's
own support documentation: *"Universal VTT is a format created by
Megasploot, the developer behind Wonderdraft and Dungeondraft, that bundles
a map image together with structured data about that map"* (grid
dimensions, wall positions, lighting, portals) (`help.roll20.net
/hc/en-us/articles/41643201127831`, read 2026-10-05) **[SOURCE]**. The
format is intentionally renderer-agnostic: the same `.dd2vtt`/`.df2vtt`/
`.uvtt` payload is consumed by Foundry VTT, Roll20, Arkenforge, and others,
each with its own completely different rendering/interaction layer drawn
over the identical wall/light/grid JSON — per-source confirmation from
Arkenforge's own write-up that the three file extensions are "functionally
the same" format emitted by different map tools (`arkenforge.com
/universal-vtt-files/`) **[SOURCE]**. Relevant because Watabou's own 1PDG
JSON export (§1.4) is explicitly aimed at import into other tools ("RPG Map
Editor", "Dungeon Scrawl") rather than only his own renderer — the same
"ship a theme-neutral schema, let others draw it" instinct wayfinder-view's
view-model is already built on.

### 3.3 Open Props: CSS custom properties as the swap mechanism

`github.com/argyleink/open-props` **[SOURCE, read its README directly]** —
"CSS custom properties to help accelerate adaptive and consistent design,"
5,500+ GitHub stars, published as `open-props` on npm, distributed as a
single importable stylesheet (`unpkg.com/open-props`) that defines design
tokens (`--font-size-1`, `--red-5`, etc.) as CSS custom properties rather
than hardcoded values; downstream CSS or components reference the custom
property names, and swapping which stylesheet defines those names (e.g. a
different color-mode file) re-themes every consumer with no JS or markup
change. This is the standard concrete mechanism behind "data stays the
same, swap the CSS variables file to reskin" for anything DOM/CSS-based —
directly applicable to wayfinder-view's existing `public/style.css` (not
directly to `<canvas>` drawing calls, which have no CSS cascade, but
applicable to any DOM chrome around the canvas, and as a precedent for
"palette lives in one swappable place, not scattered through draw code").

### 3.4 Takeaway across all three

All three real examples put the swap point at a different layer (rot.js:
a backend-class registry; UVTT: a shared file format consumed by unrelated
programs; Open Props: a CSS custom-property layer) but share one shape: the
theme-neutral data/API never encodes which skin is active — the caller
picks a renderer/stylesheet/backend by name from a small, enumerable set,
and nothing about the data model needs to know that set exists. That maps
onto wayfinder-view's existing `tier`/`hostId`/`crossLinkIds` schema being
untouched while a `theme` selector picks which client-side draw module
consumes it — but see §4: which concrete mechanism (registry object like
rot.js, or something else) is not decided here.

---

## 4. [SYNTHESIS — my own speculation, not sourced to anyone]

The following is **the researcher's own sketch**, offered only to make the
"what would this even look like" question concrete for discussion. It is
**not a recommendation and not a design decision** — issue #59 already
deferred the alternate-renderer question, and nothing here should be read
as resolving it.

If wayfinder-view's existing theme-neutral fields were ever rendered through
a dungeon theme alongside the current star-map theme, a plausible (not
prescribed) mapping:

| wayfinder-view field | star-map theme (existing) | dungeon theme (speculative) |
|---|---|---|
| the map/tracker itself | sun | entrance / stairwell down into the dungeon |
| `tier: "primary"` ticket | planet | room |
| `tier: "dependent"` ticket (capped-depth) | moon | side-chamber / closet off its host room |
| `hostId` (dependent → its primary) | orbit parent | which room a side-chamber opens off of |
| `crossLinkIds` | cross-system link line | secret door / hidden corridor between two rooms |
| ticket type | (color/shape per type, current prototype) | room *purpose* flavor — e.g. a vault-like room vs. a plain chamber |
| 4-way status enum | (visual state per current prototype) | room state — e.g. lit/explored vs. unlit/unexplored vs. "cleared" |
| size/priority | (size/brightness per current prototype) | room footprint size / how centrally it's placed |

Caveats on this sketch, stated plainly: it borrows surface vocabulary
(rooms, side-chambers, secret doors) from §1–§3's sourced material but
invents the specific field-to-vocabulary assignment myself; it does not
account for how Watabou's "capped-depth dependents" would visually nest
more than one level if the real data ever has deeper chains; and it says
nothing about layout algorithm choice (§2's rot.js generators vs. a custom
one) — that remains exactly as open as issue #59 left it.
