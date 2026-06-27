# Conductor — parallel agent substrate

The Conductor runs the user's *own* coding-agent CLIs (Claude Code, Codex, opencode,
pi, Gemini, Qwen) in parallel, each in an isolated git worktree driven through a
pinned tmux session. State of record lives in `@recoder/agent-os` + Postgres; live
execution lives in tmux + git worktrees (survives backend restart); a reconciler
rebinds them on boot. See `docs/CONDUCTOR-ARCHITECTURE.md` and
`docs/subsystems/substrate.md`.

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
| `workspace-service.ts` | Persisted Workspace lifecycle + reconciler (the brain) |
| `run-tailer.ts` | Poll substrate capture/alive → emit RunEvents |
| `review.ts` / `review-publish.ts` | Diff → PR → merge → archive |
| `bundle.ts` | Prompt enrichment (task + git-nexus + mem0 + context7) |
| `a2a-entry.ts` | A2A inbound → launch workspace |
| `conductor.routes.ts` | Express routes `/api/conductor/*` |
