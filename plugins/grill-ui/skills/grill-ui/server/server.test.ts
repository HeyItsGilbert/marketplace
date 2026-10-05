// Regression coverage for real bugs found during live use, plus the core
// multi-session routing behavior: one server process serves many
// concurrent interviews, each isolated under its own `/s/<id>`.
//
// Runs under `bun test` — this is server-side logic (real `Bun.serve`
// binding), not the DOM client, so it doesn't hit the jsdom/Bun vm gap that
// the client tests in public/app.test.mjs route around via Node instead.

import { describe, expect, test } from "bun:test";
import { parseFileConfig, pruneExpiredSessions, resolveServerConfig, startServer } from "./server.ts";

describe("port conflict retry", () => {
  test("starting a server on an already-bound port lands on the next one instead of throwing", () => {
    const first = Bun.serve({ port: 0, fetch: () => new Response("ok") });
    try {
      const second = startServer("127.0.0.1", first.port);
      try {
        expect(second.port).not.toBe(first.port);
      } finally {
        second.stop(true);
      }
    } finally {
      first.stop(true);
    }
  });
});

describe("sessions", () => {
  test("POST /sessions with no body mints a random id; GET /sessions lists it", async () => {
    const server = startServer("127.0.0.1", 0);
    try {
      const base = `http://127.0.0.1:${server.port}`;
      const created = await fetch(`${base}/sessions`, { method: "POST" });
      expect(created.status).toBe(200);
      const { id, label, url } = await created.json();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
      expect(label).toBe("Untitled session");
      expect(url).toBe(`/s/${id}`);

      const listed = await (await fetch(`${base}/sessions`)).json();
      expect(listed.sessions).toEqual([{ id, label: "Untitled session", done: false, pending: false, rounds: 0 }]);
    } finally {
      server.stop(true);
    }
  });

  test("POST /sessions with a caller-supplied id is idempotent — the second call returns the same session instead of erroring or duplicating it", async () => {
    const server = startServer("127.0.0.1", 0);
    try {
      const base = `http://127.0.0.1:${server.port}`;
      const post = (body: unknown) =>
        fetch(`${base}/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

      const first = await (await post({ id: "harness-session-42", label: "API redesign" })).json();
      expect(first).toEqual({ id: "harness-session-42", label: "API redesign", url: "/s/harness-session-42" });

      // Reusing the id ignores the new label — it returns the session as
      // first created, not a second one.
      const second = await (await post({ id: "harness-session-42", label: "a different label" })).json();
      expect(second).toEqual(first);

      const listed = await (await fetch(`${base}/sessions`)).json();
      expect(listed.sessions.length).toBe(1);
    } finally {
      server.stop(true);
    }
  });

  test("a caller-supplied id outside the safe URL-path-segment charset is ignored in favor of a minted one, instead of being embedded unsafely in /s/<id>", async () => {
    const server = startServer("127.0.0.1", 0);
    try {
      const base = `http://127.0.0.1:${server.port}`;
      const created = await fetch(`${base}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "../../etc/passwd" }),
      });
      const { id, url } = await created.json();
      expect(id).not.toBe("../../etc/passwd");
      expect(url).toBe(`/s/${id}`);
    } finally {
      server.stop(true);
    }
  });

  test("two sessions keep fully independent pending rounds — posting to one never leaks into or blocks the other", async () => {
    const server = startServer("127.0.0.1", 0);
    try {
      const base = `http://127.0.0.1:${server.port}`;
      const a = await (await fetch(`${base}/sessions`, { method: "POST" })).json();
      const b = await (await fetch(`${base}/sessions`, { method: "POST" })).json();
      expect(a.id).not.toBe(b.id);

      const postRound = (sessionId: string) =>
        fetch(`${base}/s/${sessionId}/rounds`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questions: [{ id: "q1", header: "H", question: "Q?" }] }),
        });

      expect((await postRound(a.id)).status).toBe(200);
      // Session A already has a pending round, but that never blocks B.
      expect((await postRound(b.id)).status).toBe(200);
      // A second round on A is still rejected while its first is pending —
      // the per-session single-pending-round rule still holds.
      expect((await postRound(a.id)).status).toBe(409);

      const listed = await (await fetch(`${base}/sessions`)).json();
      const byId = Object.fromEntries(listed.sessions.map((s: { id: string }) => [s.id, s]));
      expect(byId[a.id].pending).toBe(true);
      expect(byId[b.id].pending).toBe(true);
    } finally {
      server.stop(true);
    }
  });

  test("rounds/wait/done against an unknown session id 404 instead of crashing", async () => {
    const server = startServer("127.0.0.1", 0);
    try {
      const base = `http://127.0.0.1:${server.port}`;
      const post = (path: string, body?: unknown) =>
        fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

      expect((await post("/s/nope/rounds", { questions: [{ id: "q1", header: "H", question: "Q?" }] })).status).toBe(404);
      expect((await fetch(`${base}/s/nope/rounds/also-nope/wait`)).status).toBe(404);
      expect((await post("/s/nope/done")).status).toBe(404);
    } finally {
      server.stop(true);
    }
  });
});

describe("round body validation", () => {
  test("a malformed POST /s/:id/rounds body (null, wrong shape, non-array questions, or empty array) is rejected with 400 instead of crashing or poisoning the pending round", async () => {
    const server = startServer("127.0.0.1", 0);
    try {
      const base = `http://127.0.0.1:${server.port}`;
      const { id } = await (await fetch(`${base}/sessions`, { method: "POST" })).json();
      const post = (body: unknown) =>
        fetch(`${base}/s/${id}/rounds`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

      for (const body of [null, "just a string", { questions: "not an array" }, { questions: [] }]) {
        const res = await post(body);
        expect(res.status).toBe(400);
      }

      // A valid body still works afterward — rejecting the bad ones left no
      // partial state (e.g. a stuck `pendingRound`) behind.
      const ok = await post({ questions: [{ id: "q1", header: "H", question: "Q?" }] });
      expect(ok.status).toBe(200);
    } finally {
      server.stop(true);
    }
  });
});

describe("config file parsing", () => {
  test("a well-formed config is read field by field", () => {
    expect(parseFileConfig('{"host":"0.0.0.0","port":5173,"advertiseHost":"my-box.ts.net"}')).toEqual({
      host: "0.0.0.0",
      port: 5173,
      advertiseHost: "my-box.ts.net",
    });
  });

  test("invalid JSON, a non-object, or an empty file degrades to no preferences instead of crashing startup", () => {
    for (const raw of ["not json", "null", "42", '"just a string"', ""]) {
      expect(parseFileConfig(raw)).toEqual({});
    }
  });

  test("a field of the wrong type, an empty string, or a non-positive port is dropped instead of poisoning the resolved config", () => {
    expect(parseFileConfig('{"port":"5173"}')).toEqual({});
    expect(parseFileConfig('{"port":0}')).toEqual({});
    expect(parseFileConfig('{"port":-1}')).toEqual({});
    expect(parseFileConfig('{"port":3.5}')).toEqual({});
    expect(parseFileConfig('{"host":""}')).toEqual({});
    expect(parseFileConfig('{"host":"   "}')).toEqual({});
  });

  test("only some fields set still leaves the others absent, not defaulted to garbage", () => {
    expect(parseFileConfig('{"advertiseHost":"my-box.ts.net"}')).toEqual({ advertiseHost: "my-box.ts.net" });
  });
});

describe("config precedence: env var > config file > built-in default", () => {
  test("with neither an env var nor a config file, every field falls back to its built-in default", () => {
    expect(resolveServerConfig({}, {})).toEqual({ host: "127.0.0.1", port: 4829, advertiseHost: "127.0.0.1" });
  });

  test("a config file's values are used when no env var overrides them", () => {
    expect(resolveServerConfig({ host: "0.0.0.0", port: 5173, advertiseHost: "my-box.ts.net" }, {})).toEqual({
      host: "0.0.0.0",
      port: 5173,
      advertiseHost: "my-box.ts.net",
    });
  });

  test("an env var wins over the same field in the config file", () => {
    const fileConfig = { host: "0.0.0.0", port: 5173, advertiseHost: "my-box.ts.net" };
    const env = { GRILL_UI_HOST: "127.0.0.1", GRILL_UI_PORT: "9000", GRILL_UI_ADVERTISE_HOST: "localhost" };
    expect(resolveServerConfig(fileConfig, env)).toEqual({ host: "127.0.0.1", port: 9000, advertiseHost: "localhost" });
  });

  test("fields are resolved independently — a config file setting only advertiseHost still gets the default port/host, not a forced override of everything", () => {
    expect(resolveServerConfig({ advertiseHost: "my-box.ts.net" }, {})).toEqual({
      host: "127.0.0.1",
      port: 4829,
      advertiseHost: "my-box.ts.net",
    });
  });

  test("a non-numeric or junk GRILL_UI_PORT env var is ignored in favor of the config file/default instead of resolving to NaN", () => {
    expect(resolveServerConfig({ port: 5173 }, { GRILL_UI_PORT: "not-a-number" })).toEqual({
      host: "127.0.0.1",
      port: 5173,
      advertiseHost: "127.0.0.1",
    });
  });
});
describe("pruneExpiredSessions", () => {
  test("only a done session past its TTL is removed; a recently-done or still-active session is untouched, and the expired session's sockets are closed", () => {
    const now = 1_000_000;
    let closedCount = 0;
    const mockSocket = { close: () => { closedCount++; } } as unknown as WebSocket;

    const sessions = new Map([
      [
        "expired-done",
        {
          id: "expired-done",
          label: "a",
          pendingRound: null,
          pendingWaiters: [],
          history: [],
          sessionDone: true,
          doneAt: now - 1000,
          sockets: new Set([mockSocket]),
        },
      ],
      [
        "recent-done",
        {
          id: "recent-done",
          label: "b",
          pendingRound: null,
          pendingWaiters: [],
          history: [],
          sessionDone: true,
          doneAt: now - 10,
          sockets: new Set(),
        },
      ],
      [
        "still-active",
        {
          id: "still-active",
          label: "c",
          pendingRound: null,
          pendingWaiters: [],
          history: [],
          sessionDone: false,
          doneAt: null,
          sockets: new Set(),
        },
      ],
    ]);

    pruneExpiredSessions(sessions, now, 500);

    expect(sessions.has("expired-done")).toBe(false);
    expect(sessions.has("recent-done")).toBe(true);
    expect(sessions.has("still-active")).toBe(true);
    expect(closedCount).toBe(1);
  });
});

describe("session expiry end to end", () => {
  // TTL=0 makes "past the TTL" true the instant a session is marked done,
  // without needing a real wall-clock wait between the `done` POST and the
  // follow-up `GET /sessions` — two separate round trips over a real
  // socket already take nonzero time, which is all a TTL of 0 requires.
  test("a session finished more than GRILL_UI_SESSION_TTL_MS ago disappears from GET /sessions and later lookups 404 — a long-lived server's session table doesn't grow forever", async () => {
    const previousTtl = process.env.GRILL_UI_SESSION_TTL_MS;
    process.env.GRILL_UI_SESSION_TTL_MS = "0";
    try {
      const server = startServer("127.0.0.1", 0);
      try {
        const base = `http://127.0.0.1:${server.port}`;
        const { id } = await (await fetch(`${base}/sessions`, { method: "POST" })).json();
        await fetch(`${base}/s/${id}/done`, { method: "POST" });

        // Any request triggers the sweep (it runs at the top of every
        // request), not just a dedicated cleanup endpoint.
        const afterDone = await (await fetch(`${base}/sessions`)).json();
        expect(afterDone.sessions.some((s: { id: string }) => s.id === id)).toBe(false);

        const roundAfterExpiry = await fetch(`${base}/s/${id}/rounds`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questions: [{ id: "q1", header: "H", question: "Q?" }] }),
        });
        expect(roundAfterExpiry.status).toBe(404);
      } finally {
        server.stop(true);
      }
    } finally {
      if (previousTtl === undefined) delete process.env.GRILL_UI_SESSION_TTL_MS;
      else process.env.GRILL_UI_SESSION_TTL_MS = previousTtl;
    }
  });

  test("a session that's still open (never marked done) is never pruned, even under a TTL of 0", async () => {
    const previousTtl = process.env.GRILL_UI_SESSION_TTL_MS;
    process.env.GRILL_UI_SESSION_TTL_MS = "0";
    try {
      const server = startServer("127.0.0.1", 0);
      try {
        const base = `http://127.0.0.1:${server.port}`;
        const { id } = await (await fetch(`${base}/sessions`, { method: "POST" })).json();

        const listed = await (await fetch(`${base}/sessions`)).json();
        expect(listed.sessions.some((s: { id: string }) => s.id === id)).toBe(true);
      } finally {
        server.stop(true);
      }
    } finally {
      if (previousTtl === undefined) delete process.env.GRILL_UI_SESSION_TTL_MS;
      else process.env.GRILL_UI_SESSION_TTL_MS = previousTtl;
    }
  });
});

describe("fail-fast on port conflict (the real CLI entrypoint, not startServer directly)", () => {
  test("a second `bun run server.ts` against an already-bound port exits non-zero with guidance instead of silently relocating to a fallback port", async () => {
    // Grab a free port by briefly binding port 0, then reuse that number —
    // startServer()'s own retry logic is intentionally not used here: this
    // test is about the CLI entrypoint's choice not to use that retry, so
    // it has to go through the real `bun run` process, not the exported
    // function.
    const probe = Bun.serve({ port: 0, fetch: () => new Response("ok") });
    const port = probe.port;
    probe.stop(true);

    const serverScript = `${import.meta.dir}/server.ts`;
    const env = { ...process.env, GRILL_UI_PORT: String(port), GRILL_UI_HOST: "127.0.0.1" };

    const first = Bun.spawn(["bun", "run", serverScript], { env, stdout: "pipe", stderr: "pipe" });
    try {
      // Wait for the first process to actually report it's listening
      // before racing the second against it.
      const reader = first.stdout.getReader();
      const decoder = new TextDecoder();
      let output = "";
      while (!output.includes("Listening on")) {
        const { value, done } = await reader.read();
        if (done) throw new Error("first server exited before printing a startup line");
        output += decoder.decode(value);
      }
      reader.releaseLock();

      const second = Bun.spawn(["bun", "run", serverScript], { env, stdout: "pipe", stderr: "pipe" });
      const exitCode = await second.exited;
      const stderrText = await new Response(second.stderr).text();

      expect(exitCode).toBe(1);
      expect(stderrText).toContain("could not bind");
      expect(stderrText).toContain("/sessions");
    } finally {
      first.kill();
      await first.exited;
    }
  }, 15000);
});
