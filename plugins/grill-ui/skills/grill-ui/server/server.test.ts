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
