# Changelog
<!-- markdownlint-disable MD024 -->

All notable changes to the **powershell-lsp** plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.0] - 2026-10-02

### Changed

- Published as an open-source plugin in HeyItsGilbert/marketplace. Install with `/plugin marketplace add HeyItsGilbert/marketplace` then `/plugin install powershell-lsp@my-plugins`.
- oh-my-pi cache lookup matches `my-plugins___powershell-lsp___*` instead of a private marketplace id.

### Removed

- Private marketplace install URL and organization-specific notes.

## [1.3.0] - 2026-09-25

### Added

- Register PowerShellEditorServices with oh-my-pi via plugin-root `.lsp.json`. omp does not read Claude Code `plugin.json` `lspServers`. The command starts the installed launcher with `-Command` from `$HOME/.omp/plugins/cache/plugins`, because omp spawns with the project cwd and `-File` consumes LSP stdin. `$HOME` is set on Windows, macOS, and Linux; `$env:USERPROFILE` is not.

## [1.2.1] - 2026-04-30

### Fixed

- Hash verification now fetches the upstream-authoritative SHA-256 from the **GitHub Releases API** (`/repos/PowerShell/PowerShellEditorServices/releases/tags/v<ver>`, `assets[].digest` field) instead of relying solely on a hardcoded fallback table. This means:
  - **Any** PSES version is verified, including user-supplied `-PsesVersion` overrides — no more "WARNING: no pinned hash" path for non-default versions, as long as GitHub is reachable.
  - The trust anchor is GitHub's server-computed digest, not a hash we copied at plugin release time. Tracks upstream automatically.
  - The hardcoded `$FallbackHashes` table is preserved but downgraded to a fallback used only when the GitHub API is unreachable (offline, rate-limited, etc.).
  - Mismatch error messages now identify whether the expected hash came from GitHub or the fallback table, for forensics.

## [1.2.0] - 2026-04-30

### Added

- SHA-256 verification of the PSES download against a pinned hash table (`$ExpectedHashes`). Fail-closed: if the hash doesn't match, refuse to extract, preserve the bad zip for inspection, and surface a detailed error showing expected vs actual hash and the source URL. Defends against compromised/replaced GitHub release artifacts, MITM, mirror corruption, and partial downloads. Pinned hash for v4.5.0: `A4E2988328963D4EE6008A68A39484D7DE2F9698ED1EC264A344566FDAA6464E`.
- For PSES versions outside the pinned hash table (i.e. user-supplied `-PsesVersion` overrides), the launcher logs a WARNING and prints the computed SHA-256 so the operator can capture and pin it themselves.

### Changed

- Cleaner cleanup semantics on bootstrap failure: install directory is removed atomically on any error (download, hash mismatch, extract); temp zip is removed unless flagged for preservation (hash mismatch only).

## [1.1.1] - 2026-04-30

### Fixed

- Deleted `scripts/test-stdio.ps1`, `scripts/test-stdio-direct.ps1`, `scripts/test-stdio-piebald.ps1`, `scripts/socket-probe.ps1`, and `docs/SOCKET-PROBE-PLAN.md` — diagnostic harnesses from the original investigation that added clutter for users who never need them.
- Before deleting those harnesses, preserved their reproducible patterns (LSP frame construction, `Process.Start` redirection gotchas, the socket-probe approach) in a new "Appendix — reproducing the diagnostic experiments" section of `docs/INVESTIGATION.md`, so the cleanup loses no knowledge. A future maintainer who needs to redo any experiment can rebuild the script from the appendix in under 20 minutes.

## [1.1.0] - 2026-04-30

### Added

- Cross-platform branch in `scripts/start-pses-lsp.ps1`: on Linux/macOS, invoke PSES directly via stdio (no proxy needed). PowerShell's host-I/O wrapping issue that necessitates the named-pipe proxy on Windows doesn't apply on non-Windows platforms (the canonical Emacs/Vim PSES integration tests are Linux-authored and use plain stdio). On Windows, named-pipe proxy path remains unchanged from v1.0.8.
- **Note:** The non-Windows path is not end-to-end tested in Claude Code as of this release. The rationale is upstream evidence: PSES's own `test/emacs-simple-test.el` uses raw stdio successfully on Linux. If a Linux/macOS user discovers it doesn't work, please file an issue with `claude --debug` output.

## [1.0.8] - 2026-04-30

### Fixed

- Pass a **bare pipe name** to PSES's `-LanguageServicePipeName` instead of the full `\\.\pipe\<name>` form. .NET's `NamedPipeServerStream` takes just the name; the OS adds `\\.\pipe\` automatically. Passing the full path caused PSES to create a double-prefixed pipe (`\\.\pipe\\\.\pipe\<name>`) that the client couldn't reach, producing the v1.0.7 *"Failed to connect to PSES named pipe within 30s"* error.
- Read the **actual** pipe name from PSES's session details JSON file before connecting, instead of assuming our requested name was used. PSES may report the path in `\\.\pipe\<name>` form, which we strip back to a bare name for `NamedPipeClientStream`. Robust to PSES version drift in field naming and prefix conventions.

## [1.0.7] - 2026-04-30

### Fixed

- **The actual fix.** Refactored `scripts/start-pses-lsp.ps1` from "wrap PSES in stdio" to **"stdio-to-named-pipe proxy"**. Background: binary inspection of Claude Code 2.1.121 (`createLSPClient` function in `~/.local/bin/claude.exe`) confirmed that `transport: "socket"` is in the schema but **not implemented in the runtime** — every LSP server is spawned with `stdio: ["pipe", "pipe", "pipe"]`. Combined with the well-known PowerShell-wraps-redirected-stdio quirk on Windows, this made plain stdio invocation of PSES fundamentally non-viable. The new proxy: (a) grabs raw `Console.OpenStandardInput()` / `Console.OpenStandardOutput()` immediately at startup before PowerShell can wrap them in cmdlet machinery, (b) spawns PSES in a separate pwsh child with `-LanguageServicePipeName \\.\pipe\<random>` (PSES's preferred Windows transport, used by VS Code's PowerShell extension), (c) connects via `NamedPipeClientStream` and bridges bytes both directions with `Stream.CopyToAsync`. Status messages still go to stderr only.
- Deleted `transport: "socket"` from `lspServers.powershell` — confirmed via binary inspection that the field is in the schema but never read by the runtime; setting it is a no-op that defaults to stdio anyway.
- Unwired the probe build files (`scripts/socket-probe.ps1`, `docs/SOCKET-PROBE-PLAN.md`) from `plugin.json` — retained in the repo for reference in case future Claude Code versions implement socket transport. (These files were removed entirely in 1.1.1, after their reproducible patterns were preserved in `docs/INVESTIGATION.md`.)

## [1.0.6] - 2026-04-30

### Fixed

- Replaced the non-working PSES launcher with `scripts/socket-probe.ps1`, a diagnostic probe used to reverse-engineer Claude Code's `transport: "socket"` semantics. **Not functional as a language server** — a working launcher was restored in v1.0.7. See `docs/SOCKET-PROBE-PLAN.md` and `docs/INVESTIGATION.md` for context.

## [1.0.5] - 2026-04-30

### Fixed

- Switch `plugin.json` `lspServers.powershell.args` from `pwsh -File <script>` to `pwsh -Command "& '<script>'"`. With `-File`, PowerShell intercepts stdin (binding it to script parameters or buffering into `$input`), so the LSP client's JSON-RPC frames never reach the downstream `Start-EditorServices.ps1` invocation — Claude Code sends `initialize` and PSES never sees it. With `-Command "& '...'"`, stdin passes through cleanly to the child invocation. Matches the canonical Emacs/Vim/VS Code launch pattern (`pwsh -NoLogo -NoProfile -Command <script> -Stdio`).

## [1.0.4] - 2026-04-30

### Fixed

- Pass `-LogLevel 'Information'` to `Start-EditorServices.ps1`. PSES's bootstrap script reassigns `$LogLevel = switch ($LogLevel) { ... default { $LogLevel } }` after binding `[ValidateSet(...)]`. When `-LogLevel` is omitted, `$LogLevel` is `$null` and the reassignment re-triggers `ValidateSet`, crashing the script with `"The variable cannot be validated because the value $null is not a valid value for the LogLevel variable."` (PSES bug — the canonical Emacs/Vim integration tests omit it but apparently never hit this path on Linux pwsh.)
- Pass `-LogPath $env:TEMP/pses-claude-lsp.log` so PSES log location is deterministic for troubleshooting (PSES's default location varies by platform).

## [1.0.3] - 2026-04-30

### Fixed

- Stripped `Start-EditorServices.ps1` invocation down to `-Stdio` only — matching the canonical PSES integration pattern from `test/emacs-simple-test.el` in the upstream repo. The previous splat passed explicit `HostName`, `HostProfileId`, `HostVersion`, `BundledModulesPath`, `LogPath`, `LogLevel`, `SessionDetailsPath`, and `LanguageServiceOnly` — the wrong `BundledModulesPath` value (pointing at the cache root instead of the PSES module dir) was preventing PSES from loading PSReadLine/PSScriptAnalyzer and stalling the LSP handshake forever. PSES infers all of these defaults correctly when omitted.

## [1.0.2] - 2026-04-30

### Fixed

- Force `[Console]::OutputEncoding`, `[Console]::InputEncoding`, and `$OutputEncoding` to UTF-8 *without* BOM at the top of `start-pses-lsp.ps1`. PowerShell on Windows defaults to UTF-8-with-BOM, which prepends `EF BB BF` to the first stdout byte and corrupts the JSON-RPC frame the LSP client is parsing — causing the client to hang forever waiting for a valid `initialize` response.

## [1.0.1] - 2026-04-30

### Fixed

- Stripped optional `lspServers` fields (`transport`, `startupTimeout`, `shutdownTimeout`, `restartOnCrash`, `maxRestarts`) and the `$schema` URL — these were causing Claude Code to silently reject the `lspServers` block during plugin load, so PSES spawned but never registered for `.ps1`/`.psm1`/`.psd1`. Config now mirrors the minimal shape used by the working `lua-lsp` and `typescript-lsp` reference plugins.

## [1.0.0] - 2026-04-30

### Added

- Initial release
- `lspServers.powershell` entry in `plugin.json` wiring PowerShellEditorServices into Claude Code's LSP tool over stdio
- `scripts/start-pses-lsp.ps1` — stdio launcher that downloads `PowerShellEditorServices.zip` from the official [GitHub releases](https://github.com/PowerShell/PowerShellEditorServices/releases) on first run and caches it per-user (Windows: `%LOCALAPPDATA%\claude-code-powershell-lsp\<version>\`; Unix: `${XDG_CACHE_HOME:-$HOME/.cache}/claude-code-powershell-lsp/<version>/`)
- Pinned to PSES v4.5.0 with `-PsesVersion` / `$env:CLAUDE_PSES_VERSION` override
- Extension mapping for `.ps1`, `.psm1`, `.psd1` to the `powershell` language id
- Crash-recovery configuration (`restartOnCrash: true`, `maxRestarts: 5`)
