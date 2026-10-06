// HTTP/session seam coverage, following grill-ui's `server.test.ts`
// precedent: `bun test` against a real `Bun.serve` binding, not a mock.
// Every data-serving test uses the local-markdown adapter against a real
// temp-directory fixture — no network, no `gh` CLI, fully hermetic. The
// GitHub-adapter-specific shape mapping is covered separately as a pure
// unit (see `adapters/github.ts`'s `mapGithubTicket`); only tracker
// *detection* (reading `docs/agents/issue-tracker*.md`, never calling
// `gh`) is exercised here for the GitHub path.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { detectTrackerKind, parseFileConfig, resolveServerConfig, startServer } from "./server.ts";

const tempDirs: string[] = [];
function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "wayfinder-view-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

// Builds a minimal local-markdown wayfinder effort: one map with one
// frontier ticket, under `.scratch/<slug>/`.
function seedLocalMarkdownEffort(repoPath: string, slug: string) {
  const effortDir = join(repoPath, ".scratch", slug);
  mkdirSync(join(effortDir, "issues"), { recursive: true });
  writeFileSync(
    join(effortDir, "map.md"),
    ["# Example map", "", "## Destination", "", "Ship the thing.", "", "## Decisions so far", ""].join("\n"),
  );
  writeFileSync(
    join(effortDir, "issues", "01-first-question.md"),
    ["# First question", "", "Type: task", "", "## Question", "", "What should we do first?"].join("\n"),
  );
}

describe("port conflict retry", () => {
  test("starting a server on an already-bound port lands on the next one instead of throwing", () => {
    const first = Bun.serve({ port: 0, fetch: () => new Response("ok") });
    try {
      const second = startServer("127.0.0.1", first.port ?? 0);
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

describe("detectTrackerKind", () => {
  test("a docs/agents/issue-tracker.md naming the GitHub Wayfinding operations section resolves to github", () => {
    const repo = makeRepo();
    mkdirSync(join(repo, "docs", "agents"), { recursive: true });
    writeFileSync(
      join(repo, "docs", "agents", "issue-tracker.md"),
      ["# Issue tracker: GitHub", "", "## Wayfinding operations", "", "Used by `/wayfinder`."].join("\n"),
    );
    expect(detectTrackerKind(repo)).toBe("github");
  });

  test("a repo with no tracker doc at all defaults to local-markdown", () => {
    expect(detectTrackerKind(makeRepo())).toBe("local-markdown");
  });

  test("a tracker doc present but not naming GitHub (e.g. a local-markdown or gitlab doc) also defaults to local-markdown — no second, divergent convention", () => {
    const repo = makeRepo();
    mkdirSync(join(repo, "docs", "agents"), { recursive: true });
    writeFileSync(
      join(repo, "docs", "agents", "issue-tracker.md"),
      ["# Issue tracker: Local Markdown", "", "## Wayfinding operations", "", "Used by `/wayfinder`."].join("\n"),
    );
    expect(detectTrackerKind(repo)).toBe("local-markdown");
  });
});

describe("sessions", () => {
  test("POST /sessions with a path resolves the local-markdown adapter and mints a session reachable at /s/<id>", async () => {
    const server = startServer("127.0.0.1", 0);
    try {
      const repo = makeRepo();
      const base = `http://127.0.0.1:${server.port}`;
      const created = await (
        await fetch(`${base}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: repo }),
        })
      ).json();
      expect(created.tracker).toBe("local-markdown");
      expect(created.url).toBe(`/s/${created.id}`);

      const listed = await (await fetch(`${base}/sessions`)).json();
      expect(listed.sessions.map((s: { id: string }) => s.id)).toContain(created.id);
    } finally {
      server.stop(true);
    }
  });

  test("POST /sessions against the same path twice is idempotent — the second call returns the existing session instead of duplicating it", async () => {
    const server = startServer("127.0.0.1", 0);
    try {
      const repo = makeRepo();
      const base = `http://127.0.0.1:${server.port}`;
      const post = () =>
        fetch(`${base}/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: repo }) });

      const first = await (await post()).json();
      const second = await (await post()).json();
      expect(second).toEqual(first);

      const listed = await (await fetch(`${base}/sessions`)).json();
      expect(listed.sessions.length).toBe(1);
    } finally {
      server.stop(true);
    }
  });

  test("GET /s/:id and its nested /api endpoints against an unknown session id 404 instead of crashing", async () => {
    const server = startServer("127.0.0.1", 0);
    try {
      const base = `http://127.0.0.1:${server.port}`;
      expect((await fetch(`${base}/s/nope`)).status).toBe(404);
      expect((await fetch(`${base}/s/nope/api/session`)).status).toBe(404);
      expect((await fetch(`${base}/s/nope/api/maps`)).status).toBe(404);
      expect((await fetch(`${base}/s/nope/api/maps/1`)).status).toBe(404);
    } finally {
      server.stop(true);
    }
  });
});

describe("map data endpoints", () => {
  test("GET /s/:id/api/maps lists every wayfinder map for that session's repo as a MapSummary", async () => {
    const server = startServer("127.0.0.1", 0);
    try {
      const repo = makeRepo();
      seedLocalMarkdownEffort(repo, "ship-the-thing");
      const base = `http://127.0.0.1:${server.port}`;
      const { id } = await (
        await fetch(`${base}/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: repo }) })
      ).json();

      const { maps } = await (await fetch(`${base}/s/${id}/api/maps`)).json();
      expect(maps).toEqual([
        {
          id: "ship-the-thing",
          title: "Example map",
          url: ".scratch/ship-the-thing/map.md",
          state: "open",
          destination: "Ship the thing.",
          closedCount: 0,
          totalCount: 1,
        },
      ]);
    } finally {
      server.stop(true);
    }
  });

  test("GET /s/:id/api/maps/:mapId serves that map's full MapViewModel, and an unknown mapId 404s", async () => {
    const server = startServer("127.0.0.1", 0);
    try {
      const repo = makeRepo();
      seedLocalMarkdownEffort(repo, "ship-the-thing");
      const base = `http://127.0.0.1:${server.port}`;
      const { id } = await (
        await fetch(`${base}/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: repo }) })
      ).json();

      const mapRes = await fetch(`${base}/s/${id}/api/maps/ship-the-thing`);
      expect(mapRes.status).toBe(200);
      const map = await mapRes.json();
      expect(map.id).toBe("ship-the-thing");
      expect(map.tickets).toEqual([
        {
          id: "01",
          title: "First question",
          url: ".scratch/ship-the-thing/issues/01-first-question.md",
          type: "task",
          state: "open",
          openBlockedBy: [],
          allBlockedBy: [],
          claimedBy: null,
          parentId: "ship-the-thing",
          size: null,
          priority: null,
          status: "frontier",
          tier: "primary",
          hostId: "01",
          crossLinkIds: [],
          gist: null,
        },
      ]);

      expect((await fetch(`${base}/s/${id}/api/maps/does-not-exist`)).status).toBe(404);
    } finally {
      server.stop(true);
    }
  });

  test("two sessions for different repos stay fully independent", async () => {
    const server = startServer("127.0.0.1", 0);
    try {
      const repoA = makeRepo();
      const repoB = makeRepo();
      seedLocalMarkdownEffort(repoA, "map-a");
      seedLocalMarkdownEffort(repoB, "map-b");
      const base = `http://127.0.0.1:${server.port}`;
      const post = (path: string) =>
        fetch(`${base}/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) }).then((r) =>
          r.json(),
        );

      const a = await post(repoA);
      const b = await post(repoB);
      expect(a.id).not.toBe(b.id);

      const mapsA = await (await fetch(`${base}/s/${a.id}/api/maps`)).json();
      const mapsB = await (await fetch(`${base}/s/${b.id}/api/maps`)).json();
      expect(mapsA.maps.map((m: { id: string }) => m.id)).toEqual(["map-a"]);
      expect(mapsB.maps.map((m: { id: string }) => m.id)).toEqual(["map-b"]);

      // Repo A's session can't see repo B's map and vice versa.
      expect((await fetch(`${base}/s/${a.id}/api/maps/map-b`)).status).toBe(404);
      expect((await fetch(`${base}/s/${b.id}/api/maps/map-a`)).status).toBe(404);
    } finally {
      server.stop(true);
    }
  });
});

describe("static assets", () => {
  test("app.js and style.css are served with the right content type", async () => {
    const server = startServer("127.0.0.1", 0);
    try {
      const base = `http://127.0.0.1:${server.port}`;
      const js = await fetch(`${base}/app.js`);
      expect(js.status).toBe(200);
      expect(js.headers.get("content-type")).toContain("javascript");

      const css = await fetch(`${base}/style.css`);
      expect(css.status).toBe(200);
      expect(css.headers.get("content-type")).toContain("text/css");
    } finally {
      server.stop(true);
    }
  });
});

describe("config file parsing", () => {
  test("a well-formed config is read field by field", () => {
    expect(parseFileConfig('{"host":"0.0.0.0","port":5174,"advertiseHost":"my-box.ts.net"}')).toEqual({
      host: "0.0.0.0",
      port: 5174,
      advertiseHost: "my-box.ts.net",
    });
  });

  test("invalid JSON, a non-object, or an empty file degrades to no preferences instead of crashing startup", () => {
    for (const raw of ["not json", "null", "42", '"just a string"', ""]) {
      expect(parseFileConfig(raw)).toEqual({});
    }
  });

  test("a field of the wrong type, an empty string, or a non-positive port is dropped instead of poisoning the resolved config", () => {
    expect(parseFileConfig('{"port":"5174"}')).toEqual({});
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
    expect(resolveServerConfig({}, {})).toEqual({ host: "127.0.0.1", port: 4830, advertiseHost: "127.0.0.1" });
  });

  test("a config file's values are used when no env var overrides them", () => {
    expect(resolveServerConfig({ host: "0.0.0.0", port: 5174, advertiseHost: "my-box.ts.net" }, {})).toEqual({
      host: "0.0.0.0",
      port: 5174,
      advertiseHost: "my-box.ts.net",
    });
  });

  test("an env var wins over the same field in the config file", () => {
    const fileConfig = { host: "0.0.0.0", port: 5174, advertiseHost: "my-box.ts.net" };
    const env = { WAYFINDER_VIEW_HOST: "127.0.0.1", WAYFINDER_VIEW_PORT: "9000", WAYFINDER_VIEW_ADVERTISE_HOST: "localhost" };
    expect(resolveServerConfig(fileConfig, env)).toEqual({ host: "127.0.0.1", port: 9000, advertiseHost: "localhost" });
  });

  test("fields are resolved independently — a config file setting only advertiseHost still gets the default port/host, not a forced override of everything", () => {
    expect(resolveServerConfig({ advertiseHost: "my-box.ts.net" }, {})).toEqual({
      host: "127.0.0.1",
      port: 4830,
      advertiseHost: "my-box.ts.net",
    });
  });

  test("a non-numeric or junk WAYFINDER_VIEW_PORT env var is ignored in favor of the config file/default instead of resolving to NaN", () => {
    expect(resolveServerConfig({ port: 5174 }, { WAYFINDER_VIEW_PORT: "not-a-number" })).toEqual({
      host: "127.0.0.1",
      port: 5174,
      advertiseHost: "127.0.0.1",
    });
  });
});
