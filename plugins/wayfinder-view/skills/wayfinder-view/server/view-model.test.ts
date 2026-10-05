// Unit coverage for the one shared, adapter-agnostic seam: `computeMap`,
// run against fixtures shaped like both the GitHub adapter's and the
// local-markdown adapter's raw output (a GitHub-shaped fixture uses plain
// numeric ids like a GitHub issue number would be stringified as; a
// local-markdown-shaped fixture uses zero-padded `NN` ids) — so
// adapter-specific id-format quirks are exercised through the same
// function. Pixel-level canvas rendering is explicitly out of this seam's
// scope (see the issue's Testing Decisions).

import { describe, expect, test } from "bun:test";
import { computeMap, parseDecisionGists, type RawMapFacts, type RawTicket } from "./view-model.ts";

function ticket(overrides: Partial<RawTicket> & Pick<RawTicket, "id">): RawTicket {
  return {
    title: `Ticket ${overrides.id}`,
    url: `https://example.test/issues/${overrides.id}`,
    type: "task",
    state: "open",
    openBlockedBy: [],
    allBlockedBy: [],
    claimedBy: null,
    parentId: "map-1",
    size: null,
    priority: null,
    ...overrides,
  };
}

function map(overrides: Partial<RawMapFacts> & { tickets: RawTicket[] }): RawMapFacts {
  return {
    id: "map-1",
    title: "Example map",
    url: "https://example.test/issues/map-1",
    state: "open",
    destination: "Ship the thing",
    decisionsSoFarMarkdown: "",
    ...overrides,
  };
}

describe("status precedence (closed > blocked > claimed > frontier)", () => {
  test("a closed ticket is always status closed, regardless of blockers or claim", () => {
    const facts = map({
      tickets: [
        ticket({ id: "1", state: "closed", openBlockedBy: ["2"], claimedBy: "alice" }),
        ticket({ id: "2" }),
      ],
    });
    const { viewModel } = computeMap(facts);
    expect(viewModel.tickets.find((t) => t.id === "1")!.status).toBe("closed");
  });

  test("an open ticket with an open blocker is blocked, even if claimed", () => {
    const facts = map({
      tickets: [
        ticket({ id: "1", openBlockedBy: ["2"], allBlockedBy: ["2"], claimedBy: "alice" }),
        ticket({ id: "2" }),
      ],
    });
    const { viewModel } = computeMap(facts);
    expect(viewModel.tickets.find((t) => t.id === "1")!.status).toBe("blocked");
  });

  test("an open, unblocked, claimed ticket is claimed", () => {
    const facts = map({ tickets: [ticket({ id: "1", claimedBy: "alice" })] });
    const { viewModel } = computeMap(facts);
    expect(viewModel.tickets[0].status).toBe("claimed");
  });

  test("an open, unblocked, unclaimed ticket is frontier", () => {
    const facts = map({ tickets: [ticket({ id: "1" })] });
    const { viewModel } = computeMap(facts);
    expect(viewModel.tickets[0].status).toBe("frontier");
  });

  test("a ticket whose only blocker has closed is unblocked — reflects openBlockedBy, not allBlockedBy", () => {
    const facts = map({
      tickets: [
        ticket({ id: "1", openBlockedBy: [], allBlockedBy: ["2"] }),
        ticket({ id: "2", state: "closed" }),
      ],
    });
    const { viewModel } = computeMap(facts);
    expect(viewModel.tickets.find((t) => t.id === "1")!.status).toBe("frontier");
  });
});

describe("tier/hostId stability across a blocker closing", () => {
  test("a dependent's tier and hostId are unchanged when its blocker closes — only status reacts", () => {
    const open = map({
      tickets: [ticket({ id: "1" }), ticket({ id: "2", openBlockedBy: ["1"], allBlockedBy: ["1"] })],
    });
    const closed = map({
      tickets: [
        ticket({ id: "1", state: "closed" }),
        ticket({ id: "2", openBlockedBy: [], allBlockedBy: ["1"] }),
      ],
    });

    const before = computeMap(open).viewModel.tickets.find((t) => t.id === "2")!;
    const after = computeMap(closed).viewModel.tickets.find((t) => t.id === "2")!;

    expect(before.tier).toBe("dependent");
    expect(before.hostId).toBe("1");
    expect(after.tier).toBe("dependent");
    expect(after.hostId).toBe("1");
    expect(before.status).toBe("blocked");
    expect(after.status).toBe("frontier");
  });

  test("a ticket with no in-map blockers is primary-tier, hosted on itself", () => {
    const facts = map({ tickets: [ticket({ id: "1" })] });
    const { viewModel } = computeMap(facts);
    expect(viewModel.tickets[0].tier).toBe("primary");
    expect(viewModel.tickets[0].hostId).toBe("1");
    expect(viewModel.tickets[0].crossLinkIds).toEqual([]);
  });

  test("a blocker id outside the map's own ticket set never demotes a ticket to dependent", () => {
    const facts = map({ tickets: [ticket({ id: "1", allBlockedBy: ["999"] })] });
    const { viewModel } = computeMap(facts);
    expect(viewModel.tickets[0].tier).toBe("primary");
    expect(viewModel.tickets[0].hostId).toBe("1");
  });
});

describe("diamond-dependency resolution", () => {
  test("a dependent blocked behind 2+ primaries gets exactly one hostId (lowest-numbered) plus crossLinkIds to the rest, never a duplicated entry", () => {
    const facts = map({
      tickets: [
        ticket({ id: "5" }),
        ticket({ id: "2" }),
        ticket({ id: "8" }),
        ticket({ id: "3", allBlockedBy: ["5", "2", "8"], openBlockedBy: ["5", "2", "8"] }),
      ],
    });
    const { viewModel, summary } = computeMap(facts);
    const shared = viewModel.tickets.find((t) => t.id === "3")!;
    expect(shared.tier).toBe("dependent");
    expect(shared.hostId).toBe("2");
    expect(shared.crossLinkIds.sort()).toEqual(["5", "8"]);
    // Exactly one entry for the shared ticket — never duplicated per parent.
    expect(viewModel.tickets.filter((t) => t.id === "3").length).toBe(1);
    expect(summary.totalCount).toBe(4);
  });

  test("a multi-hop chain collapses onto its primary ancestor instead of producing a moon-of-a-moon", () => {
    const facts = map({
      tickets: [
        ticket({ id: "1" }),
        ticket({ id: "2", allBlockedBy: ["1"] }),
        ticket({ id: "3", allBlockedBy: ["2"] }),
      ],
    });
    const { viewModel } = computeMap(facts);
    const deepest = viewModel.tickets.find((t) => t.id === "3")!;
    expect(deepest.tier).toBe("dependent");
    expect(deepest.hostId).toBe("1");
    expect(deepest.crossLinkIds).toEqual([]);
  });

  test("a chain that reaches 2 distinct primaries through different intermediate dependents still collapses to one host plus cross-links", () => {
    // 10 and 20 are both primary. 30 is blocked by 10 directly, and by 21
    // (itself a dependent of 20) — so 30's ancestor set is {10, 20} even
    // though one path is indirect.
    const facts = map({
      tickets: [
        ticket({ id: "10" }),
        ticket({ id: "20" }),
        ticket({ id: "21", allBlockedBy: ["20"] }),
        ticket({ id: "30", allBlockedBy: ["10", "21"] }),
      ],
    });
    const { viewModel } = computeMap(facts);
    const t30 = viewModel.tickets.find((t) => t.id === "30")!;
    expect(t30.hostId).toBe("10");
    expect(t30.crossLinkIds).toEqual(["20"]);
  });
});

describe("primary-to-primary blocking produces no cross-link entries", () => {
  test("a ticket blocked by exactly one primary gets that primary as its sole host with empty crossLinkIds — not treated as a diamond", () => {
    const facts = map({
      tickets: [ticket({ id: "1" }), ticket({ id: "2", allBlockedBy: ["1"] })],
    });
    const { viewModel } = computeMap(facts);
    const dependent = viewModel.tickets.find((t) => t.id === "2")!;
    expect(dependent.hostId).toBe("1");
    expect(dependent.crossLinkIds).toEqual([]);
  });

  test("every primary-tier ticket always has empty crossLinkIds, regardless of blocking elsewhere in the map", () => {
    const facts = map({
      tickets: [ticket({ id: "1" }), ticket({ id: "2" }), ticket({ id: "3", allBlockedBy: ["1", "2"] })],
    });
    const { viewModel } = computeMap(facts);
    for (const t of viewModel.tickets.filter((t) => t.tier === "primary")) {
      expect(t.crossLinkIds).toEqual([]);
    }
  });
});

describe("gist population", () => {
  test("gist is populated for a closed ticket matched by url in Decisions-so-far, and null for everything else", () => {
    const facts = map({
      decisionsSoFarMarkdown: [
        "## Decisions so far",
        "",
        "- [Ticket 1](https://example.test/issues/1) — went with option B",
        "- [Ticket 2](https://example.test/issues/2) — picked the simpler schema",
      ].join("\n"),
      tickets: [
        ticket({ id: "1", state: "closed" }),
        ticket({ id: "2", state: "closed" }),
        ticket({ id: "3", state: "closed" }), // closed but no matching bullet
        ticket({ id: "4" }), // open — never gets a gist even if a bullet existed
      ],
    });
    const { viewModel } = computeMap(facts);
    const byId = Object.fromEntries(viewModel.tickets.map((t) => [t.id, t]));
    expect(byId["1"].gist).toBe("went with option B");
    expect(byId["2"].gist).toBe("picked the simpler schema");
    expect(byId["3"].gist).toBeNull();
    expect(byId["4"].gist).toBeNull();
  });

  test("parseDecisionGists ignores malformed lines and lines whose link doesn't match any known ticket", () => {
    const tickets = [ticket({ id: "1", state: "closed" })];
    const gists = parseDecisionGists(
      ["not a bullet at all", "- [Ticket 1](https://example.test/issues/1) — the answer", "- [Unknown](https://example.test/issues/999) — orphaned"].join(
        "\n",
      ),
      tickets,
    );
    expect(gists.get("1")).toBe("the answer");
    expect(gists.size).toBe(1);
  });
});

describe("size/priority pass through as null when absent", () => {
  test("both adapters currently leave size/priority unpopulated — they surface as null, not dropped or defaulted", () => {
    const facts = map({ tickets: [ticket({ id: "1", size: null, priority: null })] });
    const { viewModel } = computeMap(facts);
    expect(viewModel.tickets[0].size).toBeNull();
    expect(viewModel.tickets[0].priority).toBeNull();
  });
});

describe("adapter-shaped fixtures", () => {
  test("a GitHub-shaped fixture (numeric string ids, assignee-login claimedBy) computes the same shape as a local-markdown-shaped one (zero-padded ids, claimed sentinel)", () => {
    const githubShaped = map({
      id: "52",
      tickets: [
        ticket({ id: "53" }),
        ticket({ id: "54", allBlockedBy: ["53"], openBlockedBy: ["53"] }),
        ticket({ id: "55", claimedBy: "octocat" }),
      ],
    });
    const localShaped = map({
      id: "map",
      tickets: [
        ticket({ id: "01" }),
        ticket({ id: "02", allBlockedBy: ["01"], openBlockedBy: ["01"] }),
        ticket({ id: "03", claimedBy: "claimed" }),
      ],
    });

    const gh = computeMap(githubShaped).viewModel.tickets;
    const local = computeMap(localShaped).viewModel.tickets;

    expect(gh.map((t) => t.tier)).toEqual(local.map((t) => t.tier));
    expect(gh.map((t) => t.status)).toEqual(local.map((t) => t.status));
    expect(gh[1].hostId).toBe("53");
    expect(local[1].hostId).toBe("01");
  });
});

describe("MapSummary", () => {
  test("closedCount/totalCount reflect the ticket list, independent of tier/status", () => {
    const facts = map({
      tickets: [
        ticket({ id: "1", state: "closed" }),
        ticket({ id: "2", state: "closed", allBlockedBy: ["1"] }),
        ticket({ id: "3" }),
      ],
    });
    const { summary } = computeMap(facts);
    expect(summary).toEqual({
      id: "map-1",
      title: "Example map",
      url: "https://example.test/issues/map-1",
      state: "open",
      destination: "Ship the thing",
      closedCount: 2,
      totalCount: 3,
    });
  });
});
