# TERMINAL module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): apps/desktop/engines/tmux + apps/desktop/engines/dmux

> **SHIPPED (this substrate lives inside the CONDUCTOR domain).** There is no
> standalone `terminal` domain. The terminal substrate ships at
> `backend/src/domains/conductor/terminal/` — a package-compatible tmux
> `ConductorSubstrate` with a **tmux control-mode observer** and real-time
> terminal streaming (`terminal-stream`), driving conductor `steer` (send-keys)
> and the run-screen plane. **Still partial:** the attention classifier is wired,
> but dmux's fuller pane/layout/streaming/worker brain remains the deepening
> target. See `../RECODER-MODULES.md` §4 TERMINAL.

**Interface:** `createSession · attach · panes · layout · attention · send · health`

## Shipped engine MCP tools

> **SHIPPED — tmux introspection (real-bound, degrade-truthful).** The tmux
> engine now surfaces read-only introspection over the MCP host:
> `tmux.list_sessions · tmux.list_windows · tmux.list_panes · tmux.capture_pane · tmux.server_info`.
> These let an agent enumerate the live control-mode surface and read pane
> buffers without steering. Any engine down → that facet reports down, never
> fakes success.

> **SHIPPED — dmux layout tools (real-bound, degrade-truthful).** The dmux
> engine now exposes its pane/layout brain over the MCP host:
> `dmux.layout_presets · dmux.panes_list · dmux.panes_create · dmux.layout_apply`.
> This is the first slice of dmux's fuller pane/layout/streaming/worker brain
> called out as the deepening target above.

## Shipped conductor run-plane features

The terminal substrate lives inside the CONDUCTOR domain, and the conductor
run-plane now ships the following workspace features on top of it (conductor
domain API + the Wave `recoder-*` desktop views under
`apps/desktop/app/frontend/app/view/recoder/`; the old Preact "cockpit" SPA was
deleted):

> **SHIPPED — Checkpoints.** Snapshot a workspace's git + context, restore it, or
> branch a fresh workspace from it:
> `POST/GET /api/conductor/workspaces/:id/checkpoints · POST /:cid/restore · POST /:cid/branch`.

> **SHIPPED — Multi-agent compare + convergence.** View parallel-agent runs
> side-by-side and converge them into one trusted merge:
> `GET /api/conductor/workspaces/compare?taskGroup= · GET /api/conductor/workspaces/:id/siblings`.
> Desktop surface (Wave `recoder-*` shell): the board (`recoder.tsx`) opens the
> compare panel `RecoderComparePanel`
> (`apps/desktop/app/frontend/app/view/recoder/recoder-compare.tsx:526`), which
> renders each sibling's readiness/PR chip and embeds the convergence picker
> `ConvergePanel` (`recoder-converge.tsx:338` — per-contested-path winner picker
> + truthful "Synthesize" auto 3-way merge). The workspace terminal itself is the
> Wave block view `RecoderTerminalView` (`recoder-terminal.tsx:141`, registered via
> `recoder-terminal-model.ts`), opened over the shared tmux server by
> `openWorkspaceTerminal` (`recoder-open-terminal.ts:188`).

> **SHIPPED — dmux worktree-bound compare grid + attach hint (item 26).** The dmux
> LAYOUT brain arranges the F3 parallel-run group into an operator grid:
> `POST /api/conductor/workspaces/compare/:taskGroup/grid` builds a dedicated
> `recoder-group-<taskGroup>` tmux session with **one pane per sibling, EACH pane
> cwd'd to its OWN worktree** (`engines.dmuxLayout().buildWorktreeGrid`, consumed
> through the conductor `WorkspaceGridPort` / `dmux-grid.adapter.ts`). It is a
> GOVERNED write (`workspace.grid`) and NEVER splits/moves/links a live agent
> session, so a running run is never disrupted. The compare read model also
> carries a READ-ONLY attach hint on `CompareView.grid`.
>
> **Attach hint is DESKTOP-ONLY (tenant gate).** `dmux <repoPath>` launches a
> console over the shared tmux server that renders **all** `recoder-*` sessions
> box-wide (no tenant partition), so the raw `attachCommand` is emitted ONLY in
> the single-tenant desktop composition — the desktop supervisor sets
> `CONDUCTOR_DESKTOP_SINGLE_TENANT=1` (→ `config.conductor.desktopSingleTenant` →
> `createDmuxGridAdapter({ singleTenant })`). On shared/prod it is withheld; the
> `visibleSessions` list (intersected to the group) is tenant-safe and always
> emitted. Degrade-truthful: dmux absent / not built ⇒ no grid + no attach hint,
> the compare/parallel read model STILL returns (never a fabricated layout, never
> blocks a compare).
>
> **Flip-gate for shared/prod:** flip the shared control-mode default (below) and
> emit `attachCommand` on shared/prod only after a per-run control-mode client
> budget + teardown-on-idle lands; until then both stay truthfully opt-in
> (desktop-only), fully wired one composition flag away.

> **Control-mode stays opt-in (desktop-only default).** The real-time tmux
> `-CC %output` observer is default OFF everywhere (`config.conductor.tmuxControlMode`
> false; the poll tailer remains the sole liveness/exit-code authority). Only the
> single-tenant desktop composition flips it ON (`CONDUCTOR_TMUX_CONTROL_MODE=1`),
> the same composition signal that emits the dmux `attachCommand`. Shared/prod
> stays opt-in until a per-run client budget exists (one persistent extra
> control-mode client per live run is unbounded on a shared multi-tenant box).

> **SHIPPED — Board search / history.** Search and filter the workspace board and
> read archived runs:
> `GET /api/conductor/workspaces?q=&repo=&agent=&state=&archived= · GET /api/conductor/workspaces/archived`.
> Desktop surface: the board filter/command-palette in the Wave shell
> (`recoder.tsx`, `recoder-command-palette.tsx`, `recoder-board-logic.ts`).

> **SHIPPED — Repo setup + PR status.** Run a per-repo setup script on worktree
> create, and read live PR status via `gh`:
> `GET /api/conductor/workspaces/:id/pr-status`.
> Desktop surface: PR chip in the compare panel `RecoderComparePanel`
> (`recoder-compare.tsx:91-98`). The per-repo setup script is a backend/conductor
> worktree-create hook; the current Wave shell exposes no dedicated repo-settings panel.

> **SHIPPED — Diff review comments.** Accept line-anchored review feedback on a
> workspace's diffs and route comments back into the agent loop via
> `POST /api/conductor/workspaces/:id/review-comments` (gated conductor write).
> The review loop composes diff context (file/line anchors) into a structured steer
> prompt that focuses the agent on specific change requests, routing through either
> a live run's `steer` seam or a new run's `planLaunch` (via the conductor
> `ConductorPlanPort`). Desktop surface: review surface TBD (Wave shell).

## Shipped public workspace MCP tools

> **SHIPPED — agent-facing workspace tools.** The governed A2A/MCP surface exposes
> the public workspace verbs agents call to drive the conductor run-plane (registered
> in `mcp/recoder-a2a-server.js`): `recoder_workspace_create` (provision a coding
> workspace), `recoder_workspace_status`, `recoder_workspace_diff`,
> `recoder_workspace_merge`, and `recoder_workspace_events`. These are the stable
> public ids; the conductor domain API endpoints above are the internal governed
> bindings behind them.

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../RECODER-MODULES.md §TERMINAL.
