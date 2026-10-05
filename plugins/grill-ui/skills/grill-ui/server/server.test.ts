// Regression coverage for real bugs found during live use, plus the core
// multi-session routing behavior: one server process serves many
// concurrent interviews, each isolated under its own `/s/<id>`.
//
// Runs under `bun test` — this is server-side logic (real `Bun.serve`
// binding), not the DOM client, so it doesn't hit the jsdom/Bun vm gap that
// the client tests in public/app.test.mjs route around via Node instead.

import { describe, expect, test } from "bun:test";
import { startServer } from "./server.ts";

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
