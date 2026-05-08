---
name: ralph
description: Generate Ralph-style iterative automation for a PowerShell module. Creates a tracker, prompt file, and orchestrator script (scripts/{task}.ps1) that loops Claude, Copilot, or Codex CLI through work items one at a time. Use when asked to "run ralph", "set up ralph automation", "generate a ralph orchestrator", "create a work tracker for this module", "automate iterating on this module", "generate an AI automation loop", or "set up iterative module work". Supports --type (claude/copilot/codex), --model (opus/sonnet/haiku), --effort, --module, and --task flags. Do NOT use for just running tests (use pester-run) or writing a single feature (just do it directly).
---

# Ralph — PowerShell Module Automation Generator

Generate a Ralph Wiggum-style iterative automation for a generic PowerShell module. Each loop runs one tracker item, verifies it, updates evidence, commits, and stops.

Supports Claude CLI, GitHub Copilot CLI, and Codex CLI.

## Task

$ARGUMENTS

## Parameters

Parse these flags from `$ARGUMENTS` when present:

| Parameter | Values | Default |
|-----------|--------|---------|
| `--type` | `claude`, `copilot`, `codex` | `claude` |
| `--model` | `opus`, `sonnet`, `haiku`, or direct model ID | `opus` |
| `--effort` | `low`, `medium`, `high`, `max`, `xhigh` | `high` |
| `--module` | module name | inferred |
| `--task` | task slug | inferred |

Strip these flags before interpreting the task.

## Model Mapping

| Alias | Claude | Copilot | Codex |
|-------|--------|---------|-------|
| `opus` | `claude-opus-4-7` | `claude-opus-4.6` | `gpt-5.5` |
| `sonnet` | `claude-sonnet-4-6` | `claude-sonnet-4.6` | `gpt-5.4` |
| `haiku` | `claude-haiku-4-5` | `claude-haiku-4.5` | `gpt-5.4-mini` |
| `codex` | n/a | n/a | `gpt-5.5` |

Direct model IDs pass through unchanged.

Effort mapping:
- Claude: map `xhigh` to `max`.
- Copilot: map `max` to `xhigh`.
- Codex: map `max` to `xhigh`.

## Modes

### Wrap Existing Work

Use when there are uncommitted changes or an obvious recent commit pattern.

1. Inspect `git status`, `git diff`, and recent commits.
2. Infer the repeated task.
3. Create a tracker for continuing that work.
4. Generate the prompt and orchestrator.

### Full Planning

Use when the task describes a feature, bug fix, refactor, docs pass, test pass, or release-prep effort.

1. Inspect the module structure.
2. Create `docs/trackers/{TASK}-TRACKER.md`.
3. Add all work items as tracker rows.
4. Classify each row by model and effort.
5. Generate `scripts/{task}-prompt.md`.
6. Generate `scripts/{task}.ps1`.

## Tracker

Use this exact table shape:

| ID | Workstream | Scope | Status | Model | Effort | Reason | Evidence |
|----|-----------:|-------|--------|-------|--------|--------|----------|
| 1 | Commands | Add validation to Get-Thing | PENDING | sonnet | high | parameter validation | |

Allowed values:
- Status: `PENDING`, `DONE`, `NEEDS_WORK`, `BLOCKED`
- Model: `haiku`, `sonnet`, `opus`
- Effort: `low`, `medium`, `high`, `max`

## Triage

**Complexity:**
- Mechanical: rename, formatting, docs copy, simple manifest update.
- Moderate: command implementation, parameter validation, targeted tests.
- Architectural: public contract changes, shared helpers, import/export behavior, packaging, compatibility, or release behavior.

**Blast radius:**
- Low: one isolated file.
- Medium: command plus tests/docs or one helper used by a few commands.
- High: public command surface, module import behavior, manifest exports, CI, release packaging, security-sensitive execution.

**Mapping:**

| Complexity × Blast | Model | Effort |
|-------------------|-------|--------|
| Mechanical × Low | haiku | low |
| Mechanical × Medium | haiku | medium |
| Mechanical × High | sonnet | high |
| Moderate × Low | sonnet | low |
| Moderate × Medium | sonnet | high |
| Moderate × High | opus | high |
| Architectural × any | opus | max |

## Generated Prompt

Create `scripts/{task}-prompt.md` telling the agent to:

1. Open the tracker.
2. Pick the first `PENDING` row only.
3. Inspect relevant module files before editing.
4. Make the smallest complete change for that row.
5. Verify the change.
6. Update tracker status and evidence.
7. Commit the work.
8. End with the structured report below.

Include the PowerShell checks section verbatim.

## Generated Orchestrator

Create `scripts/{task}.ps1`:

```powershell
#!/usr/bin/env pwsh
param(
    [int]$MaxIterations = {ITEM_COUNT + 3},
    [ValidateSet('claude', 'copilot', 'codex')]
    [string]$Type = '{TYPE}',
    [string]$Model = '{MODEL}',
    [ValidateSet('low', 'medium', 'high', 'max', 'xhigh')]
    [string]$Effort = '{EFFORT}',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$TrackerPath = Join-Path $RepoRoot 'docs/trackers/{TASK}-TRACKER.md'
$PromptPath = Join-Path $RepoRoot 'scripts/{task}-prompt.md'

if ($Type -eq 'copilot') {
    $EngineBin = '/home/vscode/.local/bin/copilot'
} elseif ($Type -eq 'codex') {
    $EngineBin = 'codex'
} else {
    $EngineBin = 'claude'
}

function Get-PendingCount {
    $tracker = Get-Content $TrackerPath -Raw
    return ([regex]::Matches($tracker, '\| PENDING[\s|]')).Count
}

function Get-CompletedCount {
    $tracker = Get-Content $TrackerPath -Raw
    $done = ([regex]::Matches($tracker, '\| DONE[\s|]')).Count
    $needsWork = ([regex]::Matches($tracker, '\| NEEDS_WORK[\s|]')).Count
    $blocked = ([regex]::Matches($tracker, '\| BLOCKED[\s|]')).Count
    return $done + $needsWork + $blocked
}

function Resolve-ModelAlias {
    param([string]$Alias, [string]$EngineType)

    $claude = @{
        opus = 'claude-opus-4-7'
        sonnet = 'claude-sonnet-4-6'
        haiku = 'claude-haiku-4-5'
    }
    $copilot = @{
        opus = 'claude-opus-4.6'
        sonnet = 'claude-sonnet-4.6'
        haiku = 'claude-haiku-4.5'
    }
    $codex = @{
        opus = 'gpt-5.5'
        sonnet = 'gpt-5.4'
        haiku = 'gpt-5.4-mini'
        codex = 'gpt-5.5'
        'gpt-5.5' = 'gpt-5.5'
        'gpt-5.4' = 'gpt-5.4'
        'gpt-5.4-mini' = 'gpt-5.4-mini'
    }

    $map = switch ($EngineType) {
        copilot { $copilot }
        codex { $codex }
        default { $claude }
    }

    if ($map.ContainsKey($Alias)) { return $map[$Alias] }
    return $Alias
}

function Resolve-Effort {
    param([string]$Value, [string]$EngineType)

    if (($EngineType -eq 'copilot' -or $EngineType -eq 'codex') -and $Value -eq 'max') {
        return 'xhigh'
    }
    if ($EngineType -eq 'claude' -and $Value -eq 'xhigh') {
        return 'max'
    }
    return $Value
}

function Get-NextPendingItem {
    foreach ($line in Get-Content $TrackerPath) {
        if ($line -match '^\|\s*\d+\s*\|' -and $line -match '\|\s*PENDING\s*\|') {
            $cells = $line -split '\|' | ForEach-Object { $PSItem.Trim() }
            return @{
                Id = $cells[1]
                Model = $cells[5]
                Effort = $cells[6]
            }
        }
    }
    return $null
}

function Invoke-Iteration {
    param([int]$Iteration)

    $next = Get-NextPendingItem
    $modelAlias = if ($next -and $next.Model) { $next.Model } else { $Model }
    $effortAlias = if ($next -and $next.Effort) { $next.Effort } else { $Effort }
    $iterModel = Resolve-ModelAlias -Alias $modelAlias -EngineType $Type
    $iterEffort = Resolve-Effort -Value $effortAlias -EngineType $Type
    $prompt = Get-Content $PromptPath -Raw

    Write-Host ''
    Write-Host "Iteration $Iteration/$MaxIterations: item #$($next.Id), $Type, $iterModel, effort=$iterEffort" -ForegroundColor Cyan

    if ($Type -eq 'copilot') {
        $args = @('-p', $prompt, '--model', $iterModel, '--allow-all', '--reasoning-effort', $iterEffort)
    } elseif ($Type -eq 'codex') {
        $args = @('exec', '--model', $iterModel, '--config', "model_reasoning_effort=`"$iterEffort`"", '--dangerously-bypass-approvals-and-sandbox', $prompt)
    } else {
        $args = @('--dangerously-skip-permissions', '--no-session-persistence', '--model', $iterModel, '--effort', $iterEffort, '-p', $prompt)
    }

    if ($DryRun) {
        Write-Host "[DRY RUN] $EngineBin $($args -join ' ')" -ForegroundColor DarkGray
        return $true
    }

    & $EngineBin @args
    return $LASTEXITCODE -eq 0
}

$total = {ITEM_COUNT}
$iteration = 0
$stalled = 0

while ($iteration -lt $MaxIterations) {
    $iteration++
    $pending = Get-PendingCount
    $before = Get-CompletedCount

    if ($pending -eq 0) {
        Write-Host 'All items completed.' -ForegroundColor Green
        break
    }

    if (-not (Invoke-Iteration -Iteration $iteration)) {
        Write-Host 'Iteration failed.' -ForegroundColor Red
        exit 1
    }

    $after = Get-CompletedCount
    if ($after -le $before) {
        $stalled++
        Write-Host "No progress detected ($stalled/3)." -ForegroundColor Yellow
        if ($stalled -ge 3) { exit 1 }
    } else {
        $stalled = 0
        Write-Host "Progress: $before -> $after / $total" -ForegroundColor Green
    }
}
```

## PowerShell Checks

Include this section in every generated prompt:

```
Open the tracker and pick the first PENDING row. Work only that row.

Before editing:
- Find the manifest (*.psd1).
- Find the module entry point (*.psm1).
- Find public commands, private helpers, tests, and docs.
- Follow the existing layout.

After editing:
- Run the tests: `.\build.ps1 -Task Test -OutputFormat Quiet`
  - Errors will be show in ErrorMessage object.
  - Success is indicated by zero exit code and the result object show Success as True.
- Verify parameters are typed and validated.
- Verify mutating commands use SupportsShouldProcess when appropriate.
- Verify help/docs/examples are updated when public behavior changes.
- Re-read every modified file.
- Update tracker evidence.
- Commit the item.
```

## Structured Report

Every iteration must end with:

```
ITEM: [tracker item]
STATUS: DONE | BLOCKED [reason]
FILES_MODIFIED: [files]
FILES_READ_BACK: yes | no [reason]
MODULE_IMPORT: PASS | FAIL | N/A [command]
TESTS: PASS | FAIL | N/A [counts]
ANALYZER: PASS | FAIL | N/A
HELP: UPDATED | UNCHANGED | N/A
COMMIT: [hash or reason]
```

## User Response

After generating files, report only:

- Mode used.
- Tracker path.
- Prompt path.
- Orchestrator path.
- Item count and max iterations.
- Run command.
