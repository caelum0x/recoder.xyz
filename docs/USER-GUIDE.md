# User Guide — The Desktop Cockpit

The **Recoder Cockpit** is the desktop control surface for the Conductor: a place to
launch coding agents into isolated git worktrees, watch them work live, review their
diffs, and ship the result (PR, merge, archive). Every panel renders **only real
backend state** — there are no mock rows. An empty backend yields an explicit empty
state, and an unreachable backend shows a truthful banner instead of fabricated work.

> Source: `apps/desktop/cockpit/src/`. The cockpit shell is
> [`App.tsx`](../apps/desktop/cockpit/src/App.tsx); all components live under
> `apps/desktop/cockpit/src/components/`.

Related reading:
- [CONDUCTOR-ARCHITECTURE.md](./CONDUCTOR-ARCHITECTURE.md) — the conductor/worktree/tmux model the cockpit drives.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — overall platform architecture.

---

## The shell at a glance

The cockpit window (`App.tsx`) is composed top-to-bottom of:

| Region | What it shows | Source |
|--------|----------------|--------|
| **Topbar** | Brand, backend URL, view tabs, `Reconcile`, `New workspace` | `App.tsx` |
| **Health strip** | Live runtimes, substrates, connectors | [`HealthStrip.tsx`](../apps/desktop/cockpit/src/components/HealthStrip.tsx) |
| **Main view** | The selected tab's surface (Board is the default 3-pane) | `App.tsx` |

The topbar exposes these view tabs: **Board**, **Sessions**, **dmux**, **Connectors**,
**Substrates**, **Live Events**, **Governance**, **Brain**, **Policy**, **Memory**.
This guide focuses on the **Board** view — the primary agent cockpit. The other tabs
are operator panels for the same backend.

### Health strip

`HealthStrip` polls three endpoints every 10s and shows a colored pill per item —
green (`pill-good`) when available/connected, red (`pill-bad`) otherwise:

- **Runtimes** — `GET /api/conductor/runtimes`: which agent CLIs are installed (e.g. `claude`, `codex`).
- **Substrates** — `GET /api/conductor/substrates`: which execution substrates are registered/available.
- **Connectors** — `GET /api/connectors`: which chat-channel connectors are configured/connected.

Each group surfaces its own real error or empty state ("none registered", "no channels
configured") rather than implying everything is fine.

### Backend banners

When the Board view loads workspaces (`GET /workspaces`, polled every **2s**), `App.tsx`
distinguishes three failure modes truthfully:

- **Backend unreachable** → red banner, no workspaces shown.
- **Unauthorized (401/403)** → the [`SignIn`](../apps/desktop/cockpit/src/components/SignIn.tsx) panel, distinct from "unreachable".
- **Other list error** → a warn banner with the backend message.

The **Reconcile** button calls `api.reconcile()` then refreshes the board — a best-effort
resync of cockpit state against the conductor's record.

---

## The 3-pane Board layout

The Board view (`main.main-3pane` in `App.tsx`) is a Conductor-style three-pane cockpit:

```
┌──────────────┬─────────────────────────────┬──────────────────────┐
│  LEFT        │  CENTER                     │  RIGHT               │
│  Workspaces  │  Agent activity + summary   │  Diffs + Terminal +  │
│  sidebar     │  + steer input, over the    │  PR / Merge / Archive│
│  (by repo)   │  lifecycle board            │  (selected workspace)│
└──────────────┴─────────────────────────────┴──────────────────────┘
```

The CENTER and RIGHT panes only appear once a workspace is **selected** (by clicking a
sidebar row or a board card). With nothing selected, the center shows the lifecycle
board full-width (or an empty/create prompt).

### LEFT — Workspaces sidebar

[`WorkspaceSidebar.tsx`](../apps/desktop/cockpit/src/components/WorkspaceSidebar.tsx)
renders the live workspace list **grouped by repo** (`groupWorkspacesByRepo` over the
real `GET /workspaces` payload). Each row shows:

- the **branch** name,
- a **+N/-N diff stat** (parsed only from the backend's delivery summary; absent until there's work),
- a truthful **state badge** (`running`, `setting up`, `ready`, `awaiting review`, …),
- the **runtime** id.

A `+ New workspace` button sits in the header; an empty backend shows "No workspaces yet"
with a *Create your first workspace* button. A row whose failure is a **write-lock
collision** is styled distinctly and its badge reads `merge-conflict` (see
[Lock conflicts](#lock-conflicts)).

### CENTER — Agent chat + summary

[`WorkspaceCenter.tsx`](../apps/desktop/cockpit/src/components/WorkspaceCenter.tsx)
composes three things for the selected workspace:

1. **Header** — state badge, branch, and meta line: `runtime · substrate · live (2s) / terminal (15s)`.
2. **"What changed"** — a truthful summary read from the persisted delivery summary in
   `workspace.metadata` (changed-file count + `+/-` and the `git diff --stat` text). Never
   fabricated; shows "No reviewable changes yet" until the agent produces work.
3. **Agent activity** — the live [`EventLog`](#live-event-streaming), merging polled
   history with the live stream.
4. **Steer input** — a text box at the bottom to steer the running agent.

**Steering:** the input forwards your message to the live tmux pane via
`POST /sessions/:id/keys` (the backend appends Enter). It is **only enabled when the
workspace has an attached tmux session AND is still live**. Otherwise it's disabled with a
truthful reason ("No tmux session attached…" or "Workspace is *merged* — the agent is no
longer running"), so the UI never implies it can steer a stopped agent.

### RIGHT — Diffs, terminal, PR/Merge/Archive

[`WorkspaceDetail.tsx`](../apps/desktop/cockpit/src/components/WorkspaceDetail.tsx) is the
detail panel for the selection. Its header shows the state badge, branch, runtime,
substrate, and a truncated workspace id, plus a meta block (Task, Base, Worktree,
Session). Below that are the **review actions** and a **tabbed body** (Output / Diff /
Terminal).

---

## Workspace lifecycle states

States come from `WorkspaceState` in
[`types.ts`](../apps/desktop/cockpit/src/types.ts) (mirroring
`packages/agent-os/src/domain/workspace.ts`). The board groups them into columns and the
UI gates actions per state — both defined in
[`workspace-state.ts`](../apps/desktop/cockpit/src/lib/workspace-state.ts).

| State | Board column | Tone | Meaning |
|-------|--------------|------|---------|
| `created` | Queued | neutral | Workspace record created |
| `setting_up` | Queued | progress | Worktree/session being provisioned |
| `ready` | Queued | progress | Provisioned, about to run |
| `running` | Running | active | Agent is actively working |
| `awaiting_approval` | Running | warn | Agent paused for an approval |
| `changes_requested` | Running | warn | Reviewer asked for changes |
| `awaiting_review` | Review | warn | Work ready for human review |
| `merging` | Review | progress | Merge in progress |
| `merged` | Done | good | Branch merged |
| `failed` | Done | bad | Run failed (incl. lock conflicts) |
| `cancelled` | Done | neutral | Run cancelled |
| `archived` | Done | neutral | Workspace archived |

> Board columns are `BOARD_COLUMNS` and tones are `STATE_TONE` in `workspace-state.ts`.
> `isLive(state)` is true for everything except `merged`/`failed`/`cancelled`/`archived` —
> this drives the faster 2s poll cadence and whether steering is allowed.

### The lifecycle board

[`Board.tsx`](../apps/desktop/cockpit/src/components/Board.tsx) renders one column per
group (Queued / Running / Review / Done) and filters the live workspaces into them. Each
card shows the state badge, runtime, branch, substrate, and a relative `updatedAt`
("3m ago"). Clicking a card selects that workspace. Empty columns render `—`.

---

## Live event streaming

[`EventLog.tsx`](../apps/desktop/cockpit/src/components/EventLog.tsx) renders the agent's
`RunEvent` stream. Each line shows a timestamp, the event `type`, and its message. It
handles `log` output and lifecycle markers (`state_transition`, `completed`, `failed`,
etc.). The newest line streams in **character-by-character** (the shared Preact smooth-text
hook); this degrades safely to static text where `requestAnimationFrame` is unavailable
(headless hosts).

The center pane combines **two** sources for low latency
(`WorkspaceCenter.tsx`):

- **Polled history** — `GET /workspaces/:id/events`, every **2s** while live (15s once terminal).
- **Live stream** — `api.openStream(...)` via the shared `@recoder/conductor-ui`
  `ConductorClient`, which upgrades to the conductor WS endpoint when available and falls
  back to polling captured pane output.

The two are merged and de-duplicated by `eventId` (oldest-first), and the retained
streamed buffer is capped at 200 events so a long run doesn't grow unbounded. The stream
is inert for non-live workspaces.

> The RIGHT pane's **Output** tab uses the same `EventLog` against the polled
> `GET /events` feed.

---

## Reviewing diffs

In `WorkspaceDetail`, the **Diff** tab renders
[`DiffView.tsx`](../apps/desktop/cockpit/src/components/DiffView.tsx), which shows the real
`GET /workspaces/:id/diff` output:

- a **summary** line (`N files changed`, `branch ← baseRef`),
- the **`git diff --stat`** block,
- the **unified patch** with line-level coloring (additions / deletions / hunks / meta),
- an **Untracked files** list.

The diff is fetched **on demand** (only when the Diff tab is open) and polled while open
(every 4s live, 30s terminal). The Diff tab is **disabled until there's reviewable work** —
`canViewDiff(state)` is true for `running`, `awaiting_review`, `awaiting_approval`,
`changes_requested`, and `merging`. If the diff endpoint errors (e.g. no worktree), the
error is surfaced; it is never hidden.

---

## The live terminal

The **Terminal** tab renders
[`SessionTerminal.tsx`](../apps/desktop/cockpit/src/components/SessionTerminal.tsx), which
attaches to the workspace's real tmux session. The tab is disabled when no session is
attached. There are two real backends, and which one is active is shown explicitly:

- **Local pty (desktop app)** — when the Electron node-pty bridge is present, the cockpit
  spawns a local terminal and runs `tmux attach -t <session>`, so you type straight into
  the live agent pane. Keystrokes including `Ctrl+C`, arrows, `Tab`, and `Enter` are
  forwarded. (The conductor reports the pinned `tmuxBin` via `GET /health`, which the
  detail panel passes through so the attach uses the same binary as the Sessions view.)
- **HTTP fallback (plain browser)** — polls `GET /sessions/:id/output` (~2s) and sends
  keystrokes via `POST /sessions/:id/keys`. Includes a `^C` button. The status pill makes
  it clear this is the HTTP path (`tmux send-keys`, Enter appended server-side).

Detaching the local terminal kills only the local pty — it does **not** kill the tmux
session itself, so the agent keeps running.

---

## Merge, PR, and approvals

The **review actions** in `WorkspaceDetail` are three buttons, each **enabled only when the
backend state machine allows it** (gating in `workspace-state.ts`, mirroring the backend
`ALLOWED_TRANSITIONS`). Errors from the backend are shown inline; success shows a short
note (e.g. "Merged.") and refreshes the board.

| Action | Endpoint | Enabled when | Gate |
|--------|----------|--------------|------|
| **Open PR** | `POST /workspaces/:id/pr` | `running`, `awaiting_review`, `changes_requested` | `canOpenPr` |
| **Merge** | `POST /workspaces/:id/merge` (squash) | `awaiting_review` only | `canMerge` |
| **Archive** | `POST /workspaces/:id/archive` | any state except `archived` | `canArchive` |

- **Open PR** sends a title of `Conductor: <branch>`. When a PR exists, its URL is read
  from `workspace.metadata.pr.url` and shown as a clickable **PR:** link.
- **Merge** uses the `squash` strategy and is intentionally only offered at
  `awaiting_review` — the point at which work is up for human review.
- **Archive** is destructive-styled (`btn-danger`); the backend cancels the run first
  where needed.

**Approvals & change requests:** the lifecycle includes `awaiting_approval` and
`changes_requested` (both `warn` tone, in the **Running** column). These represent an agent
paused for approval or a reviewer-requested change. The cockpit surfaces them truthfully in
the badges, board, and event stream (e.g. `approval_requested` / `needs_input` event
types). Governance and approval workflows are managed from the **Governance** and **Policy**
tabs; the Board view shows their state rather than owning it.

### Lock conflicts

When a launch is refused because another active workspace already holds overlapping write
scope, the conductor transitions the workspace to `failed` with a structured
`metadata.lockConflicts` array and a `write-lock conflict: …` error message. The cockpit
detects this (`lockConflict()` in `workspace-state.ts`) and renders it **distinctly** — a
`merge-conflict` badge in the sidebar and a `🔒 collision` badge plus the conflict message
on the board card — so the operator can see the safety moat working: the launch was
**refused, not silently lost**. No new endpoint is needed; the signal is already in the
`GET /workspaces` payload.

---

## Creating a workspace

Click **New workspace** (topbar or sidebar) to open
[`NewWorkspaceForm.tsx`](../apps/desktop/cockpit/src/components/NewWorkspaceForm.tsx). It
populates its options from real backend availability:

- **Runtimes** — `GET /runtimes`; unavailable CLIs are shown disabled (`<bin> not installed`).
- **Substrates** — `GET /substrates`; unavailable substrates show their reason.

Required fields are **Repo path**, **Prompt**, and **Runtime**; optional fields are Model,
Substrate, Space ID, Project ID, Created by, and Base ref. In the desktop app a native
**Choose folder…** picker is available; in a plain browser you type the absolute path.

On submit the form `POST`s `/workspaces` with the exact body the handler requires
(`spaceId`, `projectId`, generated `taskId`, `repoPath`, `runtimeId`, `createdBy`, and the
`prompt`), then refreshes the board. Backend rejections (unreachable, 4xx) are shown with
their real status and message — the form never claims success it didn't get.

---

## Cadence summary

| Data | Endpoint | Live cadence | Terminal cadence |
|------|----------|--------------|------------------|
| Workspace board | `GET /workspaces` | 2s | 2s |
| Cockpit health | `GET /health` | 15s | 15s |
| Health strip | runtimes / substrates / connectors | 10s | 10s |
| Event log | `GET /workspaces/:id/events` | 2s | 15s |
| Diff (tab open) | `GET /workspaces/:id/diff` | 4s | 30s |
| HTTP terminal output | `GET /sessions/:id/output` | 2s | — |

All cadences are sourced from the component code referenced above. "Live" means the
workspace state is not one of `merged`/`failed`/`cancelled`/`archived` (`isLive`).
