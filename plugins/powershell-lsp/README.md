# powershell-lsp

A marketplace plugin that wires [PowerShellEditorServices (PSES)](https://github.com/PowerShell/PowerShellEditorServices) — the language server behind VS Code's PowerShell extension — into Claude Code and oh-my-pi.

## What it adds

Once installed, the `LSP` tool works on `.ps1`, `.psm1`, and `.psd1` files for these operations:

- `goToDefinition` — jump to a function or variable definition
- `findReferences` — find every call site of a function
- `hover` — type / help-comment for a symbol
- `documentSymbol` — outline of functions, classes, regions in a file
- `workspaceSymbol` — search for a symbol name across the workspace
- `goToImplementation`, `prepareCallHierarchy`, `incomingCalls`, `outgoingCalls`

Without this plugin, language-server calls on PowerShell files return *"no language server configured"* and the agent falls back to grep-style text search.

## Prerequisites

- **PowerShell 7+** on `PATH` as `pwsh` (Windows, macOS, Linux)
- **Internet access on first launch** — PSES is downloaded from GitHub releases (~20 MB) and cached locally

PSES is **not distributed via PSGallery**. The launcher pulls `PowerShellEditorServices.zip` from <https://github.com/PowerShell/PowerShellEditorServices/releases> and extracts it into a per-user cache directory. No admin rights required, no global module install.

The pinned version is **v4.5.0** (override with `-PsesVersion` or `$env:CLAUDE_PSES_VERSION`).

## Installation

```text
/plugin marketplace add HeyItsGilbert/marketplace
/plugin install powershell-lsp@my-plugins
```

Restart Claude Code. The first PowerShell file you touch will trigger a one-time PSES download (~5–10s on a fast link). Subsequent launches start in ~2–3s.

oh-my-pi reads `.lsp.json` from the installed plugin root and starts the cached `scripts/start-pses-lsp.ps1` with `-Command` from `$HOME/.omp/plugins/cache/plugins`. It does not read `.claude-plugin/plugin.json` `lspServers`, and it does not expand `${CLAUDE_PLUGIN_ROOT}`. The server attaches only when the session directory contains `.git` or a `.ps1` / `.psm1` / `.psd1` file, and `pwsh` is on `PATH`. Restart omp after upgrading the plugin. An XDG-migrated omp data root is not searched.

## Verify it's working

Open a session in any repo with `.psm1` files and run:

```text
LSP({operation: "documentSymbol", filePath: "<some-module>.psm1", line: 1, character: 1})
```

You should get back a list of symbols (functions, classes), not an error.

## Architecture

The launcher branches by platform:

### Windows

PSES + raw stdio doesn't work on Windows under Claude Code's `child_process.spawn` redirection: PowerShell wraps the redirected stdio handles in its own buffered host-I/O abstraction, but PSES (a .NET module loaded into the pwsh AppDomain) uses `Console.OpenStandardOutput()` directly and bypasses that wrapper. The two views of stdio don't see the same bytes.

This plugin uses the same workaround as VS Code's PowerShell extension: **named-pipe transport** for PSES, with a small **stdio-to-named-pipe proxy** that bridges the two:

```text
Claude Code  ──stdio──►  start-pses-lsp.ps1  ──spawns──►  pwsh + PSES
                              │                                │
                              └────── named pipe ──────────────┘
```

The proxy grabs raw `Console.OpenStandardInput()` / `Console.OpenStandardOutput()` immediately at startup before PowerShell can wrap them, then shuttles bytes between Claude Code's stdio and PSES's named pipe via `Stream.CopyToAsync`.

### Linux / macOS

PowerShell's stdio handling on non-Windows doesn't have the host-I/O wrapping issue, so the launcher invokes PSES directly with `-Stdio` — same pattern as the upstream Emacs/Vim integrations:

```text
Claude Code  ──stdio──►  start-pses-lsp.ps1  ──&──►  PSES
```

> **Note:** The non-Windows path is not end-to-end tested in Claude Code as of v1.1.0. If you hit issues on Linux/macOS, please file an issue with `claude --debug` output and we'll add a verification step.

For the full investigation history (every Windows variant tried, why each failed, binary-source evidence from `claude.exe`), see [`docs/INVESTIGATION.md`](docs/INVESTIGATION.md).

## Cache location

| OS | Path |
|---|---|
| Windows | `%LOCALAPPDATA%\claude-code-powershell-lsp\<version>\` |
| macOS / Linux | `${XDG_CACHE_HOME:-$HOME/.cache}/claude-code-powershell-lsp/<version>/` |

To force a re-download, delete the version folder and restart Claude Code.

## Pinning a different PSES version

Set an environment variable before launching Claude Code:

```powershell
$env:CLAUDE_PSES_VERSION = '4.4.0'
```

Available versions: <https://github.com/PowerShell/PowerShellEditorServices/releases>.
Use a PSES release version without the GitHub tag prefix, for example `4.5.0` or
`4.5.0-preview.1`; paths and other non-release values are rejected.
A version override is accepted only when the GitHub Releases API supplies its
SHA-256 digest (or the version has a bundled fallback hash); the launcher never
extracts an archive without a trusted hash.

## Troubleshooting

**PSES log:** `$env:TEMP/pses-claude-lsp.log/StartEditorServices-<PID>.log` (PSES creates a sub-directory for its own log files).

**Proxy log:** Status messages from the proxy (e.g., `[powershell-lsp] Starting PSES on named pipe ...`) appear in Claude Code's debug output (`claude --debug`) prefixed `[LSP SERVER plugin:powershell-lsp:powershell]`.

**Download fails (firewall / proxy):**

1. Manually download `PowerShellEditorServices.zip` from <https://github.com/PowerShell/PowerShellEditorServices/releases/tag/v4.5.0>
2. Extract into the cache directory above so that `PowerShellEditorServices/Start-EditorServices.ps1` exists
3. Restart Claude Code — it'll find the cached copy and skip the download

**`pwsh` not found:** install PowerShell 7+ from <https://github.com/PowerShell/PowerShell/releases>. Windows PowerShell 5.1 (`powershell.exe`) is **not** supported.

**LSP calls hang or return "no LSP server available":**

1. Check `claude --debug` output for `[powershell-lsp]` lines from the proxy
2. Check `Get-Content "$env:TEMP\pses-claude-lsp.log\*" -Tail 50` for PSES bootstrap output
3. The investigation log (`docs/INVESTIGATION.md`) has a "Decision tree" section pointing each failure mode at its likely cause
