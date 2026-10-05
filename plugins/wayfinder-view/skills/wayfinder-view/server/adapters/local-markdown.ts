// Local-markdown tracker adapter — maps the `.scratch/<effort>/` on-disk
// convention (see the `setup-matt-pocock-skills` plugin's
// `issue-tracker-local.md`) onto `view-model.ts`'s adapter-agnostic
// `RawMapFacts`/`RawTicket` shape. This is the fallback adapter: a repo
// with no GitHub tracker doc naming a "Wayfinding operations" section
// defaults here, matching `/wayfinder`'s own resolution rule.
//
// Convention recap:
//   - map:          .scratch/<effort>/map.md
//   - child ticket: .scratch/<effort>/issues/NN-<slug>.md
//   - a ticket file carries `Type:` (research/prototype/grilling/task),
//     `Status:` (absent = open+unclaimed, `claimed`, or `resolved`), and
//     an optional `Blocked by: NN, NN` line
//   - a ticket is unblocked once every ticket it names is `resolved`

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { extractSection } from "../markdown.ts";
import { computeMap, type MapSummary, type MapViewModel, type RawMapFacts, type RawTicket, type TicketType } from "../view-model.ts";

const SCRATCH_DIR = ".scratch";
const TICKET_TYPES: readonly TicketType[] = ["research", "prototype", "grilling", "task"];

// Every `.scratch/<slug>/` directory that actually holds a `map.md` —
// anything else under `.scratch/` (a non-wayfinder scratch convention
// reusing the same directory) is ignored.
function listEffortSlugs(repoPath: string): string[] {
  const scratchDir = join(repoPath, SCRATCH_DIR);
  if (!existsSync(scratchDir)) return [];
  return readdirSync(scratchDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(scratchDir, entry.name, "map.md")))
    .map((entry) => entry.name)
    .sort();
}

// Pure — a single ticket file's text onto a `RawTicket` (minus
// `openBlockedBy`, which needs every sibling's state and is filled in by
// the caller once the whole effort's tickets are loaded).
export function parseTicketFile(text: string, id: string, slugFallback: string): Omit<RawTicket, "openBlockedBy" | "parentId" | "url"> {
  const titleMatch = /^#\s+(.+)$/m.exec(text);
  const typeMatch = /^Type:\s*(\S+)/im.exec(text);
  const statusMatch = /^Status:\s*(\S+)/im.exec(text);
  const blockedByMatch = /^Blocked by:\s*(.+)$/im.exec(text);

  const typeToken = typeMatch?.[1].toLowerCase() ?? "";
  const type: TicketType = (TICKET_TYPES as readonly string[]).includes(typeToken) ? (typeToken as TicketType) : "task";

  const status = statusMatch?.[1].toLowerCase() ?? "";
  const state: "open" | "closed" = status === "resolved" ? "closed" : "open";
  // Local-markdown has no identity concept to carry a real claimant —
  // `"claimed"` is the sentinel value user story 47 documents, surfaced
  // whenever the file has moved past unclaimed (claimed, or resolved —
  // resolving implies it was claimed first).
  const claimedBy = status === "claimed" || status === "resolved" ? "claimed" : null;

  const allBlockedBy = blockedByMatch
    ? blockedByMatch[1]
        .split(",")
        .map((token) => token.trim().padStart(2, "0"))
        .filter(Boolean)
    : [];

  return {
    id,
    title: titleMatch ? titleMatch[1].trim() : slugFallback.replace(/-/g, " "),
    type,
    state,
    allBlockedBy,
    claimedBy,
    size: null,
    priority: null,
  };
}

// A Decisions-so-far bullet is normally hand/agent-written with a link
// relative to `map.md`'s own directory (`issues/03-foo.md`, `./issues/...`)
// — not necessarily byte-identical to the `url` (repo-root-relative) this
// adapter assigns each ticket. Rewrite every non-http link that resolves
// to a known ticket's file onto that ticket's own `url` before handing the
// markdown to the shared, exact-match `parseDecisionGists` — keeping the
// link-shape normalization here, tracker-specific, while the matching
// logic in view-model.ts stays a plain string comparison.
function normalizeDecisionLinks(markdown: string, effortDir: string, repoPath: string, tickets: RawTicket[]): string {
  const ticketByAbsPath = new Map(tickets.map((t) => [resolve(repoPath, t.url), t]));
  return markdown.replace(/\(([^)]+)\)/g, (whole, link: string) => {
    if (/^https?:\/\//.test(link)) return whole;
    const match = ticketByAbsPath.get(resolve(effortDir, link));
    return match ? `(${match.url})` : whole;
  });
}

function loadEffort(repoPath: string, slug: string): RawMapFacts {
  const effortDir = join(repoPath, SCRATCH_DIR, slug);
  const mapPath = join(effortDir, "map.md");
  const mapText = readFileSync(mapPath, "utf8");
  const mapTitleMatch = /^#\s+(.+)$/m.exec(mapText);
  const mapStatusMatch = /^Status:\s*(\S+)/im.exec(mapText);

  const issuesDir = join(effortDir, "issues");
  const ticketFiles = existsSync(issuesDir)
    ? readdirSync(issuesDir)
        .filter((f) => /^\d+-.+\.md$/.test(f))
        .sort()
    : [];

  const tickets: RawTicket[] = ticketFiles.map((file) => {
    const path = join(issuesDir, file);
    const id = /^(\d+)-/.exec(file)![1];
    const slugFallback = file.replace(/^\d+-/, "").replace(/\.md$/, "");
    const parsed = parseTicketFile(readFileSync(path, "utf8"), id, slugFallback);
    return { ...parsed, url: relative(repoPath, path), parentId: slug, openBlockedBy: [] };
  });

  // A ticket is unblocked once every ticket it names is resolved — so
  // `openBlockedBy` is the subset of `allBlockedBy` whose own state isn't
  // yet "closed".
  const stateById = new Map(tickets.map((t) => [t.id, t.state]));
  for (const t of tickets) {
    t.openBlockedBy = t.allBlockedBy.filter((id) => stateById.get(id) !== "closed");
  }

  return {
    id: slug,
    title: mapTitleMatch ? mapTitleMatch[1].trim() : slug,
    url: relative(repoPath, mapPath),
    state: mapStatusMatch?.[1].toLowerCase() === "resolved" ? "closed" : "open",
    destination: extractSection(mapText, "Destination"),
    decisionsSoFarMarkdown: normalizeDecisionLinks(extractSection(mapText, "Decisions so far"), effortDir, repoPath, tickets),
    tickets,
  };
}

export function listMapSummaries(repoPath: string): MapSummary[] {
  return listEffortSlugs(repoPath).map((slug) => computeMap(loadEffort(repoPath, slug)).summary);
}

export function loadMap(repoPath: string, mapId: string): MapViewModel | null {
  if (!listEffortSlugs(repoPath).includes(mapId)) return null;
  return computeMap(loadEffort(repoPath, mapId)).viewModel;
}
