# Recoder Terminal — a fork of Wave Terminal

`apps/wave` is **Recoder's terminal-native shell (L3)**, forked from
[**Wave Terminal**](https://github.com/wavetermdev/waveterm) (© Command Line Inc, **Apache-2.0**).
Per the architecture decision record ([`docs/architecture/RECODER-ENGINES.md` §27](../../docs/architecture/RECODER-ENGINES.md)),
Wave is the fork base because its **block model IS Recoder's cockpit**: a grid where each block is a
terminal (a parallel agent's real TUI) or a web widget (diff / review / board / approvals).

## Attribution (Apache-2.0)
This is a derivative work of Wave Terminal. The upstream `LICENSE`, `NOTICE`, and all source
copyright headers are preserved unchanged, as the license requires. Only the **product identity**
(`name`, `productName`, `appId`) is rebranded to Recoder.

## What this fork is (and isn't)
- **Is:** L3 only — the terminal-native surface. It renders blocks; a block can be a live agent
  session or a Recoder control-plane widget.
- **Isn't:** an engine. `docker-backend` remains THE control plane; the 16 engines + governance + the
  service fleet mount behind it **unchanged** (RECODER-ENGINES §10/§27). A fork is a surface swap,
  never an engine swap.

## Integration seam
Wave's frontend resolves its backend over env vars (`frontend/util/endpoints.ts`):
`WAVE_SERVER_WEB_ENDPOINT` / `WAVE_SERVER_WS_ENDPOINT` → its Go `wavesrv`. Recoder integration:
1. Keep `wavesrv` for block/terminal/layout management (its strength).
2. Add a **Recoder conductor bridge**: blocks that call `docker-backend` `/api/conductor` (create/
   observe/steer workspaces) and render the workspace's tmux session as a terminal block, plus
   widget blocks for diff/review/approvals over `/api/agent-os` + `/api/mcp`.
3. Point identity/auth at `recoder.xyz` (device-flow), reusing `packages/distribution`.

## Build / run
The conductor bridge has landed: `frontend/app/view/recoder/` (`recoder-endpoints.ts`,
`recoder-model.ts`, `recoder.tsx`) registers a **`recoder`** block in `blockregistry.ts`, and
`pkg/wconfig/defaultconfig/widgets.json` ships a `defwidget@recoder` so the conductor view is a
first-class, launchable widget in the shell. The view fetches `/api/conductor/workspaces` from
`getRecoderBackendUrl()` — `window.__RECODER_BACKEND_URL__`, default `http://127.0.0.1:3100`.

`node_modules` is installed. Running the shell is a **two-part build** (Go backend + Electron/React
frontend). It is heavy and produces a GUI, so it is a developer/CI step, not something verified here:

```bash
cd apps/wave

# 1. Build the Go backend (wavesrv). Canonical path uses Task:
brew install go-task            # if `task` is not installed
task build:backend:quickdev     # arm64 macOS, no codegen churn → dist/bin/wavesrv.arm64
# (or the full `task build:backend` for all arches + wsh)

# 2. Launch the Electron dev shell (spawns the wavesrv built above):
RECODER_BACKEND_URL=http://127.0.0.1:3100 npm run dev
```

> **Disk note:** the workstation APFS volume runs ~98% full; a full `task build` (Go all-arches +
> `electron-vite build`) can ENOSPC. Prefer `build:backend:quickdev` + `npm run dev` (dev server, no
> packaged artifact) and reclaim space first (`pnpm store prune`) if a build fails on space.

Until this shell is the primary surface, the shipping app stays `apps/desktop` (the terminal-first
Preact cockpit). **Not yet verified:** a full GUI launch — the bridge is wired + type-consistent with
Wave's `ViewModel` contract, but the heavy two-part build has not been run in this environment.

## Roadmap (L3 migration, after the engine phases)
1. Bridge blocks → `docker-backend` conductor (terminal block per workspace).
2. Widget blocks: diff/review, board, approvals, MCP tools.
3. Auth via `recoder.xyz` device-flow.
4. Rebrand assets/branding fully; ship as the primary shell when the backend is massive enough to warrant it.
