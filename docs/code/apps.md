# apps/

> Area: **apps** — `/Users/arhansubasi/recoder.xyz/apps`
> Scope of this doc: the sibling apps in `apps/` (`agent-gateway`, `agent-worker`, `desktop`, `mobile`, and `wave`). Verified by reading source on 2026-07-01; **`apps/wave` added 2026-07-13**.
>
> **New surface (2026-07-13): `apps/wave`.** A fork of **Wave Terminal** (Apache-2.0), fully rebranded to
> Recoder and turned into the **L3 terminal shell + an 11-block governed cockpit** (launch → live agent
> TUI + message it → review diff → merge/PR → archive; plus board/health/runs/memory/tools/settings).
> It boots into Recoder, is cloud-decoupled (telemetry off, updater decoupled, AI → the governed
> gateway), and **builds end-to-end** (Go backend `task build:backend:quickdev` + electron-vite frontend,
> both exit 0). **Honest state:** this is source/build-verified only — the Electron **GUI has not been
> launched here**, so appearance/interaction is unverified; the `wsh`→`recoder` CLI rename, app icon, and
> a signed `.dmg` are deferred. Until it is the primary surface, the shipping app stays `apps/desktop`.
> Full reference: [RECODER-SHELL.md](../architecture/RECODER-SHELL.md) + [FORK.md](../../apps/wave/FORK.md).
> See §7 below.

## 1. Purpose

`apps/` holds **runnable surfaces** of the Recoder platform, as distinct from the reusable contract packages under `packages/` and the main Express service in `docker-backend/`. Two of these apps are headless Agent-OS process surfaces (`agent-gateway`, `agent-worker`) that wire the `@recoder/agent-*` contract packages into an HTTP/A2A server and a queue/workflow worker respectively. The other two are client surfaces: `desktop` is an Electron "cockpit" that can boot an embedded `docker-backend` and drive the conductor locally, and `mobile` is the Expo / React Native app.

These apps are intentionally thin: the gateway and worker re-export and compose contracts from `packages/agent-os`, `agent-events`, `agent-workflows`, `agent-runtimes`, etc., rather than owning task/approval/memory state themselves (consistent with the repo rule that runtimes are replaceable execution surfaces around Recoder-owned state). The desktop cockpit and mobile app are presentation/control surfaces that talk to a backend over HTTP/A2A.

## 2. Layout

| Subdir | Package name | Kind | What it holds |
|--------|--------------|------|---------------|
| `agent-gateway/` | `@recoder/agent-gateway` | ESM TS lib + optional server | Express app exposing Agent-OS HTTP resources, A2A routes, MCP registry, WebSocket agent sessions |
| `agent-worker/` | `@recoder/agent-worker` | ESM TS lib | Outbox queue/drain, workflow runner glue, runtime adapter registry — mounted by a host container |
| `desktop/` | `recoder-desktop` | Electron app | `main.js` Electron main process, `backend-supervisor.js` (embedded backend), `preload.js`, plus `cockpit/` (Preact UI) |
| `desktop/cockpit/` | `recoder-cockpit` | Preact (Vite/esbuild) UI | The conductor board / Agent-OS cockpit rendered inside Electron |
| `mobile/` | `recoder-mobile` | Expo / React Native | `app/` (expo-router screens), `lib/`, `api/`, `components/`, `contexts/`, `stores/`, native `ios/`+`android/` |
| `wave/` | Recoder Terminal (Wave fork) | Electron + Go + React | **L3 terminal shell.** `frontend/` (React + emain + preload; blocks under `frontend/app/view/recoder*/`), Go backend (`cmd/server`, `pkg/`; server binary `recoder-server`), `Taskfile.yml`, `public/logos/`. Go module `github.com/recoder/recoder-terminal`. See §7. |

Workspace membership (verified in root `pnpm-workspace.yaml`): `apps/agent-gateway`, `apps/agent-worker`, and `apps/mobile` are pnpm workspace members. **`apps/desktop` is NOT a workspace member** — it has its own `package-lock.json` (npm) and the cockpit installs with `pnpm install --ignore-workspace`. **`apps/wave` is likewise self-contained** (its own `node_modules` + Taskfile + Go modules; built with `task` + electron-vite, not `pnpm -F`).

### agent-gateway/src
- `index.ts` — barrel re-exports + optional standalone server (see Entry points)
- `http/agent-os-http.ts` — builds the Express app (`createAgentOsHttpApp`)
- `http/agent-os-resources.ts` — `/api/agent-os/*` resource router; constructs Agent-OS services
- `http/health.ts` — gateway health payload
- `a2a/` — A2A wire surface: `routes.ts`, `message-handler.ts`, `agent-card.ts`, `signed-envelope.ts`, `task-subscription.ts`, `agent-os-projection.ts`
- `mcp/mcp-registry.ts` — default MCP registry
- `websocket/agent-sessions.ts` — `AgentSessionRegistry`

### agent-worker/src
- `index.ts` — barrel re-exports; standalone run just logs a "mount me from the backend container" message
- `queues/outbox-queue.ts` — `OutboxQueue` interface (`next/ack/fail`)
- `activities/publish-outbox.ts` — `publishOutboxRecord` activity
- `schedulers/outbox-drain-scheduler.ts` — `drainOutbox(queue, publisher, limit)`
- `workflows/run-task-workflow.ts` — `runTaskWorkflow` / `runAgentOsWorkflow` (wraps `AgentOsWorkflowRunner`)
- `runtimes/runtime-registry.ts` — builds a `Record<string, RuntimeAdapterPort>` from `@recoder/runtime`

## 3. Entry points

**agent-gateway**
- `apps/agent-gateway/src/index.ts:21` — the `import.meta.url === ...` guard starts a standalone server: `createAgentOsHttpApp()` + `AgentSessionRegistry` + `createDefaultMcpRegistry`, listening on `AGENT_GATEWAY_PORT` (default `4317`), bound to `127.0.0.1` by default (`AGENT_GATEWAY_HOST` to override). It is primarily a library — `index.ts:5-18` re-exports the composable pieces.
- `apps/agent-gateway/src/http/agent-os-http.ts:12` — `createAgentOsHttpApp(state)` mounts the A2A router, `/api/agent-os` resource router, and `/health`.
- `apps/agent-gateway/src/a2a/routes.ts:41` — `createA2ARouter` (agent-card, `/api/a2a/message`, `/message/stream`, tasks, SSE `subscribe`, artifacts).

**agent-worker**
- `apps/agent-worker/src/index.ts` — a barrel; the run guard (`index.ts:7`) only prints a message. The worker is meant to be mounted by a host (the backend container), not run on its own.
- `apps/agent-worker/src/workflows/run-task-workflow.ts:28` — `runAgentOsWorkflow(input, ports)` is the main workflow driver.
- `apps/agent-worker/src/runtimes/runtime-registry.ts:66` — `buildRuntimeRegistry()` resolves real `@recoder/runtime` adapters per surface.

**desktop**
- `apps/desktop/main.js` — Electron main process (`"main": "main.js"` in package.json). Large file (~88 KB) including an IPC token-bucket rate limiter (`main.js:10`) and IPC handlers for fs/dialog/terminal/agent/a2a.
- `apps/desktop/backend-supervisor.js` — boots an embedded `docker-backend` on a free loopback port and hands the cockpit `{ backendUrl, apiKey }` (see header comment, lines 1-30).
- `apps/desktop/preload.js` — context-bridge preload.
- `apps/desktop/cockpit/src/main.tsx` / `App.tsx` — Preact cockpit entry.

**mobile**
- `apps/mobile/package.json:2` — `"main": "expo-router/entry"`; routes live in `apps/mobile/app/` (`_layout.tsx`, `index.tsx`, `home.tsx`, `conductor.tsx`, `tasks.tsx`, `billing.tsx`, `auth/`, `(settings)/`, …).
- `apps/mobile/api/config.ts` — backend URL resolution (`EXPO_PUBLIC_BACKEND_URL`, default `http://localhost:8000/v1`; Android emulator rewrites localhost → `10.0.2.2`).

## 4. Build / run / test

Commands are the **real** `scripts` entries from each `package.json`.

**agent-gateway** (`@recoder/agent-gateway`)
- `pnpm dev` → `tsx src/index.ts`
- `pnpm build` → `tsup src/index.ts --format esm --dts`
- `pnpm start` → `node dist/index.js`
- (no `test` script defined)

**agent-worker** (`@recoder/agent-worker`)
- `pnpm dev` → `tsx src/index.ts`
- `pnpm build` → `tsup src/index.ts --format esm --dts`
- `pnpm check-types` → `tsc --noEmit`
- `pnpm test` → `node --import tsx --test 'src/**/*.test.ts'` (node:test; e.g. `runtimes/runtime-registry.test.ts`)

**desktop** (`recoder-desktop`, npm-managed)
- `npm start` → `electron .`
- `npm test` → `vitest run` (config `vitest.config.js`; tests in `__tests__/`)
- `npm run build` → `electron-builder`; platform variants `build:mac` / `build:win` / `build:linux`; `build:mac` tries `build-signed.js` first
- `npm run build:cockpit` → `cd cockpit && pnpm install --ignore-workspace && pnpm run build`
- `npm run lint` / `lint:syntax` → `node --check` on each main-process JS file
- `npm run dev:boot-proof`, `smoke:prod`, `validate:release` → scripts in `scripts/`
- cockpit (`recoder-cockpit`): `pnpm build` → `node build.mjs`; `pnpm test` → `vitest run`; `pnpm check-types` → `tsc --noEmit`

**mobile** (`recoder-mobile`)
- `pnpm dev` → `expo start -c`; platform variants `android` / `ios` / `web`
- `pnpm test` → `jest --passWithNoTests` (config `jest.config.js`; tests in `__tests__/`)
- `pnpm typecheck` / `pnpm check` → `tsc --noEmit`
- `pnpm lint` → `node --check babel/metro config + prettier --check package.json`
- EAS builds: `android:build` → `eas build:dev --platform android`; local `android:build:local` → `npx expo run:android`
- CI helpers: `ci:preflight`, `ci:check`, `ci:check:noninteractive`, `ci:install-and-check`

## 5. Key patterns & contracts

- **Apps are glue over `@recoder/agent-*` contracts.** `agent-gateway` and `agent-worker` depend on workspace packages (`agent-os`, `agent-events`, `agent-instructions`, `agent-mcp`, `agent-runtimes`, `agent-workflows`, `agent-policy`, `oss-registry`, `ui-agent-os`, `runtime`) and re-export/compose them. They do not own canonical state.
- **API response envelope:** routes consistently use `{ success: boolean, data | error }` (e.g. `agent-gateway/src/index.ts:29`, `a2a/routes.ts:54-71`). Errors carry an optional `status` on the thrown `Error` to set the HTTP code.
- **A2A signed envelopes (fail-safe auth):** `a2a/routes.ts:25-39` unwraps every payload through `verifyGatewaySignedEnvelope`. Signature verification defaults to **required** — `RECODER_A2A_REQUIRE_SIGNATURE !== 'false'` — and the shared secret comes from `RECODER_A2A_SHARED_SECRET`. The inline comment documents that this was changed from a previous default-OFF auth-bypass. Treat changes here as security-sensitive.
- **A2A agent card:** `GET /.well-known/agent-card.json` returns extended fields only when `isExtendedAgentCardAuthorized(headers)` passes. Task streaming uses SSE via `/api/a2a/tasks/:taskId/subscribe` + `encodeServerSentEvent`.
- **Worker workflow contract:** `runAgentOsWorkflow` (`run-task-workflow.ts:28`) wraps `AgentOsWorkflowRunner` from `@recoder/agent-workflows`. Approval/tool/verification nodes default to **`status: 'waiting'`** handlers that emit `Approval`/`Artifact` records rather than auto-executing — external MCP/verification handlers must be injected via `ports`. Runtime nodes resolve through a `Record<string, RuntimeAdapterPort>` keyed by `runtimeId`/`adapterId`/`agentId`/`kind`.
- **Runtime registration is health-gated.** `runtime-registry.ts` only registers a surface (`recoder_code`, `claude_code`, `codex`, `opencode`, `gemini_cli`, `qwen_code`) when its `@recoder/runtime` driver health is not `offline`/`error`. Unavailable surfaces are skipped, never faked (matches the repo "never fake success" rule).
- **Outbox drain:** `drainOutbox` (`schedulers/outbox-drain-scheduler.ts:5`) pulls `OutboxRecord`s, publishes each, then `ack`s; failures call `queue.fail(outboxId, error)`. The `OutboxQueue` interface (`queues/outbox-queue.ts`) is just `next/ack/fail` — the host supplies the implementation.
- **Desktop is self-contained & defense-in-depth.** `backend-supervisor.js` mints a local platform `sk_` key with the same salt/`DATA_DIR` the spawned backend uses, polls `/api/conductor/health` until 200 (timeouts surfaced truthfully as failed status), and restarts on crash with backoff. `main.js` enforces a per-channel IPC token-bucket rate limiter (`IPC_RATE_LIMITS`).
- **Desktop ↔ backend packaging:** `desktop/package.json` `extraResources` bundles `../../docker-backend/dist`, its `node_modules`, `package.json`, `data` template, and the vendored `../../c/tmux/tmux` binary into the app. The cockpit talks to the supervised backend over the injected `{ backendUrl, apiKey }`.
- **Mobile backend URL handling:** `api/config.ts` rewrites `localhost`/`127.0.0.1` to a dev host (`10.0.2.2` on Android, `localhost` on iOS), and pulls ecosystem URLs from `@recoder/ecosystem-config`. Auth tokens via `getSessionAccessToken`. Stack: Expo Router + NativeWind + `@tanstack/react-query` + zustand stores + i18next.

## 6. Gotchas

- **`dist/` is build output and gitignored everywhere.** `git check-ignore` confirms `apps/agent-gateway/dist`, `apps/agent-worker/dist`, `apps/desktop/dist`, and `apps/desktop/cockpit/dist` are all ignored, and no `dist` files are tracked. Read `src/`, never `dist/`. (Distinct from the repo's *checked-in* `docker-backend/dist`.)
- **`apps/desktop` is outside the pnpm workspace.** It is not in `pnpm-workspace.yaml` and uses npm (`package-lock.json`). The cockpit is built with `pnpm install --ignore-workspace`. Do not assume `pnpm -F` filters reach the desktop app; cockpit deps reference packages via `file:../../../packages/...` paths, not `workspace:*`.
- **agent-gateway / agent-worker are libraries first.** Their `index.ts` run-guards are minimal: the gateway's standalone server is a convenience, and the worker's standalone entry just prints a message. The real integration mounts these into the backend service container — don't expect `pnpm start` in `agent-worker` to run anything meaningful.
- **Worker workflow nodes stall by design without handlers.** Tool and verification nodes return `status: 'waiting'` with an artifact explaining an external handler is required. If a workflow "hangs" at a tool/verification node, the host failed to inject `executeTool` / `runVerification` ports — it is not a bug in `run-task-workflow.ts`.
- **A2A signature default is REQUIRE.** Tests or local callers hitting `/api/a2a/*` without a signed envelope will get rejected unless `RECODER_A2A_REQUIRE_SIGNATURE=false` and/or a valid `RECODER_A2A_SHARED_SECRET` is set.
- **Desktop bundles a snapshot of `docker-backend`.** `extraResources` copies `docker-backend/dist`/`node_modules`/`data` at pack time. A stale or incomplete `docker-backend` build will produce a desktop app that boots a broken embedded backend. The vendored `c/tmux/tmux` binary must exist for conductor features.
- **Mobile has committed native projects.** `apps/mobile/ios/` and `android/` are checked in alongside Expo config, plus a `patches/` dir applied via `patch-package` on `postinstall` and a root `package.json` `overrides` block (`html-entities`, `react-native-worklets`). Dependency bumps can break the patches.
- **`.cursorrules` in mobile** is editor guidance, not enforced config; treat as advisory.
- **`apps/wave` is a fork, not authored-from-scratch.** Upstream Wave Terminal internals are intentionally
  preserved (the `wsh`/"WSH" RPC protocol, `wshrpc`, `WAVETERM_*` env names, `Wave*` code symbols) —
  only user-facing identity, the Go module path, and the server binary name were changed. The `LICENSE`,
  `NOTICE`, and source copyright headers are kept unchanged per Apache-2.0. Don't "rebrand" internal
  symbols. `apps/wave/CLAUDE.md` + `.kilocode/rules/` carry the fork's own coding rules.
- **`apps/wave` GUI is unverified.** Both build halves exit 0, but the Electron app has **not** been
  launched here — block appearance and live interaction are not eyeballed. Do not describe it as a
  running/verified product.

## 7. apps/wave — the L3 terminal shell (Wave fork)

`apps/wave` is Recoder's **terminal-native surface**, forked from Wave Terminal (© Command Line Inc,
Apache-2.0). Wave's block model *is* the cockpit: a grid where each block is either a real agent TUI or a
governed Recoder control-plane widget. It boots into Recoder (`pkg/wcore/layout.go` starter layout =
the `recoder` conductor view + a terminal). It is a **surface swap, not an engine swap** — `docker-backend`
remains the control plane; the shell drives it over HTTP.

**The 11-block cockpit** (`frontend/app/view/recoder*/`, registered in `blockregistry.ts`, all
degrade-safe): `recoder` (hub / workspace list), `recoder-terminal` (live agent TUI + message input),
`recoder-launch`, `recoder-diff` (review → merge / PR), `recoder-approvals`, `recoder-board` (beads ready
work), `recoder-tools` (capability palette → `/api/mcp/tools/:server/:tool/call`), `recoder-health`,
`recoder-memory`, `recoder-runs`, `recoder-settings`. Blocks open each other via `createBlock`, forming
the product loop (launch → session → review → merge → archive). Backend URL resolves via
`getRecoderBackendUrl()` (localStorage → `window.__RECODER_BACKEND_URL__` → `http://127.0.0.1:3100`).

**Layout:** `frontend/` (React UI + `emain/` Electron main + preload), Go backend under `cmd/` + `pkg/`
(server binary `recoder-server`, module `github.com/recoder/recoder-terminal`), `Taskfile.yml` (build
runner), `electron.vite.config.ts`, `electron-builder.config.cjs`, `public/logos/` (the Recoder cube).

**Build / run** (verified exit 0; **not** GUI-launched):

```bash
cd apps/wave
task build:backend:quickdev   # Go backend → dist/bin/recoder-server.<arch>  (exit 0)
npm run build:dev             # electron-vite frontend + emain               (exit 0)
RECODER_BACKEND_URL=http://127.0.0.1:3100 npm run dev
```

Cloud is decoupled: telemetry off, the `wcloud` sender inert unless `RECODER_TELEMETRY_URL` is set, the
auto-updater no-ops unless `RECODER_UPDATE_FEED` is set, and the default AI preset points at Recoder's
governed gateway (`/api/gateway/v1`). Not yet done (needs the app running): GUI launch pass, the
`wsh`→`recoder` CLI rename, the app icon (`build/*.icns`), and a signed `electron-builder` `.dmg`.
