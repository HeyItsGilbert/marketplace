# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-10-04

### Added

- `/grill-ui` skill: adapts the grilling interview workflow (design tree,
  rounds, frontier) to a local Typeform-style browser page instead of a
  numbered-text question block. A bundled Bun server (`server/server.ts`)
  relays rounds between the agent and a single persistent browser tab over a
  WebSocket: the agent posts a round's questions, long-polls for the user's
  answers, and the browser updates live without a page reload as each new
  round arrives. Supports single-select (radio), multi-select (checkbox,
  with a "select any that apply" hint), and free-text-only questions,
  per-option rich previews, a running history sidebar of answered rounds,
  and keyboard shortcuts (`1`-`9`, arrows/`jk`, `Enter`, `Space`, `/`) for
  answering without a mouse — `Enter` accepts a single-select question's
  highlighted/recommended option even with no prior click.
  Research/subagent dispatch for a frontier question always happens
  upstream of posting a round, matching the original grilling skill's
  guidance — the server has no model access and cannot drive that itself.
  Works under any coding-agent harness that can run a persistent background
  process and issue plain HTTP requests, including a bounded-timeout retry
  path for harnesses that cap how long a single command may run.
  Named distinctly from upstream mattpocock/skills' `grilling` so both
  can be installed without a trigger-phrase collision. Binds to loopback
  only by default; `GRILL_UI_HOST=0.0.0.0` opts into also serving the local
  network (e.g. to answer from a phone), logging each reachable LAN
  address. The server tags each process start with a boot id and the page
  auto-reloads when it sees that id change, so a tab left open across a
  server restart (a shipped fix, a crash-recovery restart) picks up the
  current client instead of silently running a stale one.
- Regression test suite (`bun test` for the server, `node --test` for the
  DOM client via jsdom — jsdom's `vm` usage isn't yet Bun-compatible, so
  only the client tests need Node) covering every fix below plus the core
  round/answer flow. Run both with `npm test` from `plugins/grill-ui/`.

### Changed

- No longer omp-exclusive: the agent-facing protocol in `SKILL.md` was
  rewritten off omp-specific `bash`-tool jargon (named services, `ready`
  log-regex, `proc://` shutdown) onto harness-neutral instructions (start a
  background process however your harness does that; long-poll with no
  deadline if your harness allows it, otherwise poll with a bounded
  `--max-time` and retry on timeout — the round stays pending server-side
  either way, so retrying never loses or duplicates an answer). Bun is still
  the only hard runtime requirement. Registered in
  `.claude-plugin/marketplace.json` alongside `.omp-plugin/marketplace.json`
  accordingly.
- The relay now rejects cross-origin requests (any `Origin` header that
  doesn't match the server's own origin gets a 403), closing a CSRF-style
  gap where another open tab could otherwise read or answer the pending
  round on an unauthenticated localhost server.

### Fixed

Found through live dogfooding against a real browser, each with a
regression test added alongside the fix:

- The Submit/Next button was a dead end for a free-text question or a
  multi-select question in the last slot of a round: only the
  keyboard-shortcut paths ever set the internal "confirmed" flag the button
  and `Enter` both gated on, so clicking Submit after typing (without also
  pressing the keyboard shortcut) silently did nothing.
- Hovering a button could make it flicker between hover/non-hover states —
  native browser button chrome rendering a slightly different box on
  hover/focus on some platforms, shifting the box under the cursor. Fixed
  by resetting `appearance` and giving every state a fixed, size-stable
  style.
- Pressing a number key to answer a question that then auto-advanced to a
  free-text question could type that digit into the new question's text
  box — the keydown handler never called `preventDefault()`, so once focus
  moved to the new field mid-handler, the browser's own default action for
  that same keypress still fired against it.
- Starting a second server instance while a port was already bound always
  threw instead of retrying on the next port: the conflict check read
  `err.message` (an English sentence) instead of `err.code`
  (`"EADDRINUSE"`), so it never actually matched.
