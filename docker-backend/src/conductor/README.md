# Conductor — parallel agent substrate

The Conductor runs the user's *own* coding-agent CLIs (Claude Code, Codex, opencode,
pi, Gemini, Qwen) in parallel, each in an isolated git worktree driven through a
pinned tmux session. State of record lives in `@recoder/agent-os` + Postgres; live
execution lives in tmux + git worktrees (survives backend restart); a reconciler
rebinds them on boot. See `docs/CONDUCTOR-ARCHITECTURE.md`.

## tmux — vendored + pinned binary

Per the architecture (LOCKED §8c): tmux is a vendored C binary (`c/tmux`), pinned in
the runtime image and driven via its CLI. We own it by vendoring + building + pinning,
never reimplementing it (the node-pty `session-mux` attempt was reverted).

- **Build:** `make build-tmux` → produces `c/tmux/tmux`.
- **Pin:** set `RECODER_TMUX_BUILD_PATH=/path/to/c/tmux/tmux` (or `CONDUCTOR_TMUX_BIN`).
- **Fallback:** if neither is set, the conductor uses the system `tmux` on PATH.
- **Resolution:** `tmux-path.ts` exports `TMUX_BIN` (resolved once at import). Every
  `exec(TMUX_BIN, …)` call in the conductor routes through it — no hardcoded `'tmux'`.

## dmux — optional operator console

dmux (`ts/dmux`) is an OPTIONAL interactive TUI that gives a human operator a grid
view over N parallel agent panes. It is **never on the critical path**: if dmux is
absent, the conductor is fully functional via tmux alone.

- **Build:** `make build-dmux` → builds `ts/dmux/dist`.
- **Availability:** `GET /api/conductor/dmux` — truthful availability + visible sessions.
- **Launch:** `POST /api/conductor/dmux/launch { repoPath }` — spawns a detached console.
- **Bridge:** the conductor's `recoder-*` tmux sessions share one tmux server, so dmux
  observes and interacts with them. `dmux-adapter.ts` resolves the binary (vendored →
  override → system PATH), reports availability, and launches the console.

## hook gate — in-process @recoder/agent-hooks fusion

The runtime launch path is gated by `@recoder/agent-hooks` fused **in-process**
(no subprocess, no side-route, no HTTP between owned packages). `hook-gate.ts`
imports the package's deterministic helpers and runs them on the conductor run
loop's own call stack:

- **Pre-launch gate** (`evaluatePreToolUse`): `launchRuntime` calls `gateLaunch`
  AFTER resolving the headless CLI line and BEFORE the substrate spawns the
  agent. It secret-scans the agent-controlled prompt + the resolved command line
  and runs the deterministic path/command policy. A positive `block` decision
  (detected secret, forbidden path/action) returns `{ success: false,
  blockedByPolicy: true }` and the agent never spawns. A `needs_approval`
  decision is logged but the sandboxed launch proceeds (additive, non-blocking).
- **Post-launch capture** (`evaluatePostToolUse`): on a successful launch,
  `captureLaunchArtifact` records a best-effort audit artifact key onto the
  launch result.

**Decision:** the embedded backend uses the in-process helpers (faster, we own
the process). The package's subprocess `runHookCli` stays available for
external-Claude-Code hook parity, but it is **not** the path wired here.

**Degrade-safe:** if the hook package is unavailable or throws, the gate logs
and falls back to allowing the launch — a failing policy gate never crashes or
blocks a launch; it can only deny a launch it positively decided to block.

## Files

| File | Role |
|---|---|
| `substrate.ts` | The `ConductorSubstrate` contract + in-process registry |
| `tmux-path.ts` | Resolves the pinned tmux binary (vendored → override → system) |
| `tmux-orchestrator.ts` | Real tmux + git worktree CLI driver |
| `substrate-tmux.ts` | `tmux_worktree` substrate impl |
| `substrate-daytona.ts` | `daytona` remote substrate impl |
| `dmux-adapter.ts` | Optional dmux operator-console adapter (availability + launch) |
| `runtime-commands.ts` | Resolve runtime+prompt → real headless CLI line (6 CLIs) |
| `runtime-driver.ts` | Launch/stop/status a CLI through the substrate (gated by the hook) |
| `hook-gate.ts` | In-process `@recoder/agent-hooks` gate: secret/path block + artifact capture |
| `workspace-service.ts` | Persisted Workspace lifecycle + reconciler (the brain) |
| `run-tailer.ts` | Poll substrate capture/alive → emit RunEvents |
| `review.ts` / `review-publish.ts` | Diff → PR → merge → archive |
| `bundle.ts` | Prompt enrichment (task + git-nexus + mem0 + context7) |
| `a2a-entry.ts` | A2A inbound → launch workspace |
| `conductor.routes.ts` | Express routes `/api/conductor/*` |
