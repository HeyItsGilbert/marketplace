// Canonical, adapter-agnostic view-model: tiering, diamond-dependency
// resolution, and status derivation. Pure given raw per-ticket facts — no
// filesystem, network, or tracker-specific knowledge lives here. Both
// server/adapters/github.ts and server/adapters/local-markdown.ts map their
// tracker's native shape onto `RawMapFacts`/`RawTicket`; this module turns
// that into the `MapViewModel`/`MapSummary` both the star-map renderer (the
// only theme this spec ships) and any future renderer consume.
//
// Field names stay theme-neutral (`tier`/`hostId`, not `tier`/`hostPlanetId`)
// so a future alternate renderer is additive, not a schema break — the
// star-map renderer alone maps `primary → planet` and `dependent → moon`.

export type TicketType = "research" | "prototype" | "grilling" | "task";
export type TicketState = "open" | "closed";

// Derived, precedence closed > blocked > claimed > frontier — an open
// blocker always outranks a premature claim.
export type TicketStatus = "closed" | "blocked" | "frontier" | "claimed";

// Orbit placement (planet vs. moon). Decided once from `allBlockedBy` (open
// + closed) so the map's layout doesn't reshape itself every time a blocker
// happens to close — only `status` reacts to that.
export type DependencyTier = "primary" | "dependent";

// What an adapter hands the view-model for one ticket. Every field here is
// required on both the GitHub and local-markdown adapters.
export type RawTicket = {
  id: string;
  title: string;
  url: string;
  type: TicketType;
  state: TicketState;
  // Open-only — the live gate `status` is derived from. A ticket whose
  // blockers have since closed flips to unblocked/claimed/frontier here
  // without changing `allBlockedBy`/tier.
  openBlockedBy: string[];
  // Open + closed — stable once decided, drives `tier`/`hostId`.
  allBlockedBy: string[];
  // Assignee login on GitHub; a claimed/unclaimed sentinel string on
  // local-markdown, which has no identity concept. `null` when unclaimed.
  claimedBy: string | null;
  // The map's id this ticket belongs to.
  parentId: string;
  // Both nullable and currently unpopulated on every adapter — carried now
  // so a future populated source isn't a schema bump.
  size: string | null;
  priority: string | null;
};

// Everything one map load needs, before diamond resolution/tiering/status
// have been computed.
export type RawMapFacts = {
  id: string;
  title: string;
  url: string;
  state: TicketState;
  destination: string;
  // The map body's own "Decisions so far" section, verbatim markdown —
  // `parseDecisionGists` pulls each closed ticket's gist from here. Never
  // re-derived from a resolution comment / ticket's own `## Answer`
  // section, so there's exactly one copy of each decision's summary.
  decisionsSoFarMarkdown: string;
  tickets: RawTicket[];
};

export type Ticket = RawTicket & {
  status: TicketStatus;
  tier: DependencyTier;
  // Self for primary-tier tickets; the canonical lowest-numbered
  // primary-tier ancestor for dependents (collapsing any deeper blocking
  // chain directly onto it — "capped-depth" dependents).
  hostId: string;
  // Other primary-tier ids a shared dependent is also (transitively)
  // blocked behind. Empty for primaries and non-shared dependents.
  crossLinkIds: string[];
  // Parsed once per map load from the map's own Decisions-so-far bullet.
  // `null` for every open ticket, and for a closed ticket with no matching
  // bullet.
  gist: string | null;
};

// Flat list, not a nested tree — `tier`/`hostId`/`crossLinkIds` carry the
// orbit structure so a diamond-shared dependent is never duplicated.
export type MapViewModel = {
  id: string;
  title: string;
  url: string;
  state: TicketState;
  destination: string;
  tickets: Ticket[];
};

// Map discovery / jump bar entry.
export type MapSummary = {
  id: string;
  title: string;
  url: string;
  state: TicketState;
  destination: string;
  closedCount: number;
  totalCount: number;
};

// Matches a Decisions-so-far bullet line, per the wayfinder skill's own map
// body convention: `- [<title>](<url>) — <gist>`. The dash between the link
// and the gist may be an em dash or a plain hyphen.
const DECISION_BULLET_RE = /^-\s*\[[^\]]*\]\((?<url>[^)]+)\)\s*[—-]\s*(?<gist>.+?)\s*$/;

// Pure — pulls a `ticketId -> gist` map out of the map body's
// Decisions-so-far markdown by matching each bullet's link against the
// ticket's own `url`. A bullet whose url doesn't match any known ticket is
// silently ignored (e.g. a stale/hand-edited line).
export function parseDecisionGists(markdown: string, tickets: RawTicket[]): Map<string, string> {
  const idByUrl = new Map(tickets.map((t) => [t.url, t.id]));
  const gists = new Map<string, string>();
  for (const rawLine of markdown.split("\n")) {
    const match = DECISION_BULLET_RE.exec(rawLine.trim());
    if (!match || !match.groups) continue;
    const id = idByUrl.get(match.groups.url);
    if (id) gists.set(id, match.groups.gist);
  }
  return gists;
}

// Numeric-aware comparison for "lowest-numbered" — both adapters hand this
// module plain numeric-string ids (a GitHub issue number, a local-markdown
// ticket's two-digit `NN`), so a numeric compare is the common case; a
// non-numeric id (neither side parses) falls back to a stable lexical
// ordering rather than throwing.
function compareIds(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

// The one shared, adapter-agnostic computation: raw per-ticket facts in,
// `MapViewModel` + `MapSummary` out. Both adapters' fixtures must produce
// identical layout behavior for identical dependency shapes through this
// single function.
export function computeMap(raw: RawMapFacts): { viewModel: MapViewModel; summary: MapSummary } {
  const byId = new Map(raw.tickets.map((t) => [t.id, t]));
  const gists = parseDecisionGists(raw.decisionsSoFarMarkdown, raw.tickets);

  const tierOf = new Map<string, DependencyTier>();
  for (const t of raw.tickets) {
    // A blocker referencing something outside this map (another map's
    // ticket, an ad-hoc issue never wired as a child) can never resolve to
    // an in-map primary ancestor — ignore it so a ticket isn't demoted to
    // "dependent" with nowhere to orbit.
    const inMapBlockerCount = t.allBlockedBy.filter((id) => byId.has(id)).length;
    tierOf.set(t.id, inMapBlockerCount === 0 ? "primary" : "dependent");
  }

  // Transitive closure of primary-tier ancestors reachable by walking
  // `allBlockedBy`, memoized. This is what makes dependents "capped-depth":
  // a multi-hop blocking chain (C blocked by B blocked by A) collapses
  // directly onto A, never rendering an intermediate moon-of-a-moon. A
  // dependent blocked behind 2+ distinct primaries collects all of them
  // here, which is exactly the diamond-dependency set.
  const ancestorMemo = new Map<string, Set<string>>();
  function primaryAncestors(id: string): Set<string> {
    const memoized = ancestorMemo.get(id);
    if (memoized) return memoized;
    // Cycle guard: a ticket visited while its own computation is still in
    // flight sees this empty placeholder instead of recursing forever.
    const guard = new Set<string>();
    ancestorMemo.set(id, guard);

    const ticket = byId.get(id);
    let result: Set<string>;
    if (!ticket || tierOf.get(id) === "primary") {
      result = new Set([id]);
    } else {
      result = new Set<string>();
      for (const blockerId of ticket.allBlockedBy.filter((id) => byId.has(id))) {
        for (const ancestor of primaryAncestors(blockerId)) result.add(ancestor);
      }
      // Every in-map blocker was itself mid-cycle (or, defensively, some
      // other path left this empty) — fall back to self-hosting rather
      // than vanishing the ticket from the map entirely.
      if (result.size === 0) result = new Set([id]);
    }
    ancestorMemo.set(id, result);
    return result;
  }

  const tickets: Ticket[] = raw.tickets.map((t) => {
    const status: TicketStatus =
      t.state === "closed"
        ? "closed"
        : t.openBlockedBy.length > 0
          ? "blocked"
          : t.claimedBy !== null
            ? "claimed"
            : "frontier";

    const tier = tierOf.get(t.id)!;
    let hostId: string;
    let crossLinkIds: string[];
    if (tier === "primary") {
      hostId = t.id;
      crossLinkIds = [];
    } else {
      const ancestors = [...primaryAncestors(t.id)].sort(compareIds);
      hostId = ancestors[0];
      crossLinkIds = ancestors.slice(1);
    }

    return {
      ...t,
      status,
      tier,
      hostId,
      crossLinkIds,
      gist: t.state === "closed" ? (gists.get(t.id) ?? null) : null,
    };
  });

  const viewModel: MapViewModel = {
    id: raw.id,
    title: raw.title,
    url: raw.url,
    state: raw.state,
    destination: raw.destination,
    tickets,
  };
  const summary: MapSummary = {
    id: raw.id,
    title: raw.title,
    url: raw.url,
    state: raw.state,
    destination: raw.destination,
    closedCount: tickets.filter((t) => t.state === "closed").length,
    totalCount: tickets.length,
  };
  return { viewModel, summary };
}
