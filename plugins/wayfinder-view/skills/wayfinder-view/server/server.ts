// wayfinder-view local server: a single long-lived Bun process, shared by
// every concurrent wayfinder-view session on this machine instead of one
// process per repo — mirrors grill-ui's exact shared-server pattern
// (well-known port, probe-reuse-or-launch, `/s/<id>` per session). Unlike
// grill-ui it's strictly read-only and never pushes live updates: a
// session's map data is computed fresh from the tracker on every
// `GET .../api/maps...` call, and the client only calls that on page load
// or an explicit manual refresh — never polling, never a WebSocket.
//
// A session scopes one repo path to the tracker adapter (GitHub or
// local-markdown) `/wayfinder` itself would resolve for that repo — see
// `detectTrackerKind`. Creating a session for a path already open is
// idempotent: the existing session is returned, not duplicated.

import { readFileSync, readdirSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import * as githubAdapter from "./adapters/github.ts";
import * as localMarkdownAdapter from "./adapters/local-markdown.ts";
import type { MapSummary, MapViewModel } from "./view-model.ts";

export type TrackerKind = "github" | "local-markdown";

type Session = { id: string; repoPath: string; tracker: TrackerKind };

type Adapter = {
  listMapSummaries(repoPath: string): MapSummary[];
  loadMap(repoPath: string, mapId: string): MapViewModel | null;
};

function adapterFor(tracker: TrackerKind): Adapter {
  return tracker === "github" ? githubAdapter : localMarkdownAdapter;
}

// Mirrors `/wayfinder`'s own tracker-resolution rule exactly, so adapter
// selection here never silently diverges from what charting/working a map
// in chat would have resolved: a `docs/agents/issue-tracker*.md` file
// naming a "Wayfinding operations" section whose tracker is GitHub selects
// the GitHub adapter; anything else (a different tracker's doc, or no doc
// at all) defaults to local-markdown — the only other adapter this plugin
// ships.
export function detectTrackerKind(repoPath: string): TrackerKind {
  let files: string[];
  try {
    files = readdirSync(join(repoPath, "docs", "agents")).filter((f) => /^issue-tracker.*\.md$/.test(f));
  } catch {
    return "local-markdown";
  }
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(join(repoPath, "docs", "agents", file), "utf8");
    } catch {
      continue;
    }
    if (/^##\s+Wayfinding operations\s*$/m.test(text) && /^#\s+Issue tracker:\s*GitHub\s*$/im.test(text)) {
      return "github";
    }
  }
  return "local-markdown";
}

function publicFile(name: string) {
  return new URL(`./public/${name}`, import.meta.url);
}

export function startServer(host: string, startPort: number, attemptsLeft = 20): Bun.Server<unknown> {
  // Scoped to this call, not module-level — isolates every `startServer()`
  // call's session table from any other built in the same process, which
  // only matters for `bun test` building several independent servers in
  // one run.
  const sessions = new Map<string, Session>();

  function fetch(req: Request): Response | Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("origin");
    if (origin !== null && origin !== url.origin) {
      return new Response("Cross-origin requests are forbidden", { status: 403 });
    }

    if (req.method === "GET" && url.pathname === "/sessions") {
      const list = [...sessions.values()].map((s) => ({ id: s.id, repoPath: s.repoPath, tracker: s.tracker, url: `/s/${s.id}` }));
      return Response.json({ sessions: list });
    }

    if (req.method === "POST" && url.pathname === "/sessions") {
      return handleCreateSession(req, sessions);
    }

    const sessionMatch = /^\/s\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (sessionMatch) {
      const session = sessions.get(sessionMatch[1]);
      const sub = sessionMatch[2] ?? "/";
      if (!session) return new Response("Unknown session", { status: 404 });

      if (sub === "/" || sub === "") {
        return new Response(Bun.file(publicFile("index.html")), { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      if (sub === "/api/session") {
        return Response.json({ id: session.id, repoPath: session.repoPath, tracker: session.tracker });
      }
      if (sub === "/api/maps") {
        return Response.json({ maps: adapterFor(session.tracker).listMapSummaries(session.repoPath) });
      }
      const mapMatch = /^\/api\/maps\/([^/]+)$/.exec(sub);
      if (mapMatch) {
        const map = adapterFor(session.tracker).loadMap(session.repoPath, mapMatch[1]);
        if (!map) return Response.json({ error: "unknown map" }, { status: 404 });
        return Response.json(map);
      }
      return new Response("Not found", { status: 404 });
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(Bun.file(publicFile("index.html")), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/app.js") {
      return new Response(Bun.file(publicFile("app.js")), { headers: { "Content-Type": "application/javascript; charset=utf-8" } });
    }
    if (url.pathname === "/style.css") {
      return new Response(Bun.file(publicFile("style.css")), { headers: { "Content-Type": "text/css; charset=utf-8" } });
    }

    return new Response("Not found", { status: 404 });
  }

  let port = startPort;
  for (let i = 0; i < attemptsLeft; i++) {
    try {
      return Bun.serve({ hostname: host, port, fetch });
    } catch (err) {
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

// A session-creation body's `path` is caller-supplied, free text (a
// filesystem path) — narrows via `in`/`typeof` rather than an inline cast,
// so a malformed body (non-object, missing/non-string `path`) degrades to
// `undefined` (the cwd fallback) instead of trusting an unchecked shape.
function parseRequestedPath(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("path" in value)) return undefined;
  return typeof value.path === "string" ? value.path : undefined;
}

async function handleCreateSession(req: Request, sessions: Map<string, Session>): Promise<Response> {
  let parsed: unknown = {};
  try {
    const text = await req.text();
    if (text) parsed = JSON.parse(text);
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const requestedPath = parseRequestedPath(parsed);
  // Defaults to this process's own cwd when the caller omits `path` — the
  // launching agent is expected to pass its own cwd explicitly (see
  // SKILL.md); this fallback only covers a bare/manual `POST /sessions`.
  const repoPath = resolvePath(requestedPath ?? process.cwd());

  // Idempotent per resolved repo path, not a caller-supplied id — a second
  // `POST /sessions` against the same path reattaches to the existing
  // session instead of creating a duplicate.
  const existing = [...sessions.values()].find((s) => s.repoPath === repoPath);
  if (existing) {
    return Response.json({ id: existing.id, repoPath: existing.repoPath, tracker: existing.tracker, url: `/s/${existing.id}` });
  }

  const id = crypto.randomUUID();
  const session: Session = { id, repoPath, tracker: detectTrackerKind(repoPath) };
  sessions.set(id, session);
  return Response.json({ id, repoPath, tracker: session.tracker, url: `/s/${id}` });
}

function lanAddresses(): string[] {
  const addresses: string[] = [];
  for (const iface of Object.values(networkInterfaces())) {
    for (const info of iface ?? []) {
      if (info.family === "IPv4" && !info.internal) addresses.push(info.address);
    }
  }
  return addresses;
}

// Optional on-disk preferences so a user who always wants the same
// non-default port, or wants the startup link to advertise a hostname
// other than loopback (a Tailscale/VPN name, a reverse-proxy domain —
// anything that actually resolves back to this machine for them), doesn't
// have to set `WAYFINDER_VIEW_*` env vars on every single `bun run
// server.ts`. Env vars still win when set, so a one-off override never
// has to touch the file. Mirrors grill-ui's identical config-file feature.
type FileConfig = { host?: string; port?: number; advertiseHost?: string };

// Narrows an unknown decoded JSON value to the subset of fields this
// server understands, dropping anything the wrong type or empty — a
// malformed or partially-garbage config file degrades to "unset" for the
// affected field(s) instead of crashing startup or poisoning a value with
// e.g. `NaN`. The cast to `Record<string, unknown>` is safe precisely
// because every subsequent read goes through its own `typeof` check below
// before being trusted — nothing is read off `obj` without being verified
// first.
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
  return join(xdgConfigHome, "wayfinder-view", "config.json");
}

// Precedence: env var > config file > built-in default, applied field by
// field — e.g. a config file with only `advertiseHost` set still falls
// through to the default port and `WAYFINDER_VIEW_PORT`, it doesn't force
// the caller to repeat every field just to set one.
export function resolveServerConfig(
  fileConfig: FileConfig,
  env: Record<string, string | undefined>,
): { host: string; port: number; advertiseHost: string } {
  const envPort = Number(env.WAYFINDER_VIEW_PORT);
  return {
    host: env.WAYFINDER_VIEW_HOST || fileConfig.host || "127.0.0.1",
    port: (Number.isInteger(envPort) && envPort > 0 ? envPort : undefined) ?? fileConfig.port ?? 4830,
    advertiseHost: env.WAYFINDER_VIEW_ADVERTISE_HOST || fileConfig.advertiseHost || "127.0.0.1",
  };
}

if (import.meta.main) {
  const configPath = process.env.WAYFINDER_VIEW_CONFIG_PATH || defaultConfigPath();
  const fileConfig = loadFileConfig(configPath);
  const { host: requestedHost, port: requestedPort, advertiseHost } = resolveServerConfig(fileConfig, process.env);

  let server: Bun.Server<unknown>;
  try {
    // A single attempt, not the general retry-the-next-port fallback (still
    // used by `startServer`'s own tests): this process is meant to be *the*
    // shared wayfinder-view server for this machine, discoverable at a
    // known port. Silently relocating to a fallback port on conflict would
    // make a startup race's loser undiscoverable — another launcher's
    // discovery probe only checks the expected port.
    server = startServer(requestedHost, requestedPort, 1);
  } catch (err) {
    console.error(
      `wayfinder-view: could not bind ${requestedHost}:${requestedPort} (${err instanceof Error ? err.message : err})`,
    );
    console.error(
      `Check whether a wayfinder-view server is already running there — GET http://${requestedHost}:${requestedPort}/sessions — and reuse it, or set WAYFINDER_VIEW_PORT (or the config file's "port") to use a different one.`,
    );
    process.exit(1);
  }

  // The `bash` tool's service readiness check matches this line via a log
  // regex ("Listening on"), independent of the host text — `advertiseHost`
  // defaults to loopback (always reachable from this machine regardless of
  // what `WAYFINDER_VIEW_HOST` bound to) but can be overridden via
  // `WAYFINDER_VIEW_ADVERTISE_HOST` or the config file's `advertiseHost`,
  // e.g. to a Tailscale/VPN hostname or reverse-proxy domain the user
  // actually reaches this machine through.
  console.log(`Listening on http://${advertiseHost}:${server.port}`);

  if (requestedHost === "0.0.0.0" || requestedHost === "::") {
    const lan = lanAddresses();
    if (lan.length === 0) {
      console.log("WAYFINDER_VIEW_HOST requested network exposure, but no non-internal IPv4 address was found.");
    }
    for (const address of lan) {
      console.log(`Also reachable on the local network at http://${address}:${server.port}`);
    }
  }
}
