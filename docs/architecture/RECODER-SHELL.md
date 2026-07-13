# Recoder Shell (L3) — the terminal cockpit

> **Status: built + builds end-to-end (2026-07-13). GUI not yet launch-verified.**
> `apps/wave` is Recoder's terminal-native shell — a fork of Wave Terminal (Apache-2.0), fully rebranded
> and turned into a **governed agent-control cockpit**, the way Cursor turned VSCode into an AI IDE. This
> doc is the reference for the cockpit: its blocks, the product loop, and how they reach the backend.

See also: [FORK.md](../../apps/wave/FORK.md) (fork mechanics, rebrand, build) · [RECODER-ENGINES.md](./RECODER-ENGINES.md)
(the backend the cockpit drives) · [RECODER-CAPABILITIES.md](./RECODER-CAPABILITIES.md).

## Thesis

Wave's **block model IS the cockpit**: a grid where each block is a terminal (a parallel agent's real TUI)
or a governed Recoder widget. We didn't build a chat UI over a scraped agent — the shell shows the *real*
agent, and layers control-plane widgets around it. The app **boots into Recoder** (`pkg/wcore/layout.go`
starter layout = the `recoder` conductor view, focused, + a terminal).

## The product loop

```
  New agent / Pick up issue ─▶ recoder-launch ─▶ (creates workspace)
        │                                              │
        ▼                                              ▼
  recoder (hub, workspace list) ──Session──▶ recoder-terminal (live TUI + message the agent)
        │                                              │
        ├──Review──▶ recoder-diff ──Merge / Create PR──┘
        └──Archive
  Observe: recoder-health · recoder-runs · recoder-board · recoder-memory
  Act:     recoder-tools (capability palette)      Configure: recoder-settings
```

## The blocks

Every block is a Wave `ViewModel` + component under `frontend/app/view/recoder*/`, registered in
`blockregistry.ts` + shipped as a `defwidget@recoder-*` widget. All fetch the backend via
`getRecoderBackendUrl()` (`recoder-endpoints.ts`) and are **degrade-safe** — backend down / non-2xx /
empty → a truthful neutral state, never a crash or a fabricated success.

| Block (view id) | Role | Backend |
|---|---|---|
| `recoder` | Hub: workspace list + getting-started readiness; per-row Session/Review/Archive; New-agent | `GET /api/conductor/workspaces` · `/health/full` · `/archive` |
| `recoder-terminal` | A workspace's **live agent TUI** (websocket) + a **message input** to direct the agent | `ws /workspaces/:id/stream` · `POST /workspaces/:id/message` |
| `recoder-launch` | Launch a coding agent: pick runtime + task → create workspace; reads meta prefill | `GET /runtimes` · `POST /workspaces` |
| `recoder-diff` | Review-before-merge: workspace diff + **Merge** + **Create PR** | `GET /workspaces/:id/diff` · `POST .../merge` · `.../pr` |
| `recoder-approvals` | Governance: list + Approve/Reject pending agent actions | `GET/POST /api/agent-os/approvals[...]` |
| `recoder-board` | Ready-work issue graph (beads); per-issue **Pick up** → launch prefilled | `GET /api/conductor/issues/ready` |
| `recoder-tools` | Capability palette: call governed engines (retrieval/pal/coordination/browser) | `POST /api/mcp/tools/:server/:tool/call` |
| `recoder-health` | Fleet/engine/agent readiness dashboard | `GET /api/conductor/health/full` |
| `recoder-memory` | Browse + search durable memory + candidates | `GET /api/agent-os/memory[/search]` |
| `recoder-runs` | Run + RunEvent activity log | `GET /api/agent-os/runs · /events` |
| `recoder-settings` | Configure the backend URL (localStorage) + Test connection | `GET /api/conductor/health` |

## Cross-block flow

Blocks open each other with Wave's `createBlock({ meta: { view, ... } })` (from `@/app/store/global`),
always in `onClick` handlers wrapped in try/catch (a failed open never crashes the view). A session opens
for a specific workspace via meta `"recoder:workspaceid"`; the launch form pre-fills from meta
`"recoder:prefilltask"` / `"recoder:prefillrepo"`. This is what turns 11 isolated blocks into one loop.

## The conductor bridge

`getRecoderBackendUrl()` resolves `localStorage('recoder:backendurl')` → `window.__RECODER_BACKEND_URL__`
→ `http://127.0.0.1:3100`. Auth: the shell fetches the loopback backend, which accepts anonymous on
localhost (migration mode), so no token is needed for the read/act endpoints the cockpit uses; write
actions that hit a delivery/approval gate return a truthful `409` the block surfaces (it never fakes a
success). The gated MCP route (`/api/mcp/.../call`) is loopback-reachable, so the capability palette works.

## Build / run — verified

```bash
cd apps/wave
task build:backend:quickdev     # Go backend → dist/bin/recoder-server.<arch>   (exit 0)
npm run build:dev               # electron-vite frontend + emain                (exit 0)
RECODER_BACKEND_URL=http://127.0.0.1:3100 npm run dev
```

## Honest state

Everything above is **source-level + full-build verified** (each block esbuild-clean; the whole
`electron-vite` build compiles them together; backend additions unit-tested). What is **NOT** verified:
the Electron **GUI has not been launched here**, so block *appearance* and live interaction aren't
eyeballed. The running-app pass (visual polish, the `wsh` CLI rename's shell-integration runtime, the app
icon, a packaged `.dmg`) is the remaining frontier — it needs the app on screen.
