// grill-ui local server: a dumb relay between orchestrating agents and
// browser tabs. It never calls a model and never spawns a subagent — it
// only holds each session's pending round, pushes it to that session's
// browser tab(s) live, and blocks the agent's long-poll until the browser
// submits answers for that round.
//
// The server is a single long-lived process meant to be shared by every
// concurrent interview on this machine instead of one process per
// interview: each interview gets its own *session* (its own pending round,
// history, and done flag), reachable at its own `/s/<id>` URL and `/s/<id>/ws`
// socket, all multiplexed over the one port. That's what makes running two
// interviews at once (two different agent conversations, or two topics in
// one) just a matter of opening two tabs instead of hunting for a second
// free port.

import { homedir, networkInterfaces } from "node:os";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Option = { label: string; description?: string; preview?: string };
type Question = {
  id: string;
  header: string;
  question: string;
  options?: Option[];
  recommended?: number;
  multi?: boolean;
};
type Round = { id: string; questions: Question[] };
type Answers = Record<string, string | string[]>;

type Session = {
  id: string;
  label: string;
  pendingRound: Round | null;
  pendingWaiters: Array<(answers: Answers) => void>;
  history: Array<{ round: Round; answers: Answers }>;
  sessionDone: boolean;
  // Set when `sessionDone` flips true — the clock `pruneExpiredSessions`
  // measures a finished session's age against. `null` for a
  // still-active session, which pruning never touches regardless of age.
  doneAt: number | null;
  sockets: Set<WebSocket>;
};

type SocketData = { sessionId: string };

function broadcast(session: Session, msg: unknown) {
  const data = JSON.stringify(msg);
  for (const ws of session.sockets) {
    try {
      ws.send(data);
    } catch {
      // dead socket; `close` will clean it up
    }
  }
}

// Narrows an unknown decoded JSON value to the `questions` array a round
// POST must carry, without trusting a type assertion on attacker-controlled
// input. Returns `null` for anything else — `null` itself, a non-object, a
// missing `questions` key, a non-array value (even one that happens to
// carry a numeric `.length`), or an empty array — so a malformed body can
// never reach `pendingRound`/`history`.
function parseRoundQuestions(value: unknown): Question[] | null {
  if (typeof value !== "object" || value === null || !("questions" in value)) return null;
  const { questions } = value;
  if (!Array.isArray(questions) || questions.length === 0) return null;
  // Narrowed to a non-empty array; individual question shapes are still
  // only as trustworthy as the caller, same as every other field the
  // browser/agent sends us — the server relays them, it doesn't execute them.
  return questions as Question[];
}

// Same idea for a submitted answers map: every value must actually be a
// string or string array before it's trusted into `history`/returned from
// the long-poll, rather than assuming the WebSocket payload matches `Answers`.
function isAnswers(value: unknown): value is Answers {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).every(
    (v) => typeof v === "string" || (Array.isArray(v) && v.every((x) => typeof x === "string")),
  );
}

// A session's label is caller-supplied, free text (shown verbatim in the
// browser tab's header) — only its type and non-emptiness are enforced.
function parseLabel(value: unknown): string {
  if (typeof value !== "object" || value === null || !("label" in value)) return "Untitled session";
  const { label } = value as { label: unknown };
  return typeof label === "string" && label.trim() ? label.trim() : "Untitled session";
}

// A caller — typically an orchestrating agent passing its own harness
// session id — may request a specific session id instead of taking a
// server-minted one, so that reconnecting under the same harness session
// (after a long-poll retry loop, a crash, or a fresh round later in the
// same conversation) lands back on the same session deterministically
// instead of needing a side channel to remember a random id. Restricted to
// a safe URL-path-segment charset since it's embedded directly in
// `/s/<id>` — returns `null` for anything absent or unsafe, which the
// caller falls back to minting a random id for.
function parseRequestedId(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("id" in value)) return null;
  const { id } = value as { id: unknown };
  return typeof id === "string" && /^[A-Za-z0-9._-]{1,200}$/.test(id) ? id : null;
}

function publicFile(name: string) {
  return new URL(`./public/${name}`, import.meta.url);
}

const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// Exported for direct unit testing — a pure sweep over `sessions`,
// deleting any session that finished more than `ttlMs` ago. A still
// pending/open session is never touched by this regardless of age; only
// `POST /s/:id/done` starts a session's clock. This is what keeps a
// long-lived shared server's memory (and `GET /sessions`/the picker list)
// from growing without bound across weeks of use — a finished session's
// Q&A history is retained only long enough to be worth re-reading, not
// forever. Any socket still attached to a swept session is closed so an
// open tab discovers it's gone on its very next reconnect check instead
// of silently retrying an id that no longer exists.
export function pruneExpiredSessions(sessions: Map<string, Session>, now: number, ttlMs: number): void {
  for (const [id, session] of sessions) {
    if (!session.sessionDone || session.doneAt === null) continue;
    if (now - session.doneAt < ttlMs) continue;
    for (const ws of session.sockets) {
      try {
        ws.close();
      } catch {
        // already closed
      }
    }
    sessions.delete(id);
  }
}

export function startServer(host: string, startPort: number, attemptsLeft = 20): Bun.Server {
  // Scoped to this call instead of module-level: each `startServer()`
  // invocation gets its own session table and boot id, isolated from any
  // other server built in the same process. In production there's only
  // ever one call (the module's own entrypoint below), so this changes
  // nothing there — it only matters for tests, which build several
  // independent servers in one `bun test` process and would otherwise leak
  // sessions between them through a shared module-level `Map`.
  const sessions = new Map<string, Session>();
  // Changes every time this server starts. A reconnecting browser tab
  // compares it against the value it saw on its first connection — a
  // mismatch means the server restarted (picked up code changes, or
  // recovered from a crash) while the tab stayed open, so the tab is told
  // to reload and pick up the current app.js/style.css instead of silently
  // continuing to run a stale version against the new server.
  const bootId = crypto.randomUUID();
  const sessionTtlMs = (() => {
    const raw = Number(process.env.GRILL_UI_SESSION_TTL_MS);
    return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_SESSION_TTL_MS;
  })();

  async function fetch(req: Request, srv: { upgrade: (req: Request, opts?: { data: SocketData }) => boolean }) {
    const url = new URL(req.url);
    const origin = req.headers.get("origin");
    if (origin !== null && origin !== url.origin) {
      return new Response("Cross-origin requests are forbidden", { status: 403 });
    }
    pruneExpiredSessions(sessions, Date.now(), sessionTtlMs);

    const wsMatch = url.pathname.match(/^\/s\/([^/]+)\/ws$/);
    if (wsMatch) {
      const session = sessions.get(wsMatch[1]);
      if (!session) return new Response("Unknown session", { status: 404 });
      if (srv.upgrade(req, { data: { sessionId: wsMatch[1] } })) return undefined as unknown as Response;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // GET doubles as the discovery probe an agent uses to tell whether a
    // grill-ui server is already running on the expected port before
    // deciding to spawn a new process — see SKILL.md.
    if (req.method === "GET" && url.pathname === "/sessions") {
      const list = [...sessions.values()].map((s) => ({
        id: s.id,
        label: s.label,
        done: s.sessionDone,
        pending: s.pendingRound !== null,
        rounds: s.history.length,
      }));
      return Response.json({ sessions: list });
    }

    if (req.method === "POST" && url.pathname === "/sessions") {
      let parsed: unknown = {};
      try {
        const text = await req.text();
        if (text) parsed = JSON.parse(text);
      } catch {
        return Response.json({ error: "invalid JSON body" }, { status: 400 });
      }
      const requestedId = parseRequestedId(parsed);
      // Reusing an existing id returns that session as-is (its label and
      // history untouched) instead of erroring — the common case is an
      // agent passing its own harness session id on every round across a
      // whole conversation, so the first call creates the session and
      // every later call in that same conversation is a no-op lookup.
      const existing = requestedId ? sessions.get(requestedId) : undefined;
      if (existing) {
        return Response.json({ id: existing.id, label: existing.label, url: `/s/${existing.id}` });
      }
      const id = requestedId ?? crypto.randomUUID();
      const session: Session = {
        id,
        label: parseLabel(parsed),
        pendingRound: null,
        pendingWaiters: [],
        history: [],
        sessionDone: false,
        doneAt: null,
        sockets: new Set(),
      };
      sessions.set(id, session);
      return Response.json({ id, label: session.label, url: `/s/${id}` });
    }

    const roundsMatch = url.pathname.match(/^\/s\/([^/]+)\/rounds$/);
    if (req.method === "POST" && roundsMatch) {
      const session = sessions.get(roundsMatch[1]);
      if (!session) return Response.json({ error: "unknown session" }, { status: 404 });
      if (session.sessionDone) {
        return Response.json({ error: "session already marked done" }, { status: 409 });
      }
      if (session.pendingRound) {
        return Response.json({ error: "A round is already pending" }, { status: 409 });
      }
      let parsed: unknown;
      try {
        parsed = await req.json();
      } catch {
        return Response.json({ error: "invalid JSON body" }, { status: 400 });
      }
      const questions = parseRoundQuestions(parsed);
      if (!questions) {
        return Response.json({ error: "questions required" }, { status: 400 });
      }
      const round: Round = { id: crypto.randomUUID(), questions };
      session.pendingRound = round;
      broadcast(session, { type: "round", roundId: round.id, questions: round.questions });
      return Response.json({ roundId: round.id });
    }

    const waitMatch = url.pathname.match(/^\/s\/([^/]+)\/rounds\/([^/]+)\/wait$/);
    if (req.method === "GET" && waitMatch) {
      const session = sessions.get(waitMatch[1]);
      if (!session) return Response.json({ error: "unknown session" }, { status: 404 });
      const id = waitMatch[2];
      const past = session.history.find((h) => h.round.id === id);
      if (past) return Response.json({ answers: past.answers });
      if (!session.pendingRound || session.pendingRound.id !== id) {
        return Response.json({ error: "unknown round" }, { status: 404 });
      }
      return new Promise<Response>((resolve) => {
        session.pendingWaiters.push((answers) => resolve(Response.json({ answers })));
      });
    }

    const doneMatch = url.pathname.match(/^\/s\/([^/]+)\/done$/);
    if (req.method === "POST" && doneMatch) {
      const session = sessions.get(doneMatch[1]);
      if (!session) return Response.json({ error: "unknown session" }, { status: 404 });
      session.sessionDone = true;
      session.doneAt = Date.now();
      broadcast(session, { type: "done" });
      return Response.json({ ok: true });
    }

    if (url.pathname === "/" || url.pathname === "/index.html" || /^\/s\/[^/]+\/?$/.test(url.pathname)) {
      return new Response(Bun.file(publicFile("index.html")), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    if (url.pathname === "/app.js") {
      return new Response(Bun.file(publicFile("app.js")), {
        headers: { "Content-Type": "application/javascript; charset=utf-8" },
      });
    }
    if (url.pathname === "/style.css") {
      return new Response(Bun.file(publicFile("style.css")), {
        headers: { "Content-Type": "text/css; charset=utf-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  }

  const websocket = {
    open(ws: WebSocket & { data: SocketData }) {
      const session = sessions.get(ws.data.sessionId);
      if (!session) {
        ws.close();
        return;
      }
      session.sockets.add(ws);
      ws.send(JSON.stringify({ type: "boot", bootId, label: session.label }));
      for (const h of session.history) {
        ws.send(
          JSON.stringify({
            type: "history",
            roundId: h.round.id,
            questions: h.round.questions,
            answers: h.answers,
          }),
        );
      }
      if (session.sessionDone) {
        ws.send(JSON.stringify({ type: "done" }));
      } else if (session.pendingRound) {
        ws.send(
          JSON.stringify({
            type: "round",
            roundId: session.pendingRound.id,
            questions: session.pendingRound.questions,
          }),
        );
      }
    },
    close(ws: WebSocket & { data: SocketData }) {
      sessions.get(ws.data.sessionId)?.sockets.delete(ws);
    },
    message(ws: WebSocket & { data: SocketData }, raw: string | Buffer) {
      const session = sessions.get(ws.data.sessionId);
      if (!session) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (typeof parsed !== "object" || parsed === null || !("type" in parsed) || !("roundId" in parsed)) return;
      const { type, roundId } = parsed;
      if (
        type !== "submit" ||
        typeof roundId !== "string" ||
        !session.pendingRound ||
        roundId !== session.pendingRound.id
      ) {
        return;
      }
      const rawAnswers = "answers" in parsed ? parsed.answers : undefined;
      const answers: Answers = isAnswers(rawAnswers) ? rawAnswers : {};
      const finished = session.pendingRound;
      session.pendingRound = null;
      session.history.push({ round: finished, answers });
      const waiters = session.pendingWaiters;
      session.pendingWaiters = [];
      for (const resolve of waiters) resolve(answers);
    },
  };

  let port = startPort;
  for (let i = 0; i < attemptsLeft; i++) {
    try {
      // idleTimeout: 0 disables Bun's default 10s idle-connection close —
      // the /s/:id/rounds/:id/wait long-poll intentionally holds a
      // connection open with no data until the round is answered.
      return Bun.serve({ hostname: host, port, fetch, websocket, idleTimeout: 0 });
    } catch (err) {
      // Bun's thrown error puts the machine-readable reason in `.code`
      // (e.g. "EADDRINUSE"), not in `.message` — `.message` is an
      // English sentence ("Failed to start server. Is port N in use?")
      // that never contains the code string itself.
      const isPortInUse = err && typeof err === "object" && "code" in err && err.code === "EADDRINUSE";
      if (isPortInUse) {
        port++;
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Could not bind to a port starting at ${startPort}`);
}

function lanAddresses(): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (!entry.internal && entry.family === "IPv4") addresses.push(entry.address);
    }
  }
  return addresses;
}

// Optional on-disk preferences so a user who always wants the same port
// (or a non-loopback hostname advertised in the startup link — a
// Tailscale/VPN name, a reverse-proxy domain, etc.) doesn't have to set
// `GRILL_UI_*` env vars on every single `bun run server.ts`. Env vars still
// win when set, so a one-off override never has to touch the file.
type FileConfig = { host?: string; port?: number; advertiseHost?: string };

// Narrows an unknown decoded JSON value to the subset of fields this
// server understands, dropping anything the wrong type or empty — a
// malformed or partially-garbage config file degrades to "unset" for the
// affected field(s) instead of crashing startup or poisoning a value with
// e.g. `NaN`.
export function parseFileConfig(raw: string): FileConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null) return {};
  const obj = parsed as Record<string, unknown>;
  const config: FileConfig = {};
  if (typeof obj.host === "string" && obj.host.trim()) config.host = obj.host.trim();
  if (typeof obj.port === "number" && Number.isInteger(obj.port) && obj.port > 0) config.port = obj.port;
  if (typeof obj.advertiseHost === "string" && obj.advertiseHost.trim()) config.advertiseHost = obj.advertiseHost.trim();
  return config;
}

function loadFileConfig(path: string): FileConfig {
  try {
    return parseFileConfig(readFileSync(path, "utf8"));
  } catch {
    // No config file, or it's unreadable — an optional preferences file
    // missing or unusable should never fail the whole server start.
    return {};
  }
}

function defaultConfigPath(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(xdgConfigHome, "grill-ui", "config.json");
}

// Precedence: env var > config file > built-in default, applied field by
// field — e.g. a config file with only `advertiseHost` set still falls
// through to the default port and `GRILL_UI_PORT`, it doesn't force the
// caller to repeat every field just to set one.
export function resolveServerConfig(
  fileConfig: FileConfig,
  env: Record<string, string | undefined>,
): { host: string; port: number; advertiseHost: string } {
  const envPort = Number(env.GRILL_UI_PORT);
  return {
    host: env.GRILL_UI_HOST || fileConfig.host || "127.0.0.1",
    port: (Number.isInteger(envPort) && envPort > 0 ? envPort : undefined) ?? fileConfig.port ?? 4829,
    advertiseHost: env.GRILL_UI_ADVERTISE_HOST || fileConfig.advertiseHost || "127.0.0.1",
  };
}

if (import.meta.main) {
  const configPath = process.env.GRILL_UI_CONFIG_PATH || defaultConfigPath();
  const fileConfig = loadFileConfig(configPath);
  const { host: requestedHost, port: requestedPort, advertiseHost } = resolveServerConfig(fileConfig, process.env);

  let server: Bun.Server;
  try {
    // A single attempt, not `startServer`'s default retry-the-next-port
    // fallback: this process is meant to be *the* shared grill-ui server
    // for this machine, discoverable at a known port. Silently relocating
    // to a fallback port on conflict would make a startup race's loser
    // undiscoverable — another agent's discovery probe only checks the
    // expected port, so it would never find this instance and would spin
    // up yet another redundant server instead of reusing the winner.
    // Failing loudly instead sends that second launcher back to its
    // discovery probe, where the winner is now there to find.
    server = startServer(requestedHost, requestedPort, 1);
  } catch (err) {
    console.error(
      `grill-ui: could not bind ${requestedHost}:${requestedPort} (${err instanceof Error ? err.message : err})`,
    );
    console.error(
      `Check whether a grill-ui server is already running there — GET http://${requestedHost}:${requestedPort}/sessions — and reuse it, or set GRILL_UI_PORT (or the config file's "port") to use a different one.`,
    );
    process.exit(1);
  }

  // The `bash` tool's service readiness check matches this line via a log
  // regex ("Listening on"), independent of the host text — `advertiseHost`
  // defaults to loopback (always reachable from this machine regardless of
  // what `GRILL_UI_HOST` bound to) but can be overridden via
  // `GRILL_UI_ADVERTISE_HOST` or the config file's `advertiseHost`, e.g. to
  // a Tailscale/VPN hostname or reverse-proxy domain the user actually
  // reaches this machine through.
  console.log(`Listening on http://${advertiseHost}:${server.port}`);

  if (requestedHost === "0.0.0.0" || requestedHost === "::") {
    const lan = lanAddresses();
    if (lan.length === 0) {
      console.log("GRILL_UI_HOST requested network exposure, but no non-internal IPv4 address was found.");
    }
    for (const address of lan) {
      console.log(`Also reachable on the local network at http://${address}:${server.port}`);
    }
  }
}
