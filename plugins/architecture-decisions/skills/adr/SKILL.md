---
name: adr
description: Create and manage Architecture Decision Records (ADRs) — lightweight documents committed to the repo that capture why a design decision was made, readable by both humans and AI agents. Use this skill when the user asks to create, update, or manage ADRs or decision records. Also activate when asked to document a decision, record an architectural choice, backfill undocumented decisions, or convert an RFC into an ADR. PROACTIVELY recommend this skill during conversations where the user is making or has just made a significant architectural choice — choosing between libraries, establishing patterns, selecting dependencies, or debating trade-offs — even if they haven't explicitly asked for documentation. Trigger phrases include "decision record", "architecture decision", "ADR", "document this decision", "why did we choose", "design rationale", "let's go with", "we decided to", "what's our standard for". For proposals needing team discussion before a decision is made, use /rfc instead. Do NOT use for: general documentation, README files, API reference docs, runbooks, or incident reports.
allowed-tools: Bash(git log *), Bash(git diff *)
---

# Architecture Decision Records

Create lightweight decision records that help both humans and AI agents understand *why* something was built a certain way — not just *what* was built.

An ADR captures a decision after it's been made: "We decided X, because Y, accepting tradeoff Z." For proposals that need team discussion *before* a decision, use `/rfc` to open a Request for Comments first — then convert it to an ADR when it concludes.

Both document types live in `docs/decisions/` so they travel with the code they describe.

## When to recommend an ADR

Proactively suggest an ADR when you detect these patterns in conversation. The guiding question (adapted from Spotify engineering) is: *"Has a significant decision been made that future engineers will need to understand?"*

**Suggest an ADR when:**
- A decision was just made in conversation and should be captured
- An implicit standard exists but was never documented (backfilling)
- A small but meaningful choice was made — dependency selection, coding pattern, configuration approach
- Consensus already exists and the value is in the record, not the discussion
- An RFC has concluded and the outcome needs to be recorded

**Suggest `/rfc` instead when** the decision is large, needs input from others, or involves competing approaches that need structured debate.

### Decision tree

```
Is a significant decision being made or discussed?
├── No → don't suggest anything
└── Yes → Is it a big change needing input from others?
    ├── Yes → suggest /rfc (then an ADR when it concludes)
    └── No / consensus already exists → suggest an ADR
```

When nudging, keep it brief: *"This looks like an architectural decision worth capturing. Want me to draft an ADR?"*

## Directory structure and numbering

All decision documents live in `docs/decisions/` at the repo root:

```
docs/decisions/
  INDEX.md
  RFC-001-auth-token-storage.md
  ADR-001-use-react-hooks.md
  ADR-002-postgres-over-mongo.md
```

**File naming:** `{TYPE}-{NNN}-{slug}.md` — type prefix, zero-padded 3-digit ID, kebab-case slug derived from the title.

**Auto-incrementing:** Before creating a document, scan `docs/decisions/` for existing files matching `ADR-*.md` or `RFC-*.md`, find the highest number for that type, and use the next one. If the directory doesn't exist, create it and start at 001.

## ADR template

Based on Michael Nygard's format (used by Backstage, among others), extended with structured frontmatter for agent discoverability.

```markdown
---
id: ADR-{NNN}
title: "{Title}"
status: proposed | accepted | deprecated | superseded
date: {YYYY-MM-DD}
decision-makers: []
related: []
tags: []
superseded-by:
---

# ADR-{NNN}: {Title}

## Status

{Proposed | Accepted | Deprecated | Superseded by [ADR-XXX](ADR-XXX-slug.md)}

## Context

Describe the forces at play — technical constraints, business requirements,
team dynamics, timeline pressure. The language here is value-neutral: state
facts, not conclusions. A reader (human or agent) should understand the
problem space without needing to read the source code.

## Decision

State the decision in active voice. "We will use..." or "We chose X over Y
because Z." Lead with the choice, then the reasoning.

## Consequences

All consequences — positive, negative, and neutral — should be listed here.
Every decision has trade-offs; naming them honestly builds trust and helps
future decision-makers know when to revisit this choice.

- **Positive:** {what becomes easier}
- **Negative:** {what becomes harder or what we give up}
- **Neutral:** {side effects that are neither good nor bad}

## Alternatives considered

For each alternative, briefly state what it is and why it was not chosen.
Even a sentence or two prevents future engineers from re-proposing ideas
that were already evaluated.
```

### When to include each section

Every ADR needs Context, Decision, and Consequences — those are the core. Alternatives Considered is strongly recommended but can be omitted for trivial decisions. Keep the document proportional to the decision's weight: a small choice gets a short ADR.

## Frontmatter design

The YAML frontmatter serves a specific purpose: it makes decision records queryable by agents and tooling without parsing prose. An agent can scan all ADRs, filter by status or tag, and follow the `related` links to build a decision graph — something that's hard to do from unstructured text alone.

| Field | Purpose |
|-------|---------|
| `id` | Unique identifier for cross-referencing |
| `status` | Lifecycle state — agents can filter for active vs. superseded decisions |
| `date` | When created (or when the original decision was made, for backfills) |
| `related` | Links between RFCs and ADRs, or between ADRs that interact |
| `tags` | Categorization (e.g., `[frontend, auth, database]`) for discovery |
| `superseded-by` | When set, signals that a newer ADR replaces this one |

## Backfilling existing decisions

When asked to document decisions that were already made:

1. **Investigate with git:** Use `git log --all --oneline --grep="keyword"` and `git log --diff-filter=A -- path/to/file` to find when a pattern or library was introduced. Check commit messages and PR descriptions for reasoning.
2. **Ask the user to fill gaps:** Git history shows *what* changed but rarely captures *why*. Present what you found and ask the user to confirm or expand on the reasoning.
3. **Date it accurately:** Use the date of the original decision from git history, not today. Add a note at the top:
   > Backfilled on {today}. Original decision made circa {original date}.
4. **Keep it lean:** Backfilled ADRs are often shorter than prospective ones. A three-sentence ADR that captures "we chose X because Y" is infinitely better than no ADR.

## Converting an RFC to an ADR

When an RFC reaches a conclusion and needs to become an ADR:

1. Read the RFC and pull context, alternatives, and the resolution into a new ADR — don't rewrite from scratch
2. Update the RFC's `status` to `closed` and fill in its **Resolution** section with a link to the new ADR
3. Cross-reference: the ADR's `related` field includes the RFC ID; the RFC's resolution links to the ADR
4. Keep both documents — the RFC preserves discussion history; the ADR is the authoritative record

## Updating status

When a decision is revisited:

- **Superseded:** Set `status: superseded` and `superseded-by: ADR-{NNN}` on the old ADR. The new ADR should reference the old one in its Context section, explaining what changed.
- **Deprecated:** Set `status: deprecated` when a decision is abandoned without a replacement.

## Index management

After creating or modifying any decision document, update `docs/decisions/INDEX.md`:

```markdown
# Decision Records

## ADRs

| ID | Title | Status | Date |
|----|-------|--------|------|
| [ADR-002](ADR-002-slug.md) | Title | Accepted | 2024-03-10 |
| [ADR-001](ADR-001-slug.md) | Title | Accepted | 2024-01-20 |

## RFCs

| ID | Title | Status | Date |
|----|-------|--------|------|
| [RFC-001](RFC-001-slug.md) | Title | Closed | 2024-01-15 |
```

Sort newest first within each section. If the index doesn't exist, create it.

## Writing guidance

These documents answer a future question: *"Why did we do it this way?"* The reader might be a new teammate, a future version of the author, or an AI agent analyzing the codebase to understand constraints before proposing changes.

- **Lead with context, not conclusions.** A reader who doesn't understand the problem can't evaluate the decision.
- **Be specific about what was rejected.** "We also considered Y but rejected it because Z" prevents the same debate from recurring.
- **Name the trade-offs honestly.** Every decision has downsides. Acknowledging them signals maturity and tells future readers when to revisit.
- **Keep it proportional.** A small decision gets a short ADR. Skip sections that don't apply. The template is a guide, not a bureaucratic checklist.
- **Write self-contained context.** Avoid statements like "as discussed in the meeting" without summarizing what was discussed. The document should stand on its own.
