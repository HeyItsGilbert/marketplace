// grill-ui local server: a dumb relay between the orchestrating agent and a
// single browser tab. It never calls a model and never spawns a subagent —
// it only holds a pending round, pushes it to the browser live, and blocks
// the agent's long-poll until the browser submits answers for that round.

import { networkInterfaces } from "node:os";

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

let pendingRound: Round | null = null;
let pendingWaiters: Array<(answers: Answers) => void> = [];
const history: Array<{ round: Round; answers: Answers }> = [];
let sessionDone = false;
// Changes every time this process starts. A reconnecting browser tab
// compares it against the value it saw on its first connection — a
// mismatch means the server restarted (picked up code changes, or
// recovered from a crash) while the tab stayed open, so the tab is told
// to reload and pick up the current app.js/style.css instead of silently
// continuing to run a stale version against the new server.
const bootId = crypto.randomUUID();

const sockets = new Set<WebSocket>();

function broadcast(msg: unknown) {
  const data = JSON.stringify(msg);
  for (const ws of sockets) {
    try {
      ws.send(data);
    } catch {
      // dead socket; `close` will clean it up
    }
  }
}

function publicFile(name: string) {
  return new URL(`./public/${name}`, import.meta.url);
}

async function fetch(req: Request, srv: { upgrade: (req: Request) => boolean }) {
  const url = new URL(req.url);
  const origin = req.headers.get("origin");
  if (origin !== null && origin !== url.origin) {
    return new Response("Cross-origin requests are forbidden", { status: 403 });
  }

  if (url.pathname === "/ws") {
    if (srv.upgrade(req)) return undefined as unknown as Response;
    return new Response("WebSocket upgrade failed", { status: 400 });
  }

  if (req.method === "POST" && url.pathname === "/rounds") {
    if (sessionDone) {
      return Response.json({ error: "session already marked done" }, { status: 409 });
    }
    if (pendingRound) {
      return Response.json({ error: "A round is already pending" }, { status: 409 });
    }
    let body: { questions?: Question[] };
    try {
      body = (await req.json()) as { questions?: Question[] };
    } catch {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }
    if (!body.questions || body.questions.length === 0) {
      return Response.json({ error: "questions required" }, { status: 400 });
    }
    const round: Round = { id: crypto.randomUUID(), questions: body.questions };
    pendingRound = round;
    broadcast({ type: "round", roundId: round.id, questions: round.questions });
    return Response.json({ roundId: round.id });
  }

  const waitMatch = url.pathname.match(/^\/rounds\/([^/]+)\/wait$/);
  if (req.method === "GET" && waitMatch) {
    const id = waitMatch[1];
    const past = history.find((h) => h.round.id === id);
    if (past) return Response.json({ answers: past.answers });
    if (!pendingRound || pendingRound.id !== id) {
      return Response.json({ error: "unknown round" }, { status: 404 });
    }
    return new Promise<Response>((resolve) => {
      pendingWaiters.push((answers) => resolve(Response.json({ answers })));
    });
  }

  if (req.method === "POST" && url.pathname === "/done") {
    sessionDone = true;
    broadcast({ type: "done" });
    return Response.json({ ok: true });
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
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
  open(ws: WebSocket) {
    sockets.add(ws);
    ws.send(JSON.stringify({ type: "boot", bootId }));
    for (const h of history) {
      ws.send(
        JSON.stringify({
          type: "history",
          roundId: h.round.id,
          questions: h.round.questions,
          answers: h.answers,
        }),
      );
    }
    if (sessionDone) {
      ws.send(JSON.stringify({ type: "done" }));
    } else if (pendingRound) {
      ws.send(
        JSON.stringify({ type: "round", roundId: pendingRound.id, questions: pendingRound.questions }),
      );
    }
  },
  close(ws: WebSocket) {
    sockets.delete(ws);
  },
  message(_ws: WebSocket, raw: string | Buffer) {
    let msg: { type?: string; roundId?: string; answers?: Answers };
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.type === "submit" && pendingRound && msg.roundId === pendingRound.id) {
      const answers: Answers = msg.answers ?? {};
      const finished = pendingRound;
      pendingRound = null;
      history.push({ round: finished, answers });
      const waiters = pendingWaiters;
      pendingWaiters = [];
      for (const resolve of waiters) resolve(answers);
    }
  },
};

export function startServer(host: string, startPort: number, attemptsLeft = 20) {
  let port = startPort;
  for (let i = 0; i < attemptsLeft; i++) {
    try {
      // idleTimeout: 0 disables Bun's default 10s idle-connection close —
      // the /rounds/:id/wait long-poll intentionally holds a connection
      // open with no data until the round is answered.
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

if (import.meta.main) {
  const requestedHost = process.env.GRILL_UI_HOST || "127.0.0.1";
  const requestedPort = Number(process.env.GRILL_UI_PORT) || 4829;
  const server = startServer(requestedHost, requestedPort);

  // The `bash` tool's service readiness check matches this line via a log
  // regex. Always printed against the loopback address: a 0.0.0.0 bind
  // still accepts loopback connections, so this stays valid regardless of
  // GRILL_UI_HOST.
  console.log(`Listening on http://127.0.0.1:${server.port}`);

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
