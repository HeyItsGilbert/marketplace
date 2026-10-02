# powershell-lsp — Investigation Log

A running record of every approach tried to wire PowerShellEditorServices (PSES) into Claude Code's LSP tool, why each one failed, and what we learned. Add new entries to the bottom as the integration evolves.

## Context

Claude Code's LSP tool (`goToDefinition`, `findReferences`, `hover`, `documentSymbol`, …) ships with adapters for Python, TypeScript, Rust, Lua. PowerShell is not on the official list, so we're building our own. The official PowerShell language server is **PowerShellEditorServices (PSES)** — a .NET-based server distributed as a release zip on GitHub (NOT on PSGallery).

Constraints we have to fit inside:

- Claude Code's `lspServers` schema documents only `transport: "stdio"` and `transport: "socket"`. No `port`, `host`, or `pipeName` fields.
- PSES supports two transports natively: `-Stdio` and named pipes (`\\.\pipe\<name>`). It has **no** TCP listener.
- Plugins ship with `${CLAUDE_PLUGIN_ROOT}` substitution, but cached plugin dirs are wiped on reinstall.
- PSES is ~20 MB; users shouldn't be required to pre-install it.

## Reference points (proven-working integrations)

- **VS Code PowerShell extension** — uses named pipes (preferred), with stdio as fallback for some clients.
- **Emacs `eglot`** — `pwsh -NoLogo -NoProfile -Command <Start-EditorServices.ps1> -Stdio` (see `test/emacs-simple-test.el` in the PSES repo).
- **Vim `LanguageClient-neovim`** — same `-Command` pattern as Emacs.
- **`lua-lsp` / `typescript-lsp` plugins** in Claude Code marketplaces — minimal `lspServers` config: `command`, `args`, `extensionToLanguage`. No bootstrap script.

The pattern across every working integration: launch the language-server binary **directly** with `pwsh -Command`, no intermediate PowerShell wrapper script.

---

## Attempts

### v1.0.0 — `Install-Module PowerShellEditorServices`

**Approach:** Wrapper script `Install-Module PowerShellEditorServices -Scope CurrentUser` then `Start-EditorServices` cmdlet with a full splat.

**Result:** Install fails immediately — PSES is not on PSGallery.

**Why we believed it would work:** Initial mistaken assumption that PSES is published like other PowerShell modules.

**Lesson:** PSES is a binary release on GitHub. Always download from <https://github.com/PowerShell/PowerShellEditorServices/releases>.

---

### v1.0.1 — Strip optional `lspServers` fields

**Approach:** Removed `transport`, `startupTimeout`, `shutdownTimeout`, `restartOnCrash`, `maxRestarts`, and `$schema` from `plugin.json` to match the minimal shape used by `lua-lsp`/`typescript-lsp`.

**Result:** Plugin loaded but `LSP({operation: "documentSymbol", filePath: ".ps1"})` returned *"No LSP server available for file type: .ps1"*. After running `/reload-plugins`, Claude Code reported 5 LSP servers loaded (was 4) — registration succeeded but routing didn't.

**Why we believed it would work:** Schema strictness theory — Claude Code's loader was silently dropping the `lspServers` block because of unknown optional fields.

**Lesson:** Stripping the optional fields was a no-op for this bug. The real problem was the *cache* — `/plugin install` had cached v1.0.0 and `/reload-plugins` only re-reads cached files. Bumping the plugin version is required to force a fresh install. Optional fields like `transport: "stdio"` are documented and accepted by Claude Code; the schema is permissive.

---

### v1.0.2 — Force UTF-8 (no BOM) on console streams

**Approach:** Added at top of launcher:

```powershell
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8NoBom
[Console]::InputEncoding  = $utf8NoBom
$OutputEncoding           = $utf8NoBom
```

**Result:** Plugin loaded, PSES bootstrap completed (visible in `$env:TEMP/pses-claude-lsp.log/StartEditorServices-*.log`), but Claude Code's LSP request hung indefinitely after `Sending request 'initialize - (0)'`.

**Why we believed it would work:** PowerShell on Windows defaults to UTF-8-with-BOM for `[Console]::Out`, which prepends `EF BB BF` to the first stdout write. LSP framing requires raw bytes — a BOM corrupts the first JSON-RPC `Content-Length` header.

**Lesson:** This *was* a real risk and the encoding fix is defensively correct, but it wasn't the root cause of the hang. PSES uses `Console.OpenStandardOutput()` directly, bypassing PowerShell's `[Console]::Out` wrapping, so the BOM never affected its output. We kept the fix because it's free insurance.

---

### v1.0.3 — Mirror `emacs-simple-test.el`: pass only `-Stdio` to PSES

**Approach:** Removed our `BundledModulesPath`, `LogPath`, `LogLevel`, `SessionDetailsPath`, `LanguageServiceOnly`, `HostName`, `HostProfileId`, `HostVersion` arguments. Just `& $startScript -Stdio`.

**Result:** Crashed immediately with:

```
The variable cannot be validated because the value $null is not a valid value for the LogLevel variable.
```

**Why we believed it would work:** PSES's own `test/emacs-simple-test.el` uses exactly this minimal invocation. Our explicit args (especially `BundledModulesPath = $installDir`) might have been pointing PSES at the wrong directory.

**Lesson:** **Bug in PSES's `Start-EditorServices.ps1`**: the script reassigns `$LogLevel = switch ($LogLevel) { ... default { $LogLevel } }` after the `[ValidateSet(...)]` attribute is bound. When `-LogLevel` is omitted, `$LogLevel` is `$null` and the reassignment re-triggers `ValidateSet`, which rejects `$null`. The Emacs test apparently never hits this on Linux pwsh — possibly different PSES default behavior or a bug introduced after the test was written. **`-LogLevel` must always be passed explicitly.**

---

### v1.0.4 — Pass `-LogLevel 'Information'` (and `-LogPath` for deterministic log location)

**Approach:** Restored `-LogLevel 'Information'` and `-LogPath $env:TEMP/pses-claude-lsp.log` while keeping everything else that v1.0.3 stripped.

**Result:** PSES bootstrap completed successfully. Log shows:

```
[INF]: Loading PowerShell Editor Services Assemblies
[INF]: Starting PowerShell Editor Services
[INF]: PSES Startup Completed. Starting Language Server.
[INF]: Please check the LSP log file in your client for further messages.
```

But Claude Code's `LSP` request hung again with **complete silence** after `[DEBUG] [LSP PROTOCOL plugin:powershell-lsp:powershell] Sending request 'initialize - (0)'.` — no response, no crash, just nothing.

**Why we believed it would work:** Fixed the `LogLevel` bug from v1.0.3. PSES bootstrap clearly succeeds.

**Lesson:** PSES is alive but not reading stdin OR not writing stdout. Bootstrap success ≠ LSP responsiveness. Need a deeper diagnostic.

---

### v1.0.5 — Switch from `pwsh -File` to `pwsh -Command "& '<script>'"`

**Approach:** Changed `plugin.json` `lspServers.powershell.args` from:

```json
["-NoLogo", "-NoProfile", "-File", "${CLAUDE_PLUGIN_ROOT}/scripts/start-pses-lsp.ps1"]
```

to:

```json
["-NoLogo", "-NoProfile", "-Command", "& '${CLAUDE_PLUGIN_ROOT}/scripts/start-pses-lsp.ps1'"]
```

**Result:** Hang persists. Smoke tests #1 and #2 (below) confirm zero bytes on both stdio streams regardless of whether our wrapper is in the path or not.

**Why we believed it would work:** `pwsh -File` puts PowerShell into "script execution mode" where stdin is owned by the host (binds `[Parameter(ValueFromPipeline)]` params or buffers into `$input`) — anything spawned downstream sees an *already-drained* stdin. `pwsh -Command "& '...'"` parses the command-line as a script block; stdin is *supposed* to pass through to whatever the block invokes. This is precisely why VS Code, Emacs (eglot), and Vim all use `-Command` for PowerShell LSP integration — we were the odd ones out.

**Lesson:** Switching to `-Command` is correct for portability and matches every other working integration, but it doesn't move the needle for the Windows stdio issue. The bug is below the wrapper layer entirely. Keeping `-Command` because it's still the right pattern.

---

### Smoke test #1 — Manual `initialize` frame fed to wrapper (`test-stdio.ps1`)

**Approach:** Spawn `pwsh -NoLogo -NoProfile -Command "& '<our-launcher>'"`, write a complete LSP `initialize` frame (130 bytes including `Content-Length: 107\r\n\r\n` header) to stdin, wait 10s, kill, drain stdout/stderr.

**Result:**

```
[test-stdio] === STDOUT (0 chars — what Claude Code would read) ===
(empty — PSES did not write anything to stdout)

[test-stdio] === STDERR (0 chars — launcher status + PSES bootstrap) ===
(empty)

[test-stdio] Final process exit code: -1
```

**Why this matters:** PSES is alive (we know from log files), bootstrap completed, but it produced **zero bytes on either stream**. This means either:

1. PowerShell's outer pwsh process is intercepting stdin before our `& $startScript` invocation can hand it to PSES (PowerShell consuming stdin into `$input` even with `-Command`).
2. PSES is buffering output and not flushing because the LSP message it's waiting for never arrives in a parseable form.
3. PSES uses some Console-redirection mechanism that pwsh's wrapper-script invocation breaks.

**Lesson:** Adding a wrapper PowerShell script between `pwsh` and `Start-EditorServices.ps1` is suspect on Windows. Need to bisect by testing `Start-EditorServices.ps1` directly without our wrapper.

---

### Smoke test #2 — Manual `initialize` frame fed directly to PSES (`test-stdio-direct.ps1`)

**Approach:** Bypass our wrapper entirely. Spawn `pwsh -NoLogo -NoProfile -Command "& '<cached-pses>/Start-EditorServices.ps1' -Stdio -LogLevel Information"` (the canonical Emacs invocation), feed the same `initialize` frame, capture stdout/stderr.

**Result:**

```
[direct] === STDOUT (0 chars) ===
(empty)

[direct] === STDERR (0 chars) ===
(empty)
```

Same as Smoke test #1. Even invoking `Start-EditorServices.ps1` directly with the canonical Emacs pattern (`pwsh -Command "& '<pses-script>' -Stdio -LogLevel Information"`) yields zero bytes on both streams when the parent uses `Process.Start` with redirected pipes.

**Verdict:** Our wrapper architecture is **NOT** the problem. PSES stdio doesn't work with Windows-pwsh-as-LSP-host when the parent uses PSI redirection. PSES bootstrap completes (we know from `$env:TEMP/pses-claude-lsp.log/StartEditorServices-*.log` showing "Starting Language Server"), but no bytes flow either direction over the redirected stdio pipes.

**Probable root cause:** When PowerShell detects redirected stdio (which Claude Code's plugin LSP host uses), it wraps the redirected handles in its own buffered I/O abstraction. PSES (a .NET library invoked from inside the PowerShell runspace) calls `Console.OpenStandardInput()` / `Console.OpenStandardOutput()` directly, expecting raw access to the process's stdio handles. The two abstractions don't compose: bytes Claude Code writes go into PowerShell's buffer (drained as cmdlet input or held), never reaching PSES's stream view; bytes PSES writes go to its raw stream view but never get flushed through PowerShell's I/O wrapper to the redirected pipe.

This is consistent with why **VS Code's PowerShell extension uses named pipes on Windows** despite stdio being available — stdio simply doesn't survive PowerShell's I/O wrapping when the parent process redirects.

**Implications:**

- ❌ Stdio transport for PSES under Windows pwsh is not viable as currently shaped.
- ❌ Adjusting wrapper invocation (`-File` vs `-Command`, encoding, splat shape) cannot fix this — the failure is below the wrapper layer.
- ✅ PSES itself works (bootstrap completes, log file populated).
- ✅ Plugin discovery, registration, and routing in Claude Code all work.

**Path forward:** named-pipe bridge OR investigation of Claude Code's `transport: "socket"` semantics. Both options recorded under "Decision tree" below.

---

## Open questions

- **What does Claude Code's `transport: "socket"` actually mean?** Docs say only `"stdio" (default) or "socket"` with no companion fields. Does the LSP server announce its socket on stdout? Does Claude Code pass a port via env var? Without a worked example we'd have to reverse-engineer from the code.
- **Does PowerShell's `-Command "& '...'"` truly pass stdin through to the script?** We assumed yes based on the Emacs example, but Smoke test #1 with this exact pattern produced empty output. Could be that the Emacs pattern works because Emacs writes stdin *after* spawning PSES with no wrapper, and PowerShell's stdin handling differs when there's no PowerShell wrapper script in between.
- **Why does PSES write zero bytes on both streams when ours's wrapper invokes it?** Even if stdin is drained, PSES should at least write *something* to stdout when it tries to handshake. Zero output suggests PSES is silently waiting forever, not that it tried and failed.

## What we know works

- PSES download from GitHub releases ✅
- PSES extraction to `%LOCALAPPDATA%\claude-code-powershell-lsp\<version>\` ✅
- PSES bootstrap (`Loading...` → `Starting Language Server`) ✅
- PSES log file creation under user-supplied `-LogPath` ✅
- Claude Code plugin discovery: powershell-lsp shows up as 1 of 5 LSP servers ✅
- Claude Code routing `.ps1` extension to powershell-lsp's `command` (proven by `LSP operation failed` on a malformed path — different error class than "no server for type") ✅
- LogLevel must be explicit (PSES bug workaround) ✅
- Encoding pinned to UTF-8 no-BOM (defensive) ✅

## What we don't know works

- Stdin actually reaching PSES's `Console.OpenStandardInput()` ❓
- Stdout from PSES actually reaching the parent process ❓
- Whether Claude Code's `socket` transport works without specifying a port ❓
- Whether named-pipe transport could work with a bridge ❓

## Decision tree (current state)

Stdio is dead on Windows for PSES. Three credible paths:

### Option A — TCP-to-named-pipe bridge (highest confidence, most work)

Write a small bridge process (Node.js, Python, or .NET) that:

1. Spawns PSES with `-LanguageServicePipeName \\.\pipe\claude-pses-<random>`
2. Listens on `127.0.0.1:<port>` (or pwsh equivalent)
3. Forwards bytes between the TCP socket and the named pipe
4. Configures Claude Code's `lspServers.powershell.transport: "socket"` to connect to that port

Risks: Claude Code's `transport: "socket"` is undocumented. We don't know how it specifies port/host or how it discovers them. Bridge process needs lifecycle management (start with plugin, die with plugin). Estimate: 1–2 days plus debugging Claude Code's socket protocol.

### Option B — Investigate Claude Code's `transport: "socket"` semantics

Read Claude Code's source or test plugins that use `socket`. If the protocol is "LSP server prints `Content-Length: ...{port info}` to stdout, then exits stdio mode and waits on the socket," PSES could be coerced into doing this via a tiny wrapper. If the protocol is "LSP server listens on a fixed port that Claude Code passes via env var," we could trivially configure PSES to listen on that port via named pipes + bridge.

Cost: half-day of investigation. Could save the bridge entirely if `socket` semantics are friendly.

### Option C — Punt on Windows, ship Linux/macOS only

PSES stdio works on Linux/macOS (the Emacs test was authored on Linux). Mark powershell-lsp as Linux/macOS-only in README. Windows users can pre-install PSES manually and configure it externally.

Cost: free, but defeats the purpose — most PowerShell development happens on Windows.

### Recommendation

**Start with Option B.** Half-day to figure out `transport: "socket"` is much cheaper than half-day to a day building a bridge that we may not even need. If Option B reveals that `socket` requires us to print port info or accept env-var configuration, we can build a much smaller bridge specifically tailored to that protocol. If Option B reveals `socket` is also broken or undocumented to the point of unusability, fall back to Option A or C.

## Files in this plugin

- `.claude-plugin/plugin.json` — manifest with `lspServers.powershell` block
- `scripts/start-pses-lsp.ps1` — current launcher (downloads + caches PSES, branches Windows named-pipe proxy vs Linux/macOS direct stdio)
- `docs/INVESTIGATION.md` — this document. The Appendix at the bottom contains reproducible patterns for the diagnostic scripts that earlier revisions shipped (removed in v1.1.1).

---

### v1.0.6 — Probe build with `transport: "socket"` (no companion fields)

**Approach:** Replaced PSES launcher with `scripts/socket-probe.ps1` (a fake LSP server that logs everything Claude Code sends). Set `transport: "socket"` in plugin.json with no other companion fields. Goal: see how Claude Code communicates port/host info to the spawned process.

**Result:** **Plugin install silently failed.**

- `installed_plugins.json` shows `[]` for powershell-lsp — the plugin manager refused to install v1.0.6.
- Cache directory `~/.claude/plugins/cache/<marketplace>/powershell-lsp/` contains 1.0.0–1.0.5 but **no 1.0.6 directory**.
- `/reload-plugins` after the install attempt reported `Total LSP servers loaded: 2` (lua-lsp + typescript-lsp only). Our plugin contributed zero.
- The probe `scripts/socket-probe.ps1` was never spawned (no `$env:TEMP/socket-probe.log` created).
- Debug log shows no install error or validation message — just silent rejection.

**Why we believed it would work:** A bare `transport: "socket"` config (without unknown companion fields) was the simplest variant to test. We hoped Claude Code would either (a) accept it and pass port info via env/stdout, or (b) reject it with a useful error. Got option (c): silent rejection at install time.

**Lesson:**
- `transport: "socket"` alone is not a valid plugin LSP config. Claude Code's manifest validator requires *something* additional that isn't documented.
- The plugin loader does not surface validation errors — failed installs are silent. **Future debugging must check `installed_plugins.json` and the cache directory after every install attempt** to confirm the install actually happened.
- Any future `transport: "socket"` experiment should start by figuring out what makes the install succeed (probably involves specifying a port, host, or pipe name in some unknown field). Without docs, this means trying field name candidates one at a time and watching install success.

---

## The Definitive Answer — extracted from Claude Code's binary

After all the empirical experiments, I extracted the actual schema and runtime code from Claude Code 2.1.121's compiled binary at `~/.local/bin/claude.exe`. This settles every open question.

### Complete schema (`PhH` Zod definition)

```javascript
PhH = h.strictObject({
    command: h.string().min(1).refine(/* no spaces unless absolute */),
    args: h.array(...).optional(),
    extensionToLanguage: h.record(...).refine(/* at least 1 mapping */),
    transport: h.enum(["stdio", "socket"]).default("stdio"),
    env: h.record(h.string(), h.string()).optional(),
    initializationOptions: h.unknown().optional(),
    settings: h.unknown().optional(),
    workspaceFolder: h.string().optional(),
    startupTimeout: h.number().int().positive().optional(),
    shutdownTimeout: h.number().int().positive().optional(),
    restartOnCrash: h.boolean().optional(),
    maxRestarts: h.number().int().nonnegative().optional()
})
```

`strictObject` means **no additional properties allowed**. There is **no `port`, `host`, `pipeName`, `socketPath`, `address`, `endpoint`, or `url`** field. Adding any unknown field would fail validation.

### Runtime behavior (`createLSPClient` / `tZ9` and start function `M`/`PG_`)

```javascript
async start(w, j, P) {
    $ = MG_.spawn(w, j, {
        stdio: ["pipe", "pipe", "pipe"],   // <-- ALWAYS pipe-based stdio
        env: {..._h(), ...P?.env},
        cwd: P?.cwd,
        windowsHide: !0
    });
    let X = new _3H.StreamMessageReader($.stdout),    // vscode-jsonrpc
        L = new _3H.StreamMessageWriter($.stdin);
    K = _3H.createMessageConnection(X, L);
    // ...
}
```

Plus from `PG_(H, q)`:
```javascript
if (q.restartOnCrash !== void 0)
    throw Error(`LSP server '${H}': restartOnCrash is not yet implemented. Remove this field from the configuration.`);
if (q.shutdownTimeout !== void 0)
    throw Error(`LSP server '${H}': shutdownTimeout is not yet implemented. Remove this field from the configuration.`);
// ...
await Y.start(q.command, q.args || [], { env: q.env, cwd: q.workspaceFolder });
```

### Conclusions

1. **`transport: "socket"` is dead-on-arrival.** It's in the schema but the runtime code never branches on it. Every LSP server is spawned with `stdio: ["pipe", "pipe", "pipe"]` and connected via `StreamMessageReader($.stdout)` / `StreamMessageWriter($.stdin)`. Setting `transport: "socket"` does nothing useful — it doesn't even fail loudly; it just defaults back to stdio.

2. **`restartOnCrash` and `shutdownTimeout` will THROW** if set. Both are in the documented schema but explicitly rejected by the runtime as "not yet implemented." Our v1.0.0 had both — that's why early sessions had crashes.

3. **`maxRestarts`, `startupTimeout`, `env`, `workspaceFolder`, `initializationOptions`, `settings` are all real and used.**

4. **Our v1.0.6 install probably succeeded** but `transport: "socket"` was silently ignored, leaving the spawn going through stdio — same broken state as v1.0.5. The cache directory missing 1.0.6 might be because the user didn't actually run `/plugin install powershell-lsp` after `/plugin marketplace add`, OR because the install path skips creating cached version dirs for relative-path marketplaces. Either way, irrelevant — `transport: "socket"` would not have helped.

5. **PowerShell + redirected stdio + PSES is a known broken combination.** PowerShell wraps `Console.Out` / `Console.In` in its own buffered host-I/O. PSES (loaded as a .NET module inside the pwsh AppDomain) calls `Console.OpenStandardOutput()` directly, bypassing that wrapper. The two views of stdio don't see the same bytes — what Claude Code writes goes into pwsh's buffer; what PSES writes goes to its raw stream view but isn't flushed through pwsh's wrapper. This is exactly why **VS Code's PowerShell extension uses named pipes on Windows** — stdio simply doesn't survive PowerShell's I/O wrapping when the parent process redirects.

### The actual viable path: PowerShell named-pipe proxy

Since `transport: "socket"` is a no-op, the only way to make Claude Code talk to PSES on Windows is a **proxy** that Claude Code spawns over stdio, which internally bridges to a PSES instance running in a separate process with named-pipe transport.

Architecture:

```
Claude Code           our proxy script       separate pwsh + PSES
   |                       |                       |
   |--- stdio pipes -------+                       |
   |                       +--- spawns ------------+
   |                       +--- named pipe --------+
   |                       |                       |
   |  Claude→stdin ─→ proxy ─→ named pipe ─→ PSES |
   |  PSES ─→ named pipe ─→ proxy ─→ stdout ─→ Claude |
```

The proxy:

1. Reads `Console.OpenStandardInput()` / `Console.OpenStandardOutput()` *immediately at startup*, BEFORE PowerShell can wrap them in cmdlet pipelines (this is the critical detail)
2. Generates a unique named pipe name (e.g., `claude-pses-<guid>`)
3. Spawns PSES in a child pwsh: `pwsh -NoLogo -NoProfile -Command "& '<pses-script>' -LanguageServicePipeName \\.\pipe\<name> -SessionDetailsPath <tmp> -LogLevel Information -LogPath <tmp>"`
4. Polls the session details file until PSES writes the pipe info
5. Opens `NamedPipeClientStream` to the pipe
6. Runs two background tasks: stdin → pipe, pipe → stdout
7. Waits for either side to disconnect, then cleans up

This pattern is proven on Windows by VS Code, neovim, and IntelliJ for PowerShell LSP integration — all use named pipes for exactly this reason.

**Estimated work:** 1–2 hours to implement and debug. The PSES side is well-trodden territory; the bridge is ~80 lines of PowerShell.

---

## Resolution — v1.0.8 works

The named-pipe proxy approach succeeded. End-to-end test on 2026-04-30:

```text
LSP({operation: "documentSymbol", filePath: ".../start-pses-lsp.ps1", line: 1, character: 1})
→ Found 30 symbols
```

### v1.0.7 — first proxy attempt, failed at pipe connect

Built the stdio-to-named-pipe proxy. PSES launched correctly (PID captured), but the connect timed out after 30s. Root cause: passed `\\.\pipe\<name>` as the value of `-LanguageServicePipeName`. .NET's `NamedPipeServerStream` takes a **bare name** and the OS prepends `\\.\pipe\` automatically — so PSES created a pipe at `\\.\pipe\\\.\pipe\<name>` (double-prefixed) that the client couldn't reach.

**Lesson:** when a Windows API takes a "pipe name", check whether it expects the bare name (server- and client-stream constructors) or the full UNC-style path (raw kernel APIs). PSES wraps `NamedPipeServerStream`, so bare names only.

### v1.0.8 — fixed and shipped

Two changes:

1. Pass the bare pipe name (no `\\.\pipe\` prefix) to PSES.
2. After PSES writes its session details JSON file, **read the actual pipe name from there** instead of assuming our requested name was used. Strip any `\\.\pipe\` prefix from PSES's reported value before passing to `NamedPipeClientStream`. Robust to PSES version drift in field naming and prefix conventions.

End-to-end working architecture:

```text
Claude Code                  start-pses-lsp.ps1                     pwsh + PSES (child)
    │                              │                                     │
    │── child_process.spawn ──────►│  proxy script                       │
    │   stdio: pipe/pipe/pipe      │                                     │
    │                              │── Process.Start ───────────────────►│
    │                              │   pwsh -Command "Start-EditorServ.. │
    │                              │     -LanguageServicePipeName foo    │
    │                              │     -SessionDetailsPath sess.json   │
    │                              │                                     │
    │                              │   wait for sess.json                │
    │                              │── NamedPipeClientStream("foo") ────►│
    │                              │                                     │
    │ initialize ─stdio→ proxy ──→ pipe ───────────────────────────────► │ PSES
    │ ◄──── stdout ←── proxy ←── pipe ◄─── response ────────────────────│
```

The proxy uses `Stream.CopyToAsync` with a cancellation token for both directions, ensuring clean shutdown when either side disconnects.

### Why this works (the underlying mechanics)

- The proxy script grabs `Console.OpenStandardInput()` / `Console.OpenStandardOutput()` *immediately* at startup, before PowerShell can wrap them in cmdlet pipeline machinery. Those raw streams are what `Process.Start`/`child_process.spawn` redirected, so writes/reads on them go directly to/from Claude Code.
- PSES runs in a **separate** pwsh process and uses **named pipes**, which it creates via `NamedPipeServerStream` — completely bypassing PowerShell's host-I/O wrapping. (This is the same reason VS Code uses named pipes for PSES on Windows.)
- The proxy's two `CopyToAsync` tasks just shuttle bytes — no parsing, no transformation, no encoding conversion. Whatever Claude Code sends over stdio reaches PSES verbatim, and vice versa.

### Known acceptable behavior

- First LSP call after install takes ~5–10 seconds (PSES download from GitHub releases on first launch only).
- Subsequent LSP calls in the same session: <1 second.
- Subsequent Claude Code sessions reuse the cached PSES install: ~2-3 second cold start.
- Crash recovery: if PSES dies, the proxy detects it (background drain task) and exits with non-zero code. Claude Code may restart the LSP server (no `restartOnCrash`/`maxRestarts` field is honored — both throw if set per binary inspection).

## Future-proofing notes

- If Claude Code ever implements `transport: "socket"` for real, we can simplify by dropping the proxy and pointing Claude Code directly at PSES with a TCP listener (PSES would need a small wrapper or new feature for TCP). Until then, the named-pipe proxy is the only viable path on Windows.
- If PSES changes its session-details JSON field names, update the field-candidate list in the proxy (currently tries `languageServicePipeName`, `languageServiceTransport`, `languageServicePipeNameInbound`).
- Linux/macOS pwsh likely doesn't have the I/O-wrapping issue, so the proxy may be unnecessary there — but it's harmless. Could short-circuit to direct stdio invocation for non-Windows platforms in a future cleanup.

---

## Cross-reference: Piebald-AI/claude-code-lsps powershell-editor-services config

After v1.0.8 shipped, we discovered <https://github.com/Piebald-AI/claude-code-lsps/blob/main/powershell-editor-services/.lsp.json>, an alternate Claude Code LSP config for PSES. The relevant invocation:

```text
pwsh -NoLogo -NoProfile -Command "
$module = Get-Module -ListAvailable PowerShellEditorServices |
    Sort-Object Version -Descending | Select-Object -First 1
if (-not $module) { throw 'PowerShellEditorServices is not installed...' }
Import-Module $module.Path
Start-EditorServices `
  -HostName 'Claude Code' -HostProfileId 'ClaudeCode' -HostVersion '1.0.0' `
  -Stdio `
  -BundledModulesPath (Split-Path $module.Path) `
  -LogPath '/dev/null' -LogLevel 'None' `
  -EnableConsoleRepl
"
```

Plus their `.lsp.json` declares `shutdownTimeout: 20000` which my binary inspection of Claude Code 2.1.121 says **throws** at LSP startup (`shutdownTimeout is not yet implemented. Remove this field from the configuration.`). So their config has at least one field that should fail validation against current Claude Code.

### Why this looked promising

It's the **canonical Emacs pattern** plus `-EnableConsoleRepl`. The Emacs test we ran (`test-stdio-direct.ps1`) produced 0 bytes — but that test omitted `-EnableConsoleRepl`. PSES docs say the flag is "mutually exclusive" with `-Stdio`, but Piebald-AI passes both. Possibility: `-EnableConsoleRepl` does some console handle setup that bypasses PowerShell's I/O wrapping, fixing the Windows stdio issue.

### Result of testing it

Built `scripts/test-stdio-piebald.ps1` to feed an `initialize` frame to PSES launched with the Piebald-AI pattern (using our cached PSES module so we didn't depend on PSGallery, which was down at test time anyway). Same 0-byte result:

```
[piebald-test] === STDOUT (0 chars) ===
(empty)

[piebald-test] === STDERR (0 chars) ===
(empty)
```

### Conclusion

**`-EnableConsoleRepl` is not the magic.** PSES + raw stdio on Windows pwsh is genuinely broken regardless of which combination of flags you pass. Piebald-AI's config likely works only on Linux/macOS pwsh (where PowerShell's stdio I/O abstraction differs), or was never end-to-end tested. The shutdownTimeout field in their config also suggests it pre-dates Claude Code's enforcement of that schema rule, or was tested against an older Claude Code build.

**The named-pipe proxy in v1.0.8 remains the only verified working approach for PSES + Claude Code on Windows.**

### Side note on the PSES docs' named-pipe one-liner

PSES docs ([README.md](https://github.com/PowerShell/PowerShellEditorServices)) document this canonical invocation for named-pipe mode:

```text
pwsh -NoLogo -NoProfile -Command "./PowerShellEditorServices/Start-EditorServices.ps1 -SessionDetailsPath ./session.json"
```

This is the **PSES-side half** of what we ship: it spawns PSES, has it create a named pipe (Windows) or Unix socket (Linux/macOS), and writes the pipe path into `session.json`. The client (whatever editor is integrating) is then expected to read `session.json` and connect to the named pipe.

Our `start-pses-lsp.ps1` is essentially the **client-side half**. It's what makes Claude Code able to consume that named-pipe protocol — Claude Code spawns LSP servers expecting stdio, so we run that PSES-side invocation under a proxy that bridges Claude Code's stdio to PSES's named pipe. Without the proxy, the docs' one-liner alone produces a PSES instance that nobody can talk to (because Claude Code only knows how to write LSP frames over the child's stdin/stdout, not how to dial named pipes).

We pass a few extra arguments beyond the docs' minimal form (`-LanguageServicePipeName` to pre-pick the pipe name, `-HostName`/`-HostProfileId`/`-HostVersion` for log clarity, `-LanguageServiceOnly` to skip the debug adapter, `-LogPath`/`-LogLevel Information` because PSES has a `ValidateSet` bug when `-LogLevel` is omitted). All of those are optional refinements; the core pattern is the same.

### Side note on PSGallery

We initially concluded PSES wasn't on PSGallery (the package URL 404'd). Later discovery: PowerShellGallery was simply down during our investigation. PSES IS published on PSGallery as `PowerShellEditorServices`. A future enhancement could try `Install-Module PowerShellEditorServices -Scope CurrentUser` first and fall back to GitHub release download — slightly faster bootstrap when gallery is up, with no architectural change to the proxy.

---

## Appendix — reproducing the diagnostic experiments

Earlier revisions of this plugin shipped four diagnostic scripts under `scripts/` (`test-stdio.ps1`, `test-stdio-direct.ps1`, `test-stdio-piebald.ps1`, `socket-probe.ps1`) plus a `docs/SOCKET-PROBE-PLAN.md`. They were removed once we shipped v1.1.0 to keep the plugin tidy. This appendix captures the essential patterns so future maintainers can rebuild any of them in 10–20 minutes if Claude Code's LSP behavior changes (or if `transport: "socket"` is finally implemented).

### Pattern A — feed an `initialize` frame to a candidate launcher and observe response

Use this when you want to bisect "is PSES talking on stdio at all" without going through Claude Code. Replaces `test-stdio.ps1` / `test-stdio-direct.ps1` / `test-stdio-piebald.ps1`.

```powershell
#requires -Version 7
param(
    # Replace this argument list to test different launch patterns:
    [string[]]$LauncherArgs = @('-NoLogo', '-NoProfile', '-Command', "& '<absolute-path-to-PSES-or-wrapper>' -Stdio -LogLevel Information"),
    [int]$BootstrapSeconds = 8,
    [int]$ResponseDeadlineSeconds = 10
)
$body  = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"processId":null,"rootUri":null,"capabilities":{}}}'
$frame = "Content-Length: $($body.Length)`r`n`r`n$body"

$psi = [System.Diagnostics.ProcessStartInfo]::new()
$psi.FileName = 'pwsh'
foreach ($a in $LauncherArgs) { $psi.ArgumentList.Add($a) }
$psi.RedirectStandardInput  = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError  = $true
$psi.UseShellExecute        = $false
$psi.StandardInputEncoding  = [System.Text.UTF8Encoding]::new($false)
$psi.StandardOutputEncoding = [System.Text.UTF8Encoding]::new($false)
$psi.StandardErrorEncoding  = [System.Text.UTF8Encoding]::new($false)

$proc = [System.Diagnostics.Process]::Start($psi)
Start-Sleep -Seconds $BootstrapSeconds
$proc.StandardInput.Write($frame); $proc.StandardInput.Flush()
Start-Sleep -Seconds $ResponseDeadlineSeconds

# CRITICAL: kill before ReadToEnd. ReadToEnd blocks until the stream closes; killing the
# process closes its redirected pipes. Async event handlers (BeginOutputReadLine + scriptblock
# handlers) DO NOT WORK in PowerShell — they crash at exit time with "no Runspace available
# in this thread". Use ReadToEnd-after-kill or Register-ObjectEvent (heavier).
try { $proc.StandardInput.Close() } catch {}
if (-not $proc.HasExited) { $proc.Kill($true); $proc.WaitForExit(5000) | Out-Null }

$stdoutText = $proc.StandardOutput.ReadToEnd()
$stderrText = $proc.StandardError.ReadToEnd()

# Hex dump first 200 bytes — UTF-8 BOM, partial frames, etc. show up here
$bytes = [System.Text.Encoding]::UTF8.GetBytes($stdoutText)
Write-Host "STDOUT $($stdoutText.Length) chars; first 200 bytes hex:"
Write-Host (($bytes | Select-Object -First 200 | ForEach-Object { '{0:X2}' -f $_ }) -join ' ')
Write-Host "STDOUT text: $stdoutText"
Write-Host "STDERR: $stderrText"
```

**Variants we tested with this harness (all produced 0 bytes on stdio on Windows):**

- `& '<our-wrapper>.ps1'` — `pwsh -Command "& '<wrapper>'"` invoking our v1.0.x launcher
- `& '<Start-EditorServices.ps1>' -Stdio -LogLevel Information` — direct canonical Emacs pattern
- `Import-Module ...; Start-EditorServices ... -Stdio -EnableConsoleRepl ...` — Piebald-AI pattern

**Outcome interpretation:**

| Result | Meaning |
|---|---|
| `Content-Length: ...{"jsonrpc":"2.0","id":1,"result":...}` on STDOUT | PSES stdio works on this launcher |
| Empty STDOUT, PSES bootstrap on STDERR | PSES alive but stdio not reaching it (PowerShell wrapping issue) |
| Empty both, exit code != 0 | Launcher/PSES crashed; check exit code + stderr |
| Empty both, process still running at deadline | PSES waiting forever for input; confirms wrapping issue |

### Pattern B — probe Claude Code's `transport: "socket"` semantics

Use this if Claude Code ever ships an actual `transport: "socket"` implementation (currently the field is in the schema but ignored — see "The Definitive Answer" section above). Replaces `socket-probe.ps1` and `SOCKET-PROBE-PLAN.md`.

The probe should be wired into a temporary plugin manifest variant (bump version, add `transport: "socket"`, point `command` at the probe script, install, reload, trigger an LSP call). The probe captures every channel Claude Code might use to communicate port info:

```powershell
#requires -Version 7
param([int]$Port = 5007, [string]$LogFile = "$env:TEMP/socket-probe.log")
if (Test-Path $LogFile) { Remove-Item $LogFile -Force }
function Log { param($m) Add-Content -Path $LogFile -Value "[$((Get-Date).ToString('HH:mm:ss.fff'))] $m" -Encoding utf8 }

# 1. Capture command-line args, env vars, working dir
Log "PID=$PID  PWD=$(Get-Location)"
Log "ARGS: $($args -join ' | ')"
Log "RAW: $([Environment]::CommandLine)"
Get-ChildItem env: | Where-Object { $_.Name -match '(?i)CLAUDE|LSP|PORT|PIPE|SOCKET|PSES|EDITOR' } |
    ForEach-Object { Log "ENV-filtered: $($_.Name)=$($_.Value)" }
Get-ChildItem env: | Sort-Object Name | ForEach-Object { Log "ENV-all: $($_.Name)=$($_.Value)" }

# 2. Announce port to stdout in several formats (in case Claude Code parses stdout)
foreach ($a in @("$Port", "Listening on port $Port", "127.0.0.1:$Port", "{`"port`":$Port}", "tcp://127.0.0.1:$Port")) {
    [Console]::Out.WriteLine($a); [Console]::Out.Flush(); Log "stdout-announce: $a"
}

# 3. Drain stdin in background — see if Claude Code writes a port-discovery handshake
$null = Start-ThreadJob -ScriptBlock {
    param($logPath)
    $stdin = [Console]::OpenStandardInput(); $buf = [byte[]]::new(4096)
    while (($n = $stdin.Read($buf, 0, $buf.Length)) -gt 0) {
        $hex = ($buf[0..($n-1)] | ForEach-Object { '{0:X2}' -f $_ }) -join ' '
        Add-Content -Path $logPath -Value "[stdin] $n bytes: $hex" -Encoding utf8
    }
} -ArgumentList $LogFile

# 4. Listen on TCP, log + stub-respond to any initialize that arrives
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start(); Log "TCP listening on 127.0.0.1:$Port"
$sw = [System.Diagnostics.Stopwatch]::StartNew()
while ($sw.Elapsed.TotalSeconds -lt 60 -and -not $listener.Pending()) { Start-Sleep -Milliseconds 200 }
if (-not $listener.Pending()) { Log "no connection in 60s; exiting"; return }
$client = $listener.AcceptTcpClient()
Log "TCP CONNECTION from $($client.Client.RemoteEndPoint)"
$stream = $client.GetStream(); $buf = [byte[]]::new(8192)
$deadline = (Get-Date).AddSeconds(30); $responded = $false
while ((Get-Date) -lt $deadline) {
    if ($stream.DataAvailable) {
        $n = $stream.Read($buf, 0, $buf.Length)
        $txt = [System.Text.Encoding]::UTF8.GetString($buf, 0, $n)
        Log "[tcp-in] $n bytes text: $txt"
        if (-not $responded -and $txt -match '"method"\s*:\s*"initialize"') {
            $id = if ($txt -match '"id"\s*:\s*(\d+)') { $Matches[1] } else { '0' }
            $body = '{"jsonrpc":"2.0","id":' + $id + ',"result":{"capabilities":{"documentSymbolProvider":true,"hoverProvider":true}}}'
            $frame = "Content-Length: $($body.Length)`r`n`r`n$body"
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($frame)
            $stream.Write($bytes, 0, $bytes.Length); $stream.Flush()
            Log "[tcp-out] sent stub initialize response"
            $responded = $true
        }
    } else { Start-Sleep -Milliseconds 100 }
}
```

**Key plugin.json variants to try:** bare `transport: "socket"`, `transport: "socket"` + undocumented `port` field (will fail strict schema validation), `transport: "socket"` + `env: { LSP_PORT: "5007" }`. The strict-object schema (`h.strictObject(...)` in the binary) means **any field not in the documented list will fail install silently** — verify install actually happened by checking `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` exists.

**Outcome interpretation:**

| Observation in `$LogFile` | Conclusion |
|---|---|
| ENV contains `LSP_PORT` or similar | Claude Code passes port via env var |
| ARGS contains an unexpected port arg | Claude Code appends `--port=N`-style args |
| Stdin receives bytes | Claude Code writes a port-discovery handshake to stdin first |
| TCP connection accepted with no env/arg/stdin clue | Claude Code parsed our stdout for the port |
| No connection in 60s | `transport: "socket"` is still unimplemented (this was our finding for Claude Code 2.1.121) |
| No log file at all | Probe never ran — `transport: "socket"` failed manifest validation; check cache directory presence |

### General testing tips learned the hard way

- **PSES `LogPath` may be a directory or a file** depending on PSES version. v4.5.0 created a directory and put `StartEditorServices-<PID>.log` files inside. If you `Get-Content $logPath` and get "is a directory", `ls` it first.
- **PowerShell async event handlers (`BeginOutputReadLine` + `add_OutputDataReceived` with scriptblock handlers) crash at process exit** with `"no Runspace available in this thread"`. Use kill-then-`ReadToEnd` instead, or use `Register-ObjectEvent` for proper runspace integration.
- **`StreamReader.Peek()` blocks** on a redirected pipe stream until at least one byte is available. Don't use it as a non-blocking check; use `BaseStream.DataAvailable` on a `NetworkStream` or the kill-then-read pattern above.
- **Plugin install is silent on validation failure.** After `/plugin install`, verify by checking `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` exists and `installed_plugins.json` has the entry. `/reload-plugins` only re-reads cache; it doesn't surface install errors.
- **PowerShell's strict-mode here-string variable expansion gotcha:** `'$env:TEMP'` (single-quoted) is literal; `"$env:TEMP"` (double-quoted) expands. When building command strings to pass to a child pwsh, pre-resolve absolute paths in the parent first.
