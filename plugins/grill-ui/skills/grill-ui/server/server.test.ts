// Regression coverage for a real bug found during live use: starting a
// second grill-ui server while a port was already bound threw instead of
// retrying on the next port, because the EADDRINUSE check read the wrong
// error field (`.message`, an English sentence, instead of `.code`).
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

describe("round body validation", () => {
  test("a malformed POST /rounds body (null, wrong shape, non-array questions, or empty array) is rejected with 400 instead of crashing or poisoning the pending round", async () => {
    const server = startServer("127.0.0.1", 0);
    try {
      const base = `http://127.0.0.1:${server.port}`;
      const post = (body: unknown) =>
        fetch(`${base}/rounds`, {
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
