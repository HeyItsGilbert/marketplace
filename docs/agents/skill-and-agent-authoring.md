# Skill and Agent Authoring Standard

This is the authoritative standard for the skills and agents published by this marketplace. It applies to the eight active skills, their disclosed references, and the eight agents in scope for the audit. It implements the predictability rubric in `/writing-great-skills`.

## Invocation and descriptions

Choose a skill's invocation deliberately:

- A model-invoked skill has a `description` and earns its permanent context load only when the agent must autonomously discover the work or another skill must invoke it.
- A user-invoked skill sets `disable-model-invocation: true`; its description is a one-line human-facing summary, not a trigger list. It has no autonomous or skill-to-skill reach.
- Add a user-invoked router only when the cognitive load of remembering the reference skills warrants one.

For every model-invoked skill and agent, its description:

- begins with the distinct, recognizable leading word for the work;
- states one representative trigger for each materially distinct branch;
- includes a `when another skill needs …` clause only when that autonomous reach is required; and
- omits synonyms, examples, identity, mechanics, implementation detail, and rules owned by the body.

Do not add `Not for X (use Y)` routing exclusions by default. Retain one only when measured evidence shows a high-cost ambiguity that cannot be removed with a positive trigger, a rename, or a better granularity cut; name the positive route alongside it.

## Active skill policy

The following invocation decisions are part of this standard:

| Skill | Invocation | Rationale |
| --- | --- | --- |
| `release` | Model-invoked | Releases are a narrow, high-salience autonomous outcome. |
| `copy-edit` | Model-invoked | It is the standing voice policy for drafting and editing requests. |
| `pester-run` | Model-invoked | Running Pester is an autonomous PowerShell action. |
| `pester-write` | Model-invoked | Writing Pester tests is an autonomous PowerShell action. |
| `pester-review` | Model-invoked | Reviewing Pester tests is an autonomous PowerShell action. |
| `pester-patterns` | User-invoked | It is a deliberate recipe/reference lookup; it may link to `pester-run`. |
| `death-by-ppt` | User-invoked | It is a specialized presentation-review reference. |
| `og-image-design` | User-invoked | It is a specialized image-design reference. |

No router is warranted for the three user-invoked reference skills.

## Bodies and references

A skill body contains ordered steps and reference material. Put each at the lowest useful level of the information hierarchy:

1. Keep only the ordered actions that every relevant run needs as in-skill steps. Give each step a clear, checkable completion criterion; where coverage matters, make the criterion exhaustive.
2. Keep shared, immediately-needed definitions, rules, and caveats together as in-skill reference.
3. Disclose conditional, bulky, or template-like reference into a clearly named sibling file. Its context pointer must state exactly when the agent should load it.

Use branches to choose the cut: inline material every branch needs, and disclose material needed by only some branches. Strengthen an unreliable context pointer before moving required material back inline. Keep a meaning in one authoritative location; move duplicated shared procedures or rules to their correct shared home.

Split a skill only when it earns a distinct autonomous leading word or when isolating a sequence prevents visible post-completion steps from causing premature completion. Do not merge a sequence if exposing its later steps would reintroduce that failure. Do not split merely to partition a topic.

## Steering and pruning

Write positive, behavior-changing instructions. Replace a prohibition with its positive target unless the prohibition is an irreducible hard guardrail; then pair it with the required behavior. Use an existing leading word where it compresses a repeated behavioral idea.

Before publishing, assess every sentence for relevance and the no-op test: retain it only if it bears on the skill and changes model behavior from the default. Remove sediment rather than rewriting it. Descriptions, bodies, references, and agent configurations each have one source of truth for their meaning.

## Agents

Every model-invoked agent follows the same description rules as a model-invoked skill. Its description contains only its distinct trigger branches. Do not put persona, team-routing boilerplate, or embedded example dialogues in that always-loaded field; put team-level routing in the orchestrating command or body.

Keep `model`, `effort`, and `tools` only when they change runtime behavior. Do not declare `skills:` by default: it preloads full skill bodies. Use it only for an explicit, documented requirement of the agent's autonomous work, and do not repeat that preloaded tactical guidance in the agent body.

## Published-interface changes

Published skill names, commands, and autonomous reach are interfaces. Removing, renaming, merging a skill, or changing it from model-invoked to user-invoked is a breaking change. Description pruning is not breaking when it only removes duplication or corrects an over-broad trigger without withdrawing a distinct supported outcome.

For each breaking plugin change:

1. make a major version cut in that plugin's `plugin.json`;
2. document the old-to-new invocation and rationale in a prominent `Removed` or `Changed` entry in that plugin's `CHANGELOG`; and
3. update the README catalog when its documented interface changes.

Whole-plugin retirement is the exception: remove the marketplace entry and plugin source rather than publishing a no-op tombstone. Preserve the old-to-new guidance and rationale in a discoverable repository-level retirement record and the marketplace README; state that already-installed versions are cached copies and receive no automatic migration notice.

Do not add undocumented aliases or duplicate skills as a compatibility window. Marketplace `renames` applies only when the marketplace plugin entry itself is renamed and must be documented separately.

## Audit verdict format

For each skill, disclosed reference, or agent, record one verdict against this standard:

- **Keep** — conforms; state the evidence briefly.
- **Change** — list each required change by standard section and why it fails the current rule.
- **Breaking change** — list the required change plus the major-version, changelog, and README obligations.
- **Retire** — state why it is beyond the active audit surface; do not issue a conformance verdict.

A verdict may include a structural recommendation only when it identifies the independent leading word, premature-completion boundary, or interface impact that justifies it. Each required change must name its authoritative destination so the rewrite has one source of truth.
