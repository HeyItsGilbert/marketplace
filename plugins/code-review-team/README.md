# Code Review Team

A Claude Code plugin that reviews code from seven distinct engineering perspectives, each with a named personality.

## The Team

| Reviewer | Agent | Model | Focus |
|---|---|---|---|
| **Jordan B.** | `code-review-team:staff-swe` | Opus | Best practices, error handling, naming, testability, production-readiness |
| **Sage Nakamura** | `code-review-team:architect` | Opus | Module boundaries, coupling, API design, breaking changes, system impact |
| **Brent Tlackburn** | `code-review-team:nitpicker` | Inherit | PSScriptAnalyzer, naming conventions, formatting, code suggestions |
| **Chip Torres** | `code-review-team:junior` | Inherit | Readability, confusion, magic values, "can I debug this at 2 AM?" |
| **DualCore** | `code-review-team:grey-hat` | Opus | Injection, secrets, privilege escalation, insecure defaults, OWASP |
| **Shawn Wee!-ler** | `code-review-team:docs-reviewer` | Inherit | Comment-based help, README accuracy, parameter docs, examples |
| **Glenn** | `code-review-team:test-strategist` | Sonnet | Test quality, coverage gaps, testability, testing pyramid alignment |

## Usage

### Full team review (all 7 in parallel)

```
/team-review              # diffs against main
/team-review develop      # diffs against a specific branch
```

### Individual agents

Invoke any reviewer solo via the Agent tool:

```
Agent(subagent_type="code-review-team:staff-swe", prompt="Review this diff: ...")
Agent(subagent_type="code-review-team:grey-hat", prompt="Security review: ...")
Agent(subagent_type="code-review-team:test-strategist", prompt="Review test strategy: ...")
```

## PSScriptAnalyzer Integration

Brent (the nitpicker) automatically runs `Invoke-ScriptAnalyzer` on changed PowerShell files. It looks for `PSScriptAnalyzerSettings.psd1` in the repo root and falls back to the default ruleset. Tesla custom rules from `TeslaPowerShellStyle` are supported when the module is installed.

## Relationship to pr-review-toolkit

This plugin is independent from `pr-review-toolkit`. The reviewers may recommend pr-review-toolkit agents when deeper analysis would help:

- `pr-review-toolkit:type-design-analyzer` — when Sage spots type design concerns
- `pr-review-toolkit:silent-failure-hunter` — when DualCore spots error handling that could mask security issues

## Relationship to pester-testing

Glenn's testing perspective complements the `pester-testing` plugin. Glenn focuses on strategic test quality during code review (are the right things tested? are the tests good?), while pester-testing provides tactical skills for writing, reviewing, and running Pester 5 tests.
