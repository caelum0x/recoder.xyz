# Wave → Desktop Fusion (full move, wave shell boots)

**Date:** 2026-07-14
**Status:** Approved design, pending spec review
**Owner decision trail:** desktop is the ONE app; wave + social + all 12 modules fold into it (mobile deleted). This spec covers the first sub-project: wave → desktop. Sub-projects 2–4 (module edge foundation, cockpit module panels, social → desktop) get their own specs.

## Goal

`apps/wave` (the Waveterm fork: Go `recoder-server` + Electron `emain/` + React `frontend/`) is **moved wholesale into `apps/desktop`** and becomes the desktop app's shell. Wave's UI is the terminal surface; the cockpit rides inside it. `apps/wave` ceases to exist. Full-fusion bar for v1:

1. App boots via wave's Electron main from `apps/desktop`.
2. Embedded Node backend (conductor/agent-os) spawns alongside the Go server, health-gated.
3. Cockpit appears as a view inside wave's UI.
4. A conductor workspace opens as a live wave terminal block (`tmux attach`).
5. Wave's AI panel round-trips through the backend's OpenAI-compatible gateway.
6. Old cockpit terminal surfaces are retired.
7. User-facing wave branding becomes Recoder.

## Grounding facts (verified 2026-07-14)

- **Wave frontend↔host coupling is one preload contract** (`window.api` / `ElectronApi`, `frontend/types/custom.d.ts:80-139`), endpoints via env handshake (`WAVE_SERVER_WEB_ENDPOINT`/`WAVE_SERVER_WS_ENDPOINT` from the Go server's `WAVESRV-ESTART` stderr line, `emain/emain-wavesrv.ts:108-124`), auth via `X-AuthKey` session-interceptor (`emain/authkey.ts:15-23`).
- **Wave tabs are `WebContentsView`s** (`emain/emain-tabview.ts:118`), `webviewTag: true` — a native mechanism for hosting the cockpit SPA as a view.
- **Wave's AI already defaults to our gateway:** default modes target `http://127.0.0.1:3100/api/gateway/v1/chat/completions` (`pkg/aiusechat/uctypes/uctypes.go:13`, `pkg/wconfig/defaultconfig/waveai.json`), overridable via `WAVETERM_WAVEAI_ENDPOINT`. The Go server makes the LLM call server-side (`pkg/web/web.go:454`).
- **Backend gateway exists but does not stream:** `POST /api/gateway/v1/chat/completions` (`backend/src/gateway/openai-compat.routes.ts`) returns 400 for `stream:true`; auth = `Authorization: Bearer <sk_ key>`; governed TensorZero underneath.
- **Desktop's supervisor is the proven sidecar pattern:** `apps/desktop/backend-supervisor.js` — port pick (prefers 3100), per-install secrets, `sk_` key mint, `STRICT_AUTH=true`, health poll of `/api/conductor/health`, crash restart with backoff.
- **Conductor join point:** every Workspace carries tmux `sessionName` (`recoder-<id>`); the pinned tmux binary resolves via `CONDUCTOR_TMUX_BIN` → `modules/terminal/tmux/tmux` (`backend/src/conductor/tmux-path.ts`).
- **Surfaces to retire:** cockpit panel-registry entries `sessions` (SessionsPanel) + `dmux` (DmuxPanel), `SessionTerminal` HTTP fallback, and old desktop `main.js` node-pty `terminal:*` IPC bridge (`main.js:2707-2886`).

## Design

### 1. The move

- `git mv` wave's tree into `apps/desktop/` so history is preserved. Desktop's superseded shell files (`main.js`, `preload.js`, `backend-supervisor.js`, build scripts, assets) are moved to `apps/desktop/legacy-shell/` during the transition (deleted at the end of this sub-project once their logic has migrated), so nothing is lost mid-flight.
- Collisions resolved in wave's favor: `package.json`, `dist/`, `assets/`, `node_modules`, electron-builder config, `tsconfig.json`, `vitest.config.ts` at the root are wave's. Cockpit keeps its own nested `cockpit/package.json` build exactly as today.
- `go.mod` module path (`github.com/recoder/recoder-terminal`) is unchanged; `Taskfile.yml` and `electron.vite.config.ts` run from `apps/desktop/`.
- **Gitignore landmine check (mandatory):** after the move, `git status --ignored` sweep over `apps/desktop/` to confirm no wave source/asset is hidden by broad ignore rules (`build/`, `public/`, `*secret*`, `*token*` — these have silently hidden wave files before).

### 2. What survives from old desktop

- **Cockpit view inside wave.** `apps/desktop/cockpit/` continues to build to `cockpit/dist/index.html`. Wave's shell exposes it as a dedicated view (WebContentsView or webview block) with the runtime config injected the same way old `main.js` did (base64 `--recoder-cockpit-config=` additionalArguments + `window.__RECODER_COCKPIT_RUNTIME__` for live re-point).
- **Backend supervisor adopted into emain.** `backend-supervisor.js` logic moves into wave's boot (`emain.ts appMain()`): after (or parallel with) `runWaveSrv()`, spawn the embedded Node backend (dev: `tsx backend/src/server.ts`; packaged: `ELECTRON_RUN_AS_NODE=1 node dist/server.js`), with the existing port-pick / secret-persist / key-mint / health-gate / restart-budget behavior intact. The Go server and Node backend are independent children; neither blocks the other's readiness, and health is reported truthfully per child.
- **Auth + deep links.** Old main.js login flow (recoder.xyz auth, OAuth/device popups) and `openCockpitView` deep-link handling migrate into emain. Everything else in old main.js retires.

### 3. Conductor wiring (workspace → wave block)

- From the cockpit view, "open workspace as terminal" creates a wave block whose controller runs `tmux attach -t <workspace.sessionName>` with cwd = worktree path, via wave's RPC (block-create with a cmd controller).
- The trigger path: cockpit (inside wave) → wave RPC. Cockpit gains a small bridge for this (exposed by the wave shell to the cockpit view — mechanism decided at plan time: preload API on the cockpit view or a loopback wsh call).
- The Go server's spawn env must include the pinned tmux bin on PATH / `CONDUCTOR_TMUX_BIN` so wave blocks attach to the SAME tmux server the conductor uses.

### 4. AI panel → backend gateway

- emain sets `WAVETERM_WAVEAI_ENDPOINT` to the embedded backend's actual URL (`http://127.0.0.1:<port>/api/gateway/v1/chat/completions`) once the backend is healthy — covers the non-3100 port case.
- The minted `sk_` key is provided as the AI token so the gateway's `authenticateRequest` passes (wired via wave's AI mode config: `ai:apitoken`, apitype `openai-chat`).
- **Backend work item:** implement SSE streaming in `openai-compat.routes.ts` (currently 400 on `stream:true`). Until it lands, wave AI modes set `stream:false` degradation only if wave supports non-streaming; otherwise streaming is a blocking dependency of this sub-project.

### 5. Retirement

- Remove cockpit panel-registry entries `sessions` + `dmux` (and their `CockpitView` ids), `SessionTerminal`, and `DmuxPanel`/`SessionsPanel` components; `WorkspaceCenter`/`WorkspaceDetail` swap their embedded terminal for the "open as wave block" action (§3).
- Old desktop node-pty bridge and `RecoderTerminal` xterm component are deleted with `legacy-shell/`.

### 6. Rebrand (user-facing only)

- Icons/assets: dock/app icon, DMG background, in-app logos → the geometric 3D cube Recoder mark (canonical `logo.png`). Do NOT use `recoder-symbol.svg`/`Logomark.svg`/orange-purple "R"/old Kortix marks.
- Strings: product/menu/About/AI-panel naming ("Wave", "Wave AI", waveterm.dev URLs) → Recoder equivalents.
- Legal attribution preserved: `ACKNOWLEDGEMENTS.md`, `NOTICE`, `LICENSE` stay intact.
- **Non-goal (v1):** internal identifiers (`WAVETERM_*` env vars, `wave*` Go packages, `wsh` binary name, config-dir names) keep their names — invisible to users, high breakage risk.

## Error handling / truthful health

- Each spawned child (Go server, Node backend) reports up|down independently; the shell surfaces both. No fake readiness: cockpit view shows the backend-unavailable state it already has; wave shows its own server state.
- If the Node backend fails to mint a key or gate healthy, the cockpit view degrades exactly as the old supervisor did (FAILED phase, no silent retry loop beyond the restart budget).

## Verification (v1 acceptance)

1. `task build` (Go server + electron-vite) green from `apps/desktop/`; cockpit `pnpm build` green.
2. App boots: wave UI appears, cockpit view opens, both children healthy.
3. Create a workspace in cockpit → wave block attaches to its tmux session; typing reaches the agent; block survives app restart (tmux + wave durability).
4. AI panel chat round-trips through `POST /api/gateway/v1/chat/completions` with the minted key (streaming per §4 resolution).
5. `sessions`/`dmux` panels gone from nav; no references to retired components; cockpit tests pass.
6. `git status --ignored` shows no hidden wave files under `apps/desktop/`; `apps/wave/` no longer exists.
7. User-facing audit: no "Wave" strings/icons in the running UI (menus, About, dock, AI panel).

## Risks

- **Two-child boot complexity** in emain (wave quits the app when its Go server dies — that policy must NOT apply to the Node backend child; backend death degrades the cockpit view only).
- **Streaming gateway** is net-new backend work on the AI path.
- **Cockpit-inside-wave bridge** (config injection + RPC trigger) is the main novel glue; everything else reuses proven code.
- **Disk pressure:** the move + rebuilds on a near-full APFS volume; prune before building.
