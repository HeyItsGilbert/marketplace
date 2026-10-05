# grill-ui

A marketplace plugin that adds `/grill-ui`: a grilling-style decision interview rendered as a local, Typeform-style browser page instead of a wall of numbered chat text. Works under any coding-agent harness that can run a persistent background process and issue plain HTTP requests — see [Requirements](#requirements).

## What it adds

A bundled Bun server relays "rounds" (batches of questions) between the agent and a persistent browser tab over a WebSocket, one tab per interview. The server is a single shared process — concurrent interviews each get their own session (`/s/<id>`), so running two design interviews at once is just two browser tabs on the same server instead of hunting for a second port. The agent posts a round, long-polls for the answer, and the tab updates live — no page reload between rounds, and a running sidebar shows every previously-answered round in that session. Supports single-select, multi-select, and free-text-only questions, per-option rich previews, and full keyboard operation (`1`-`9`, arrows/`jk`, `Enter`, `Space`, `/`).

## Installation

```text
/marketplace add HeyItsGilbert/marketplace
/marketplace install grill-ui@my-plugins
```

or, under Claude Code:

```text
/plugin marketplace add HeyItsGilbert/marketplace
/plugin install grill-ui@my-plugins
```

**Prerequisite:** [Bun](https://bun.sh) on `PATH`. The server is a `.ts` file run directly with `bun run`.

## Configuration

Always want a non-default port, or want the link advertised in the
startup log to use a hostname other than loopback (a Tailscale/VPN name,
a reverse-proxy domain)? Drop a config file at
`$XDG_CONFIG_HOME/grill-ui/config.json` (or `~/.config/grill-ui/config.json`):

```json
{
  "host": "127.0.0.1",
  "port": 5173,
  "advertiseHost": "my-box.ts.net"
}
```

All fields are optional. `GRILL_UI_HOST`/`GRILL_UI_PORT`/`GRILL_UI_ADVERTISE_HOST`
env vars (and `GRILL_UI_CONFIG_PATH` to point at a different config file)
override the matching field for a single launch without touching the file.

## Usage pattern: chat first, escalate to grill-ui

`/grill-ui` is **user-invoked** (`disable-model-invocation: true`), deliberately — it doesn't auto-fire the moment a conversation looks like a design discussion. Two reasons:

1. It would collide with upstream [mattpocock/skills](https://github.com/mattpocock/skills)' `grilling` skill, which matches similar trigger phrases. Both installed and both model-invoked would be ambiguous about which fires.
2. **Interview length isn't knowable before the first question is asked.** A static "this looks like it'll be long" trigger decided from your opening message is guessing; the real signal — how many rounds the design tree actually needs — only shows up once a round or two of frontier-mapping has happened.

So the intended flow is: start a decision interview in plain chat (numbered questions, or the `ask` tool), same as always. If, after the first round, it's clear the frontier is going to need several more rounds, the agent should proactively offer to switch to `grill-ui` for the rest rather than deciding upfront — you approve or decline each time. A short interview just stays in chat and never needs grill-ui at all.

This is agent judgement, not a skill-system feature. Under omp specifically, the skill frontmatter has no declarative "invoke conditionally on expected length" knob (confirmed against `skills.customDirectories`/`disableModelInvocation`/`hide`: none of them support this), and the skill stays discoverable even while user-invoked — its name and one-line description are always visible in the system prompt's skill list, per omp's skill-metadata exposure. Other harnesses' handling of a `disable-model-invocation` skill's discoverability may differ; the escalate-mid-session judgement call applies regardless.

## Protocol (for agent authors / maintainers)

See `skills/grill-ui/SKILL.md` for the full agent-facing protocol (`POST /sessions`, `POST /s/:id/rounds`, long-polling `GET /s/:id/rounds/:roundId/wait`, `POST /s/:id/done`, the question JSON shape). The server is a dumb relay only: it never calls a model and never spawns a subagent. Research or subagent dispatch for a frontier question always happens upstream of posting a round.

## Development

```sh
cd plugins/grill-ui
bun install
npm test
```

Two test suites: `bun test` for server-side logic (`server.test.ts`, real `Bun.serve` binding) and `node --test` for the DOM client (`skills/grill-ui/server/public/app.test.mjs`, via jsdom). Both run under `npm test`. The client tests require Node specifically — jsdom's script execution depends on Node's `vm` module, which Bun does not yet implement compatibly (confirmed independently: both `window.eval` and real `<script>` execution throw inside jsdom under Bun).

## Requirements

- [Bun](https://bun.sh) on `PATH` — the server is a `.ts` file run directly with `bun run`.
- A harness that can run a long-lived background process (a named service, `run_in_background`, `nohup … &`, or equivalent) and issue plain HTTP requests (`curl` or similar) from its shell/tool access. True of omp and Claude Code's own Bash tool, and most agentic coding harnesses generically — see `skills/grill-ui/SKILL.md` for how the agent-facing instructions stay harness-neutral (e.g. falling back to a bounded `--max-time` + retry loop for the long-poll on a harness that caps command duration, instead of assuming an unbounded wait).
