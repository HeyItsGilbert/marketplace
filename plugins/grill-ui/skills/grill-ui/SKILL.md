---
name: grill-ui
description: Run a grilling-style decision interview through a local, Typeform-style browser page instead of chat text.
disable-model-invocation: true
---

# Grill UI

Interview the user relentlessly until you reach a shared understanding, using a small local Bun server and a single browser tab for every round instead of a numbered-text question block. Map this as a **design tree**: every decision branches into the decisions that hang off it.

The server is a dumb relay — it never calls a model and never spawns a subagent. It only holds one pending round, pushes it to the browser live over a WebSocket, and blocks your `wait` request until the browser submits answers for that round. Research and subagent dispatch are always your job, done before a round is posted (see **Find facts yourself**).

## Start the server once per session

On the first round, launch the bundled server as a named background service and keep it running for the rest of the session — do not restart it per round:

```
bun run <skill-directory>/server/server.ts
```

Use the `bash` tool's service mode: a unique `name` (e.g. `grill-ui`) and `ready: { log: "Listening on http://127\\.0\\.0\\.1:\\d+" }`. Read the bound URL from that log line and give it to the user **once**, as a plain link — do not open it yourself. The user opens it in their own browser and keeps it open side by side with the terminal; the page updates live as each new round arrives, so there's no second link to send.

If a `grill-ui` service is already running for this session (a later round), skip this step entirely and reuse it.

By default the server only binds to loopback (`127.0.0.1`) — reachable from this machine alone. If the user wants to answer from another device on the same network (e.g. a phone or a second computer), start it with `GRILL_UI_HOST=0.0.0.0 bun run <skill-directory>/server/server.ts` instead; it then also logs a `http://<lan-ip>:<port>` line for each reachable network interface — hand the user whichever link matches how they want to answer. Only do this on a network the user trusts: the relay has no authentication, so anyone on that network could read or answer the open round while it's exposed.

## Work the tree in rounds

The **frontier** is every decision whose prerequisites are already settled — the questions you can ask _now_ without guessing at answers you haven't heard yet. For each round:

1. Write the round's JSON body (see **Shape each question**) to a temp file with the `write` tool, to avoid shell-escaping question text.
2. `POST /rounds` with that file — the server pushes the round to the open browser tab immediately, no page reload:
   ```sh
   curl -s -X POST http://127.0.0.1:<port>/rounds -H 'content-type: application/json' -d @round.json
   ```
3. Take the returned `roundId` and long-poll for the answer — this call does not return until the user finishes the round in the browser, so let it hold with no timeout:
   ```sh
   curl -s --max-time 0 http://127.0.0.1:<port>/rounds/<roundId>/wait
   ```
   Run this as its own `bash` call with `timeout: 0` so the session-level deadline doesn't cut off the wait. Its response is `{"answers": {...}}`, keyed by each question's `id`; a single-select or free-text answer is a string, a multi-select answer is an array of the selected labels.

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

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed.

```sh
curl -s -X POST http://127.0.0.1:<port>/done
```

This makes the browser show a completion screen; posting a round after this is rejected. Then stop the `grill-ui` service. Do not act on the gathered answers until the user confirms you have reached a shared understanding.
