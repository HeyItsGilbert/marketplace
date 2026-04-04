---
name: rfc
description: Create and manage Requests for Comments (RFCs) — structured proposals committed to the repo that open a decision for discussion before committing to an approach. Use this skill when the user wants to write an RFC, propose a significant change for review, open a design discussion, or draft a technical proposal. Also activate when the user says things like "I want to propose", "we need to discuss before deciding", "let's get feedback on this approach", "write up a proposal", "request for comments", "design proposal", "technical proposal", or "I want input from the team on". PROACTIVELY suggest an RFC when the user is debating a large change that affects multiple consumers, teams, or system boundaries — especially migrations, breaking API changes, new system architecture, or choosing between competing approaches where structured discussion would help. Do NOT use for: decisions already made (use /adr instead), small choices that don't need group input, general documentation, or post-mortems.
allowed-tools: Bash(git log *), Bash(git diff *)
---

# Requests for Comments (RFCs)

Create structured proposals that open a significant decision for discussion before the team commits to an approach. RFCs live in the repo alongside ADRs so the full decision lifecycle — proposal, debate, outcome — is captured in version control.

An RFC answers: *"Here's a problem, here's what I think we should do about it, and here's what I want your input on."*

When the RFC concludes, it should be converted to an ADR (use `/adr`) to record the final decision. Both documents are kept — the RFC preserves the reasoning and alternatives explored; the ADR is the authoritative record.

## When to suggest an RFC

An RFC is the right tool when a decision is **significant enough to benefit from structured input** before committing. Signals:

- Multiple valid approaches exist and trade-offs aren't obvious
- The change affects consumers, other teams, or system boundaries
- A migration or breaking change is being proposed
- The author wants buy-in before investing in implementation
- Someone says "I'm not sure which way to go" on a non-trivial question

If consensus already exists or the decision is small, an ADR (without a preceding RFC) is usually sufficient.

## Directory structure and numbering

RFCs live in `docs/decisions/` alongside ADRs:

```
docs/decisions/
  INDEX.md
  RFC-001-auth-strategy.md
  RFC-002-api-versioning.md
  ADR-001-use-react-hooks.md
```

**File naming:** `RFC-{NNN}-{slug}.md` — zero-padded 3-digit ID, kebab-case slug from the title.

**Auto-incrementing:** Scan `docs/decisions/` for existing `RFC-*.md` files, find the highest number, use the next one. If the directory doesn't exist, create it and start at 001.

## RFC template

```markdown
---
id: RFC-{NNN}
title: "{Title}"
status: draft | open | closed | withdrawn
date: {YYYY-MM-DD}
author: {name}
related: []
tags: []
---

# RFC-{NNN}: {Title}

## Summary

A one-paragraph elevator pitch: what is being proposed and why it matters.
Someone skimming the index should be able to decide whether to read further
based on this summary alone.

## Problem statement

What problem does this solve? Why does it need solving now? Describe the
forces at play — technical limitations, user pain points, scaling concerns,
business requirements. Include enough context that someone unfamiliar with
the codebase understands the motivation without reading source code.

## Goals and non-goals

**Goals:**
- What this proposal aims to achieve

**Non-goals:**
- What is explicitly out of scope — this prevents scope creep and
  clarifies boundaries for reviewers

## Proposed solution

Describe the recommended approach. Be specific about the choices and
trade-offs that matter for the decision, but don't write a full design
spec — focus on *why this approach* over the alternatives.

Include enough technical detail that reviewers can evaluate feasibility,
but defer implementation minutiae to the actual work.

## Alternatives considered

### {Alternative A}

What it is, why it was considered, and what made it less attractive than
the proposed solution. Be fair — if an alternative is genuinely close,
say so.

### {Alternative B}

Same treatment. The goal is to show that the design space was explored,
not just to justify a foregone conclusion.

## Risks and trade-offs

What could go wrong? What are we giving up? Be honest — reviewers trust
RFCs that name their own weaknesses. Include mitigation strategies where
possible.

## Rollout plan

How would this be implemented and adopted? Consider:
- Can it be done incrementally or does it require a big-bang migration?
- What's the rough sequence of work?
- Are there dependencies or prerequisites?
- How will we know it's working? (metrics, tests, user feedback)

This section can be brief for early-stage proposals and expanded as the
RFC matures.

## Open questions

- [ ] {Question that needs input from reviewers}
- [ ] {Unresolved technical detail}
- [ ] {Organizational or process question}

## Resolution

_To be filled in when this RFC is closed._

**Decision:** {what was decided}
**Date:** {when}
**ADR:** [ADR-{NNN}](ADR-{NNN}-slug.md)
```

### Section guidance

| Section | Required? | Notes |
|---------|-----------|-------|
| Summary | Yes | Keep it to one paragraph |
| Problem statement | Yes | The foundation — if this isn't clear, nothing else matters |
| Goals and non-goals | Recommended | Especially valuable for large or ambiguous proposals |
| Proposed solution | Yes | The core of the RFC |
| Alternatives considered | Yes | At least one alternative, even if it's "do nothing" |
| Risks and trade-offs | Recommended | Builds trust, surfaces concerns early |
| Rollout plan | Optional | More important for migrations and breaking changes |
| Open questions | Yes | Even if just one — signals this is genuinely open for input |
| Resolution | Filled later | Left blank until the RFC concludes |

## RFC lifecycle

```
draft → open → closed (decision made) → ADR created
                  └→ withdrawn (abandoned, no decision)
```

- **Draft:** Author is still writing, not ready for review.
- **Open:** Published for discussion. Update the `status` field and share with reviewers.
- **Closed:** A decision has been reached. Fill in the Resolution section and create an ADR via `/adr`.
- **Withdrawn:** The proposal was abandoned — document why briefly in the Resolution section so future readers know it was a deliberate choice, not an oversight.

## Converting an RFC to an ADR

When an RFC reaches a conclusion:

1. Update the RFC's `status` to `closed`
2. Fill in the **Resolution** section with the decision, date, and link to the new ADR
3. Create a new ADR (use `/adr`) — pull context and alternatives from the RFC rather than rewriting from scratch
4. Cross-reference: the ADR's `related` field includes the RFC ID; the RFC's resolution links to the ADR
5. Keep both documents — the RFC preserves discussion history; the ADR is the authoritative outcome

## Index management

After creating or modifying an RFC, update the RFCs table in `docs/decisions/INDEX.md`. If the index doesn't exist, create it. Sort newest first.

## Writing guidance

An RFC is an invitation to think together, not a decree. Write it to be challenged.

- **Frame the problem before the solution.** If reviewers don't agree there's a problem, they won't engage with the proposal constructively.
- **Steel-man the alternatives.** Presenting weak alternatives makes the RFC look like a rubber stamp. If an alternative is genuinely close, say so — it invites useful discussion about the margin.
- **Name what you don't know.** Open questions aren't a sign of weakness. They're the whole point — you're asking for input because the decision is genuinely hard.
- **Keep the scope proportional.** A focused RFC with clear boundaries gets better feedback than an expansive one that tries to solve everything at once.
- **Write for the skeptical reviewer.** Assume the reader's first instinct is "why can't we just keep doing what we're doing?" Answer that in the problem statement.
