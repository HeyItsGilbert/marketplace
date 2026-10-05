---
name: grill-ui
description: Run a grilling-style decision interview through a local, Typeform-style browser page instead of chat text.
disable-model-invocation: true
---

# Grill UI

Interview the user relentlessly until you reach a shared understanding, using a small local Bun server and a single browser tab for every round instead of a numbered-text question block. Map this as a **design tree**: every decision branches into the decisions that hang off it.

The server is a dumb relay — it never calls a model and never spawns a subagent. It's also a single long-lived process meant to be **shared by every concurrent grill-ui interview on this machine**, not restarted per interview: each interview gets its own *session* (its own pending round, history, and done flag), multiplexed over the one server/port and reachable at its own `/s/<id>` browser URL. It only holds each session's pending round, pushes it to that session's browser tab live over a WebSocket, and blocks your `wait` request until the browser submits answers for that round. Research and subagent dispatch are always your job, done before a round is posted (see **Find facts yourself**).

## Reuse the shared server, then create your session

1. **Check whether a server is already running** before starting one: `GET http://127.0.0.1:<port>/sessions` (default port `4829`, unless the user has overridden it — see **Persistent preferences** below) with a short timeout.
   - A JSON response means one is already up — reuse it, skip straight to step 2.
   - A connection failure means none is running yet — launch the bundled server as a long-running background process and keep it running for the rest of this and every other concurrent grill-ui interview, not just your own:
     ```
     bun run <skill-directory>/server/server.ts
     ```
     Start it however your harness runs a persistent background command (a named service, `run_in_background`, `nohup … &` with its PID captured, etc.). Wait for its startup log line, `Listening on http://<host>:<port>`, before continuing; that confirms it's ready and tells you the actual bound port (and advertised host — see **Persistent preferences** below) to use for the rest of this flow. If it instead exits with "could not bind" (another process — likely another grill-ui launch that raced yours — already took that port), that's deliberate: it never silently falls back to a nearby port, since a fallback nobody discovers defeats the whole shared-server point. Go back to the top of step 1 and re-probe; the winner of the race is now there to find.
2. **Create (or re-attach to) your session**:
   ```sh
   curl -s -X POST http://127.0.0.1:<port>/sessions -H 'content-type: application/json' \
     -d '{"id": "<your harness session id>", "label": "<short description of this interview>"}'
   ```
   Pass your own harness/conversation's session identifier as `id` if your harness exposes one — reusing the same `id` is idempotent (it returns the existing session instead of erroring or creating a duplicate), so posting this again later in the same conversation (after a long-poll retry loop, a crash, or just a later round) reattaches to the same session instead of minting a new, disconnected one. If your harness exposes no such identifier, generate one yourself (any short stable string) and hold onto it for the rest of the conversation; `id` is entirely optional — omit it and the server mints a random one — but then it's on you to remember the returned id yourself for reuse. The response is `{"id", "label", "url"}`, where `url` is `/s/<id>`.

Combine the advertised host:port from the startup log line (not necessarily `127.0.0.1` — see **Persistent preferences** below) with that `url` and give the result to the user **once**, as a plain link — do not open it yourself. The user opens it in their own browser and keeps it open side by side with the terminal; the page updates live as each new round arrives, so there's no second link to send for this interview. The page's header shows your session's `label`, and its root URL (e.g. `http://127.0.0.1:<port>/`) lists every session currently on the server — including other concurrent interviews from other conversations — so the user can navigate between them from one tab if they have several going at once.

By default the server only binds to loopback (`127.0.0.1`) — reachable from this machine alone. If the user wants to answer from another device on the same network (e.g. a phone or a second computer), start it with `GRILL_UI_HOST=0.0.0.0 bun run <skill-directory>/server/server.ts` instead; it then also logs a `http://<lan-ip>:<port>` line for each reachable network interface — hand the user whichever link matches how they want to answer. Only do this on a network the user trusts: the relay has no authentication beyond rejecting cross-origin requests, so anyone on that network could read or answer any open session while it's exposed.

## Persistent preferences (optional)

A user who always wants the same non-default port, or wants the startup
link to advertise a hostname other than loopback (a Tailscale/VPN name, a
reverse-proxy domain — anything that actually resolves back to this
machine for them), can set it once instead of exporting `GRILL_UI_*` env
vars on every launch. The server reads an optional JSON config file at
startup — `$XDG_CONFIG_HOME/grill-ui/config.json` (or `~/.config/grill-ui/config.json`
if `XDG_CONFIG_HOME` is unset), or wherever `GRILL_UI_CONFIG_PATH` points:

```json
{
  "host": "127.0.0.1",
  "port": 5173,
  "advertiseHost": "my-box.ts.net"
}
```

All three fields are optional and independent — set only the ones that
differ from the default. Precedence per field is **env var > config file >
built-in default**, so a one-off override (`GRILL_UI_PORT=4829 bun run
server.ts`) never has to touch the file. This is a human-facing setting,
not something you manage: don't create or edit this file yourself unless
the user explicitly asks you to. What it does mean for you is that the
port in the startup log line can differ from the `4829` default even
though no `GRILL_UI_PORT` was set for this launch — always read the actual
bound port from that line (`Listening on http://<host>:<port>`), never
assume it.

## Work the tree in rounds

The **frontier** is every decision whose prerequisites are already settled — the questions you can ask _now_ without guessing at answers you haven't heard yet. For each round:

1. Write the round's JSON body (see **Shape each question**) to a temp file with the `write` tool, to avoid shell-escaping question text.
2. `POST /s/<id>/rounds` with that file, `<id>` being your session's id — the server pushes the round to the open browser tab immediately, no page reload:
   ```sh
   curl -s -X POST http://127.0.0.1:<port>/s/<id>/rounds -H 'content-type: application/json' -d @round.json
   ```
3. Take the returned `roundId` and long-poll for the answer — this call does not return until the user finishes the round in the browser:
   ```sh
   curl -s --max-time 0 http://127.0.0.1:<port>/s/<id>/rounds/<roundId>/wait
   ```
   If your harness lets a single command run with no deadline (e.g. omp's `bash` tool with `timeout: 0`), run this as its own call that way and let it hold indefinitely. If your harness caps how long a single command can run, use that cap as curl's `--max-time` instead and **retry the same `GET` on a timeout** — the round stays pending on the server until it's actually answered, so re-polling picks up exactly where it left off and never misses or duplicates an answer. Either way, its response is `{"answers": {...}}`, keyed by each question's `id`; an answer chosen from single-select options is a string, one chosen from multi-select options is an array, and any answer entered through a free-text or "answer in your own words" field is a string.

Each round the user's answers reshape the tree — settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and post the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

## Shape each question

For every frontier decision, add one entry to the round's `questions` array:

- `id` — a stable, kebab-case slug for the decision (e.g. `storage-engine`), unique within the round.
- `header` — a short (1-3 word) label shown as the eyebrow above the question.
- `question` — the full question, including context; it may run multiple paragraphs when the tradeoff needs it.
- `options` — 2-5 concrete choices, each a `label` (short) plus a `description` (the tradeoff it carries). **Omit `options` entirely for a genuinely open-ended question** — the browser then renders a plain text box instead of choice cards, with no forced enumeration.
- `recommended` — the zero-based index of your recommended option (ignored when `options` is omitted).
- `preview` (optional, per option) — reach for this when a label and one-line description undersell the tradeoff: a short comparison, a minimal code/config snippet (fenced with triple backticks), or a small diagram. Spend it on the option(s) where it earns its weight, not reflexively on every option.
- `multi` — set `true` only when the decision is genuinely independent toggles the user may want several of at once; never for mutually exclusive alternatives.

Even when `options` is present, the browser always offers an "answer in your own words" field alongside the cards — so never add your own "Other" or "something else" option.

## Find facts yourself, before posting the round

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it **before** including that question in a round — a round you post is always fully formed, never a placeholder waiting on research. Don't block the rest of the frontier on it: a running exploration is an unsettled prerequisite, so post the rest of the frontier now and hold the researched question for whichever round it's ready in time for.

## Done

Your session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed.

```sh
curl -s -X POST http://127.0.0.1:<port>/s/<id>/done
```

This makes your session's browser tab show a completion screen; posting a round to this session after this is rejected. It does **not** affect any other session on the server — leave the server process running for them. Only stop it yourself if you're confident you're the one who started it (your discovery probe in step 1 found nothing running) **and** `GET /sessions` now shows no other session still pending (`"pending": true` or `"done": false`); otherwise leave it running for whoever started it or is still mid-interview. Do not act on the gathered answers until the user confirms you have reached a shared understanding.

A finished session isn't kept forever: the server prunes a `done` session once it's been finished longer than `GRILL_UI_SESSION_TTL_MS` (default 24 hours), so a long-lived shared server's session table doesn't grow without bound across weeks of use. This never touches a still-open session, only ones already marked done. If a browser tab's session disappears out from under it (pruned, or the server restarted and lost its in-memory sessions entirely), the tab detects that on its next reconnect and returns itself to the session picker — nothing you need to handle, but worth knowing if the user reports a tab suddenly showing the picker instead of their interview.
