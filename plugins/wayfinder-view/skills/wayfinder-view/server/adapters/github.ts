// GitHub tracker adapter — maps this repo's own `docs/agents/issue-tracker.md`
// "Wayfinding operations" convention onto `view-model.ts`'s adapter-agnostic
// `RawMapFacts`/`RawTicket` shape, via the `gh` CLI (never a raw token/fetch
// — `gh` already carries the user's auth and repo resolution). Every `gh`
// call runs with `cwd` set to the target repo path so `gh` resolves the
// right remote on its own.
//
// Map: an issue labelled `wayfinder:map`. Child ticket: a GitHub sub-issue,
// typed via a `wayfinder:<type>` label, claimed via assignee. Blocking:
// GitHub's native issue-dependencies API — `issue_dependencies_summary`
// only carries counts, so the actual blocker ids (and each blocker's own
// open/closed state, needed to split `allBlockedBy`/`openBlockedBy`) come
// from `GET .../dependencies/blocked_by` instead.

import { execFileSync } from "node:child_process";
import { extractSection } from "../markdown.ts";
import { computeMap, type MapSummary, type MapViewModel, type RawMapFacts, type RawTicket, type TicketType } from "../view-model.ts";

const TICKET_TYPES: readonly TicketType[] = ["research", "prototype", "grilling", "task"];

type GhIssueRef = { number: number; title: string; html_url: string; state: string; body: string | null; pull_request?: unknown };
type GhSubIssue = { number: number; title: string; html_url: string; state: string; labels: Array<{ name: string }>; assignees: Array<{ login: string }> };
type GhBlocker = { number: number; state: string };

function gh(args: string[], repoPath: string): string {
  return execFileSync("gh", args, { cwd: repoPath, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}

function ghApiJson<T>(path: string, repoPath: string): T {
  return JSON.parse(gh(["api", path], repoPath)) as T;
}

export function repoSlug(repoPath: string): string {
  return gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], repoPath).trim();
}

// Pure mapping — a sub-issue plus its own blocked-by list onto a
// `RawTicket`. Kept free of any `gh`/network call so it's unit-testable
// against a fixture shaped like the REST responses, without a real repo.
export function mapGithubTicket(issue: GhSubIssue, blockedBy: GhBlocker[], mapId: string): RawTicket {
  const typeToken = issue.labels.map((l) => l.name).find((n) => n.startsWith("wayfinder:"))?.slice("wayfinder:".length) ?? "";
  const type: TicketType = (TICKET_TYPES as readonly string[]).includes(typeToken) ? (typeToken as TicketType) : "task";
  return {
    id: String(issue.number),
    title: issue.title,
    url: issue.html_url,
    type,
    state: issue.state === "closed" ? "closed" : "open",
    allBlockedBy: blockedBy.map((b) => String(b.number)),
    openBlockedBy: blockedBy.filter((b) => b.state === "open").map((b) => String(b.number)),
    claimedBy: issue.assignees[0]?.login ?? null,
    parentId: mapId,
    size: null,
    priority: null,
  };
}

function loadRawMapFacts(repo: string, repoPath: string, mapIssue: GhIssueRef): RawMapFacts {
  const mapId = String(mapIssue.number);
  const subIssues = ghApiJson<GhSubIssue[]>(`repos/${repo}/issues/${mapIssue.number}/sub_issues`, repoPath);

  const tickets = subIssues.map((issue) => {
    const blockedBy = ghApiJson<GhBlocker[]>(`repos/${repo}/issues/${issue.number}/dependencies/blocked_by`, repoPath);
    return mapGithubTicket(issue, blockedBy, mapId);
  });

  const body = mapIssue.body ?? "";
  return {
    id: mapId,
    title: mapIssue.title,
    url: mapIssue.html_url,
    state: mapIssue.state === "closed" ? "closed" : "open",
    destination: extractSection(body, "Destination"),
    decisionsSoFarMarkdown: extractSection(body, "Decisions so far"),
    tickets,
  };
}

// REST `/issues` (unlike `gh issue list --json`) returns a consistent
// lowercase `state` across both this listing and the single-issue fetch in
// `loadMap`, and also includes PRs sharing the same label — filtered out
// since a `wayfinder:map` label is never applied to a PR in practice, but
// defensively skipped if it ever is.
function listMapIssues(repo: string, repoPath: string): GhIssueRef[] {
  const issues = ghApiJson<GhIssueRef[]>(`repos/${repo}/issues?labels=wayfinder%3Amap&state=all&per_page=100`, repoPath);
  return issues.filter((i) => !("pull_request" in i));
}

export function listMapSummaries(repoPath: string): MapSummary[] {
  const repo = repoSlug(repoPath);
  return listMapIssues(repo, repoPath).map((issue) => computeMap(loadRawMapFacts(repo, repoPath, issue)).summary);
}

export function loadMap(repoPath: string, mapId: string): MapViewModel | null {
  const repo = repoSlug(repoPath);
  let issue: GhIssueRef;
  try {
    issue = ghApiJson<GhIssueRef>(`repos/${repo}/issues/${mapId}`, repoPath);
  } catch {
    return null;
  }
  return computeMap(loadRawMapFacts(repo, repoPath, issue)).viewModel;
}
