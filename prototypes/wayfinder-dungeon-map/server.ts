// PROTOTYPE — throwaway. See README.md in this directory.
//
// Ticket #60: can a watabou-style procedural dungeon layout render
// wayfinder-view's theme-neutral view-model (tier/hostId/crossLinkIds,
// ticket type, 4-way status) in the same shape as the existing
// prototypes/wayfinder-star-map/ prototype — Bun serves JSON + static
// files only, a plain <canvas> + vanilla JS does layout and drawing in
// the browser, no build step?
//
// Data is this repo's own real wayfinder maps (every issue labelled
// wayfinder:map, open and closed) and their real child tickets, fetched
// live off the GitHub adapter via the `gh` CLI on every request — no
// fake fixtures, matching the existing prototype's own rule. The server
// computes the canonical view-model fields decided on issues #55 (schema)
// and #53 (diamond-dependency tier/host/crossLink resolution); the
// client only draws what it's told.

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(new URL(import.meta.url).pathname), "..", "..");
const publicDir = join(dirname(new URL(import.meta.url).pathname), "public");

function gh(args: string[]): string {
  return execFileSync("gh", args, { cwd: repoRoot, encoding: "utf8" });
}

function ghJson<T>(args: string[]): T {
  return JSON.parse(gh(args)) as T;
}

type TicketType = "research" | "prototype" | "grilling" | "task";
type TicketState = "open" | "closed";
type TicketStatus = "closed" | "blocked" | "frontier" | "claimed";
type DependencyTier = "primary" | "dependent";

type Ticket = {
  id: string;
  number: number;
  title: string;
  url: string;
  type: TicketType;
  state: TicketState;
  status: TicketStatus;
  openBlockedBy: string[];
  allBlockedBy: string[];
  claimedBy: string | null;
  parentId: string;
  size: string | null;
  priority: string | null;
  gist: string | null;
  tier: DependencyTier;
  hostId: string;
  crossLinkIds: string[];
};

type MapViewModel = {
  id: string;
  number: number;
  title: string;
  url: string;
  state: TicketState;
  destination: string;
  tickets: Ticket[];
};

type MapSummary = {
  id: string;
  number: number;
  title: string;
  url: string;
  state: TicketState;
  destination: string;
  closedCount: number;
  totalCount: number;
};

let repoOwner = "";
let repoName = "";

function loadRepoIdentity(): void {
  const info = ghJson<{ name: string; owner: { login: string } }>([
    "repo",
    "view",
    "--json",
    "name,owner",
  ]);
  repoOwner = info.owner.login;
  repoName = info.name;
}

// `## Destination` is the first heading-delimited section in the map body.
function parseSection(body: string, heading: string): string {
  const re = new RegExp(`^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s|\\Z)`, "m");
  const match = body.match(re);
  if (!match) return "";
  return match[1].trim();
}

// Decisions-so-far bullets look like:
//   - [<closed ticket title>](link) — <gist>
// `link` ends in `/issues/<n>` for a GitHub-backed map. We match on that
// trailing number rather than title text, since titles are free text.
function parseGists(body: string): Map<number, string> {
  const section = parseSection(body, "Decisions so far");
  const gists = new Map<number, string>();
  const lineRe = /^- \[[^\]]+\]\([^)]*\/issues\/(\d+)\)\s*—\s*(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(section))) {
    gists.set(Number(m[1]), m[2].trim());
  }
  return gists;
}

function ticketTypeFromLabels(labels: string[]): TicketType | null {
  for (const l of labels) {
    const m = l.match(/^wayfinder:(research|prototype|grilling|task)$/);
    if (m) return m[1] as TicketType;
  }
  return null;
}

type RawSubIssue = {
  number: number;
  title: string;
  state: "OPEN" | "CLOSED";
  labels: { nodes: { name: string }[] };
  assignees: { nodes: { login: string }[] };
};

function loadSubIssues(mapNumber: number): RawSubIssue[] {
  const query = `
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        issue(number: $number) {
          subIssues(first: 100) {
            nodes {
              number
              title
              state
              labels(first: 10) { nodes { name } }
              assignees(first: 5) { nodes { login } }
            }
          }
        }
      }
    }`;
  const out = ghJson<{
    data: { repository: { issue: { subIssues: { nodes: RawSubIssue[] } } } };
  }>([
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-F",
    `owner=${repoOwner}`,
    "-F",
    `name=${repoName}`,
    "-F",
    `number=${mapNumber}`,
  ]);
  return out.data.repository.issue.subIssues.nodes;
}

function loadBlockedBy(number: number): number[] {
  try {
    const deps = ghJson<{ number: number }[]>([
      "api",
      `repos/${repoOwner}/${repoName}/issues/${number}/dependencies/blocked_by`,
    ]);
    return deps.map((d) => d.number);
  } catch {
    return [];
  }
}

// Capped-two-tier resolution (issue #53): a ticket is "primary" if it has
// no blockers at all. A ticket with blockers is "dependent", hosted by the
// lowest-numbered *primary* ticket it is (possibly transitively, through
// other dependents) blocked behind — the capped-depth tree collapses any
// chain deeper than one dependent hop down onto that single moon tier.
// Any other primary-tier ancestor reached the same way becomes a
// cross-link rather than a second host.
function resolveTiers(
  tickets: { number: number; allBlockedBy: number[] }[]
): Map<number, { tier: DependencyTier; hostId: number; crossLinkIds: number[] }> {
  const byNumber = new Map(tickets.map((t) => [t.number, t]));
  const isPrimary = (n: number) => (byNumber.get(n)?.allBlockedBy.length ?? 0) === 0;

  const result = new Map<
    number,
    { tier: DependencyTier; hostId: number; crossLinkIds: number[] }
  >();

  for (const t of tickets) {
    if (isPrimary(t.number)) {
      result.set(t.number, { tier: "primary", hostId: t.number, crossLinkIds: [] });
      continue;
    }

    // BFS the blocked-by graph collecting every transitively-reachable
    // primary-tier ancestor.
    const seen = new Set<number>();
    const primaryAncestors = new Set<number>();
    const queue = [...t.allBlockedBy];
    while (queue.length) {
      const n = queue.shift()!;
      if (seen.has(n)) continue;
      seen.add(n);
      if (isPrimary(n)) {
        primaryAncestors.add(n);
      } else {
        const parent = byNumber.get(n);
        if (parent) queue.push(...parent.allBlockedBy);
      }
    }

    const ordered = [...primaryAncestors].sort((a, b) => a - b);
    const hostId = ordered[0] ?? t.number; // orphaned edge case: no primary ancestor found
    result.set(t.number, {
      tier: "dependent",
      hostId,
      crossLinkIds: ordered.slice(1),
    });
  }

  return result;
}

function computeStatus(
  state: TicketState,
  openBlockedBy: string[],
  claimedBy: string | null
): TicketStatus {
  if (state === "closed") return "closed";
  if (openBlockedBy.length > 0) return "blocked";
  if (claimedBy) return "claimed";
  return "frontier";
}

function loadMapViewModel(mapNumber: number, mapTitle: string, mapUrl: string, mapState: TicketState, mapBody: string): MapViewModel {
  const subIssues = loadSubIssues(mapNumber);
  const gists = parseGists(mapBody);

  const stateByNumber = new Map(subIssues.map((s) => [s.number, s.state === "OPEN" ? "open" : "closed"] as const));

  const raw = subIssues.map((s) => ({
    number: s.number,
    title: s.title,
    allBlockedBy: loadBlockedBy(s.number),
  }));

  const tiers = resolveTiers(raw);

  const tickets: Ticket[] = subIssues.map((s) => {
    const r = raw.find((x) => x.number === s.number)!;
    const state: TicketState = s.state === "OPEN" ? "open" : "closed";
    const openBlockedBy = r.allBlockedBy.filter((n) => stateByNumber.get(n) === "open");
    const claimedBy = s.assignees.nodes[0]?.login ?? null;
    const tierInfo = tiers.get(s.number)!;
    const type = ticketTypeFromLabels(s.labels.nodes.map((l) => l.name)) ?? "task";

    return {
      id: `#${s.number}`,
      number: s.number,
      title: s.title,
      url: `https://github.com/${repoOwner}/${repoName}/issues/${s.number}`,
      type,
      state,
      status: computeStatus(state, openBlockedBy.map(String), claimedBy),
      openBlockedBy: openBlockedBy.map((n) => `#${n}`),
      allBlockedBy: r.allBlockedBy.map((n) => `#${n}`),
      claimedBy,
      parentId: `#${mapNumber}`,
      size: null,
      priority: null,
      gist: state === "closed" ? gists.get(s.number) ?? null : null,
      tier: tierInfo.tier,
      hostId: `#${tierInfo.hostId}`,
      crossLinkIds: tierInfo.crossLinkIds.map((n) => `#${n}`),
    };
  });

  return {
    id: `#${mapNumber}`,
    number: mapNumber,
    title: mapTitle,
    url: mapUrl,
    state: mapState,
    destination: parseSection(mapBody, "Destination"),
    tickets,
  };
}

function loadMapSummaries(): { summaries: MapSummary[]; bodiesByNumber: Map<number, { title: string; url: string; state: TicketState; body: string }> } {
  const issues = ghJson<
    { number: number; title: string; url: string; state: "OPEN" | "CLOSED"; body: string }[]
  >([
    "issue",
    "list",
    "--state",
    "all",
    "--search",
    "label:wayfinder:map",
    "--json",
    "number,title,url,state,body",
  ]);

  const bodiesByNumber = new Map(
    issues.map((i) => [
      i.number,
      { title: i.title, url: i.url, state: (i.state === "OPEN" ? "open" : "closed") as TicketState, body: i.body },
    ])
  );

  const summaries: MapSummary[] = issues
    .sort((a, b) => a.number - b.number)
    .map((i) => {
      const sub = loadSubIssues(i.number);
      const closedCount = sub.filter((s) => s.state === "CLOSED").length;
      return {
        id: `#${i.number}`,
        number: i.number,
        title: i.title,
        url: i.url,
        state: i.state === "OPEN" ? "open" : "closed",
        destination: parseSection(i.body, "Destination"),
        closedCount,
        totalCount: sub.length,
      };
    });

  return { summaries, bodiesByNumber };
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function startServer(port: number, attemptsLeft = 10): void {
  try {
    const server = Bun.serve({
      port,
      async fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === "/api/maps") {
          const { summaries } = loadMapSummaries();
          return Response.json(summaries);
        }

        const mapMatch = url.pathname.match(/^\/api\/maps\/(\d+)$/);
        if (mapMatch) {
          const number = Number(mapMatch[1]);
          const { bodiesByNumber } = loadMapSummaries();
          const info = bodiesByNumber.get(number);
          if (!info) return new Response("not found", { status: 404 });
          const vm = loadMapViewModel(number, info.title, info.url, info.state, info.body);
          return Response.json(vm);
        }

        const path = url.pathname === "/" ? "/index.html" : url.pathname;
        const ext = path.slice(path.lastIndexOf("."));
        const file = Bun.file(join(publicDir, path));
        if (!(await file.exists())) return new Response("not found", { status: 404 });
        return new Response(file, {
          headers: { "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream" },
        });
      },
    });
    console.log(`wayfinder dungeon map (prototype) → http://localhost:${server.port}`);
  } catch (err: unknown) {
    const isAddrInUse = err instanceof Error && "code" in err && err.code === "EADDRINUSE";
    if (isAddrInUse && attemptsLeft > 0) {
      startServer(port + 1, attemptsLeft - 1);
      return;
    }
    throw err;
  }
}

loadRepoIdentity();
startServer(4174);
