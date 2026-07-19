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
domain API + cockpit UI):

> **SHIPPED — Checkpoints.** Snapshot a workspace's git + context, restore it, or
> branch a fresh workspace from it:
> `POST/GET /api/conductor/workspaces/:id/checkpoints · POST /:cid/restore · POST /:cid/branch`.
> Cockpit surface: `CheckpointsPanel`.

> **SHIPPED — Multi-agent compare.** View parallel-agent runs side-by-side:
> `GET /api/conductor/workspaces/compare?taskGroup= · GET /api/conductor/workspaces/:id/siblings`.
> Cockpit surface: `ComparePanel` + `CompareGroupsBar`.

> **SHIPPED — Board search / history.** Search and filter the workspace board and
> read archived runs:
> `GET /api/conductor/workspaces?q=&repo=&agent=&state=&archived= · GET /api/conductor/workspaces/archived`.
> Cockpit surface: `BoardSearch`.

> **SHIPPED — Repo setup + PR status.** Run a per-repo setup script on worktree
> create, and read live PR status via `gh`:
> `GET /api/conductor/workspaces/:id/pr-status`.
> Cockpit surface: `RepoSettings` + PR chip.

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../RECODER-MODULES.md §TERMINAL.
