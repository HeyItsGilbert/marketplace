---
description: "Seven-perspective code review: Jordan B., Sage, Brent, Chip, DualCore, Shawn Wee!-ler, and Glenn review your PR diff in parallel"
argument-hint: "[base-branch] — defaults to main"
allowed-tools: ["Agent", "PowerShell", "Bash", "Glob", "Grep", "Read"]
---

# Team Code Review

Run a seven-perspective code review of the current branch's changes. Each reviewer has a distinct name, personality, and area of expertise.

## The Team

| Agent | Reviewer | Focus |
|---|---|---|
| `code-review-team:staff-swe` | **Jordan B.** | Best practices, error handling, production-readiness |
| `code-review-team:architect` | **Sage Nakamura** | Architecture, module boundaries, system impact |
| `code-review-team:nitpicker` | **Brent Tlackburn** | PSScriptAnalyzer, syntax, style, consistency |
| `code-review-team:junior` | **Chip Torres** | Readability, confusion, "can I follow this?" |
| `code-review-team:grey-hat` | **DualCore** | Security vulnerabilities, attack surfaces |
| `code-review-team:docs-reviewer` | **Shawn Wee!-ler** | Comment-based help, README accuracy, examples |
| `code-review-team:test-strategist` | **Glenn** | Test quality, coverage gaps, testability, testing strategy |

## Workflow

1. **Determine the base branch**:
   - If `$ARGUMENTS` is provided, use it as the base branch
   - Otherwise, detect the default branch: try `main`, then fall back to `master`

2. **Gather the diff** using PowerShell:
   ```powershell
   git diff <base-branch>...HEAD
   git diff <base-branch>...HEAD --name-only --stat
   ```

3. **If the diff is empty**, tell the user there are no changes to review and stop.

4. **Launch all 7 agents in parallel** using the Agent tool in a single message with 7 Agent tool calls:
   - Pass each agent the full diff output and the list of changed files
   - Each agent reviews from their unique perspective and speaks in character
   - The nitpicker (Brent) will run PSScriptAnalyzer via PowerShell — that's expected
   - All agents can use Read, Glob, and Grep to explore surrounding context

5. **Present results**: After all agents return, show each reviewer's findings under a header with their name and role. Add a brief overall verdict at the end.

## Output Format

```
---

### Jordan B. — Staff SWE
[Jordan's findings]

---

### Sage Nakamura — Architect
[Sage's findings]

---

### Brent Tlackburn — Nitpicker
[Brent's findings]

---

### Chip Torres — Junior Dev
[Chip's findings]

---

### DualCore — Grey Hat
[DualCore's findings]

---

### Shawn Wee!-ler — Docs Reviewer
[Shawn's findings]

---

### Glenn — Test Strategist
[Glenn's findings]

---

## Verdict
[1-2 sentence overall assessment highlighting the most critical findings across all reviewers. If any reviewer recommends a pr-review-toolkit agent for deeper analysis, mention it here.]
```

## Notes

- If the diff is very large (100+ files), focus agents on the most impactful changes and note which files were excluded.
- Let each reviewer speak fully in character — the personality is intentional.
- If any reviewer recommends a `pr-review-toolkit` agent for deeper analysis, surface that in the verdict.
