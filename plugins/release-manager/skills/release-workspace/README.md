# Release Skill — Eval Workspace

Test cases, benchmarks, and grading results for the `release` skill.
Used with the `skill-creator` plugin to evaluate and iterate on skill
quality.

## Structure

```
release-workspace/
├── evals/
│   └── evals.json              # Test cases with assertions
├── eval_set.json               # Trigger eval queries (description optimization)
├── trigger-eval.json           # Original draft of trigger queries
├── test-repos/                 # Source repos cloned per-run
│   ├── node-mid-lifecycle/     # Node.js, v1.2.0, conventional commits
│   ├── powershell-first/       # PowerShell, v0.0.1, no changelog
│   └── ambiguous-commits/      # Node.js, v2.1.0.0, vague commit messages
├── iteration-1/                # First eval run
│   ├── <eval-name>/
│   │   ├── eval_metadata.json  # Assertions for this eval
│   │   ├── with_skill/
│   │   │   ├── outputs/        # CHANGELOG.md, manifest produced
│   │   │   ├── grading.json    # Pass/fail per assertion
│   │   │   └── timing.json     # Tokens and duration
│   │   └── without_skill/      # Baseline (same structure)
│   ├── benchmark.json          # Aggregated results
│   └── feedback.json           # User review feedback
└── iteration-2/                # Second eval run (same structure)
```

## Test Cases

| ID | Name | Scenario | Key assertions |
|----|------|----------|----------------|
| 1 | node-mid-lifecycle | Node.js project, v1.2.0, 4 conventional commits | 1.3.0 MINOR bump, Added+Fixed categories, comparison links |
| 2 | powershell-first-release | PowerShell module, v0.0.1, no changelog | Creates CHANGELOG, bumps to 1.0.0, updates .psd1 |
| 3 | ambiguous-commits-node | Node.js, v2.1.0.0, vague commit messages | Normalizes to semver, reads diffs for MINOR, no user prompt |

## Running Evals

### Prerequisites

- The `skill-creator` plugin installed at the standard marketplace path
- `anthropic` Python package (`python -m pip install anthropic`)

### Re-running test cases

1. Clone the test repos into a new iteration directory:
   ```bash
   REPOS="plugins/release-manager/skills/release-workspace/test-repos"
   ITER="plugins/release-manager/skills/release-workspace/iteration-N"
   for eval in node-mid-lifecycle powershell-first-release ambiguous-commits-node; do
     mkdir -p "$ITER/$eval-name/with_skill/outputs"
     mkdir -p "$ITER/$eval-name/without_skill/outputs"
   done
   ```
   Clone each test repo into `with_skill/repo/` and `without_skill/repo/`,
   then set `git config user.email` and `user.name` on each clone.

2. Spawn subagents (with-skill and baseline) for each eval using the
   prompts from `evals/evals.json`. Point with-skill agents at
   `plugins/release-manager/skills/release/SKILL.md`.

3. Grade outputs against `eval_metadata.json` assertions.

4. Build `benchmark.json` (manually or via `scripts.aggregate_benchmark`).

5. Generate the review viewer:
   ```bash
   python eval-viewer/generate_review.py <iteration-dir> \
     --skill-name release \
     --benchmark <iteration-dir>/benchmark.json \
     --previous-workspace <previous-iteration-dir> \
     --static <iteration-dir>/review.html
   ```

### Trigger eval (description optimization)

`eval_set.json` contains 19 queries (9 should-trigger, 10 should-not)
for testing whether the skill description causes correct activation.
Run via:
```bash
python -m scripts.run_loop \
  --eval-set eval_set.json \
  --skill-path <path-to-skill> \
  --model <model-id> \
  --max-iterations 5 --verbose
```

Note: On Windows, `run_loop.py` may fail with socket errors. In that
case, optimize the description manually using the eval queries as
reference.

## Results Summary

### Iteration 1
- Eval 2 regression: skill chose 0.1.0 instead of 1.0.0
- Eval 3 win: skill normalized 2.1.0.0 to 2.2.0

### Iteration 2 (after fix)
- All evals passing (excluding sandbox-blocked commit assertion)
- Eval 2 fixed: skill now correctly chooses 1.0.0
- Eval 3 consistent: semver normalization working
