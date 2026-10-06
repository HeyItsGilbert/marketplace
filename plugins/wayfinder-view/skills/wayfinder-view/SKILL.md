---
name: wayfinder-view
description: Open a wayfinder map as a navigable star system in a local, read-only browser viewer instead of re-reading issue bodies and Blocked-by lists.
disable-model-invocation: true
---

# Wayfinder View

Render one wayfinder map at a time as a navigable system, in either of two renderer **themes**. By default, a **star system**: the map is the sun, its tickets with no in-map blocker are planets, and their dependents are moons orbiting the planet that (canonically) blocks them. A toggle in the viewer's own topbar switches to a **dungeon** theme instead: the map is the entrance, planets become rooms and moons become side-chambers, grown via Watabou's symmetric tree-growth algorithm. A small local Bun server computes one theme-neutral JSON view-model once per load — tiering, diamond-dependency resolution, and status are all decided server-side, identically for both themes — and a canvas page draws whichever theme is active. **Strictly read-only**: nothing you or the user do in the viewer writes back to the tracker.

Like `grill-ui`, the server is a single long-lived process meant to be **shared by every concurrent wayfinder-view session on this machine**, not restarted per repo: each repo gets its own *session* (its own resolved tracker adapter and repo path), multiplexed over one server/port and reachable at its own `/s/<id>` browser URL. Unlike `grill-ui` it never pushes live updates — a session's map data is computed fresh from the tracker only on page load or an explicit "Refresh" click in the browser, never polling.

## Reuse the shared server, then create a session

1. **Check whether a server is already running** before starting one: `GET http://127.0.0.1:<port>/sessions` (default port `4830`, overridable via `WAYFINDER_VIEW_PORT` — distinct from `grill-ui`'s `4829` so both can run concurrently) with a short timeout.
   - A JSON response means one is already up — reuse it, skip straight to step 2.
   - A connection failure means none is running yet — launch the bundled server as a long-running background process and keep it running for every other concurrent wayfinder-view session on this machine, not just your own:
     ```
     bun run <skill-directory>/server/server.ts
     ```
     Start it however your harness runs a persistent background command. Wait for its startup log line, `Listening on http://<host>:<port>`, before continuing. If it instead exits with "could not bind", another process (likely another wayfinder-view launch that raced yours) already took that port — it never silently relocates to a fallback port, since a fallback nobody discovers defeats the shared-server point. Go back to step 1 and re-probe; the winner of the race is now there to find.
2. **Create (or re-attach to) a session for the target repo**:
   ```sh
   curl -s -X POST http://127.0.0.1:<port>/sessions -H 'content-type: application/json' \
     -d '{"path": "<absolute path to the repo you just charted/worked>"}'
   ```
   Pass your own current working directory as `path` — omitting it falls back to the *server process's* cwd, which is almost never what you want for a shared server. Posting the same path again later (a second map viewed in the same repo, a different session reattaching) is idempotent: it returns the existing session instead of creating a duplicate. The response is `{"id", "repoPath", "tracker", "url"}`, where `url` is `/s/<id>` and `tracker` is whichever of `"github"`/`"local-markdown"` the server resolved for that path (see **Adapter resolution** below) — purely informational, you never choose it yourself.

Combine the server's host:port with the response's `url` and give the result to the user **once**, as a plain link — do not open it yourself. The user opens it in their own browser; its header shows the repo path and tracker, a jump bar lists every `wayfinder:map` in that repo (open and closed, each with its destination and closed/total ticket count), and the first map loads by default. Data refreshes only when the user reloads the page or clicks the viewer's own "Refresh" button — reusing the session later in the same conversation (another map resolved, another `/wayfinder` run) needs no new link; the same `/s/<id>` URL already reflects whatever the tracker holds as of the next refresh.

By default the server only binds to loopback (`127.0.0.1`) — reachable from this machine alone. If the user wants to view from another device on the same network (e.g. a phone or a second computer), start it with `WAYFINDER_VIEW_HOST=0.0.0.0 bun run <skill-directory>/server/server.ts` instead; it then also logs a `http://<lan-ip>:<port>` line for each reachable network interface — hand the user whichever link matches how they want to connect. Only do this on a network the user trusts: the server has no authentication beyond rejecting cross-origin requests, so anyone on that network could read any open session's tracker data while it's exposed.

## Persistent preferences (optional)

A user who always wants the same non-default port, or wants the startup
link to advertise a hostname other than loopback (a Tailscale/VPN name, a
reverse-proxy domain — anything that actually resolves back to this
machine for them), can set it once instead of exporting `WAYFINDER_VIEW_*`
env vars on every launch. The server reads an optional JSON config file at
startup — `$XDG_CONFIG_HOME/wayfinder-view/config.json` (or
`~/.config/wayfinder-view/config.json` if `XDG_CONFIG_HOME` is unset), or
wherever `WAYFINDER_VIEW_CONFIG_PATH` points:

```json
{
  "host": "127.0.0.1",
  "port": 5174,
  "advertiseHost": "my-box.ts.net"
}
```

All three fields are optional and independent — set only the ones that
differ from the default. Precedence per field is **env var > config file >
built-in default**, so a one-off override (`WAYFINDER_VIEW_PORT=4830 bun
run server.ts`) never has to touch the file. This is a human-facing
setting, not something you manage: don't create or edit this file yourself
unless the user explicitly asks you to. What it does mean for you is that
the port in the startup log line can differ from the `4830` default even
though no `WAYFINDER_VIEW_PORT` was set for this launch — always read the
actual bound port from that line (`Listening on http://<host>:<port>`),
never assume it.

## Hand off the link at the end of a `/wayfinder` session

If you're finishing a `/wayfinder` chart or work-through session, offer this viewer's link for the map you just touched as your closing step, using the probe-reuse-or-launch flow above: create (or reuse) a session for the current repo, then hand the user `http://<host>:<port>/s/<id>?map=<the map's id>` so the link opens directly on the map just worked, not just the repo's session root. This is an offer, not a requirement — the user may decline or already have a tab open.

## Adapter resolution

The server mirrors `/wayfinder`'s own tracker-resolution rule exactly, so this never silently diverges from what charting/working the map in chat would have resolved: it looks for a `docs/agents/issue-tracker*.md` file naming a "Wayfinding operations" section under the given repo path. A GitHub-shaped doc (`# Issue tracker: GitHub`) resolves the GitHub adapter (via the `gh` CLI — must be installed and authenticated for that repo); anything else, including no such doc at all, defaults to the local-markdown adapter (`.scratch/<effort>/map.md` + `.scratch/<effort>/issues/NN-*.md`). There's no separate flag to set this yourself.

## What the viewer shows

- **Theme toggle**: a button in the topbar switches between the **star map** (default) and **dungeon** renderers — an instant client-side re-render of the already-fetched data, never a refetch or reload. The choice persists per-browser (`localStorage`) across sessions and maps; `?theme=dungeon` in the URL overrides it for a shareable direct link to one theme.
- **Star map** — **Sun** = the map. Its body grows with `√(planet count)` — more frontier-and-beyond tickets reads as visibly "bigger." **Planets** = tickets with no in-map blocker (primary tier), placed at their own orbital radius via golden-angle (phyllotaxis) placement — an organic scatter, not a crowded ring — with radial spacing alone (never angle) guaranteeing no two orbits' moon-shells could ever collide; a planet's own body grows with its dependent count (capped for visual sanity past ~6). **Moons** = every other ticket (dependent tier), orbiting the lowest-numbered primary-tier ticket among its blockers (open or closed) — its canonical host; a dependent shared by 2+ primaries (a diamond dependency) still renders as exactly one body, with a thin cross-link line out to each non-canonical primary it's also blocked behind. A **minimap** is always visible (bottom-right); click it to jump the main view. Pan by dragging, zoom with the wheel, double-click to reset to the initial legible-default scale.
- **Dungeon** — **Entrance** = the map, a stairs-down glyph. **Rooms** = primary-tier tickets, grown outward from the entrance via Watabou's own documented room-growth rule (two side children plus one straight-ahead child per generation). **Chambers** = dependent-tier tickets, grown the same way off their host room. A diamond-shared chamber renders once, with a dashed secret-door line out to each non-canonical room it's also blocked behind. Static (no pan/zoom/minimap) by design — a point-in-time "explored map" feel, a deliberate contrast to the star map's orbital motion. A host room with many dependents can run off-canvas on an unusually large map — a known limitation, not yet fixed.
- Both themes share the same **ring** = status (solid + slow pulse for frontier, dashed for blocked, a glow/wash for claimed, a bold/distinct treatment for closed that stays visually prominent, never faded) and **icon** = ticket type (flask for research, pencil for prototype, flame for grilling, checklist for task — sized independently of the body so a small moon/chamber still renders a legible glyph) vocabulary, each theme restyled into its own palette.
- **Hover or click** a body for its HUD: name, type/status, size/priority if populated, a closed ticket's gist (pulled from the map's own Decisions-so-far bullet, never re-derived from the resolution comment), and a link to its real page. Titles never render as always-on canvas text.

## Out of scope (V1)

Travel/drill-down recentering (double-click to recenter on a non-root ticket) and cross-map portal travel are not built here, against a schema (`tier`/`hostId`/`crossLinkIds`, not `planet`/`moon`-coupled names) deliberately kept neutral so both shipped themes and any future one stay additive. Nothing in this viewer ever claims, closes, comments, or edits a ticket.
