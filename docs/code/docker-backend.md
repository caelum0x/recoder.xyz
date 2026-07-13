# docker-backend

> Code documentation for `docker-backend/`. Verified by reading source on the
> `fix/agent-blockers-create-loop-codemirror-sandbox-autowake` branch. Where a
> detail was not directly confirmed in code it is called out as such.
>
> **Engine update (2026-07-13, `feat/enterprise-s0-p0`).** This backend is now the **conductor for a
> polyglot engine fleet** (RECODER-ENGINES Phases 1–5). New in `src/`: `fleet/` (declarative polyglot
> service supervisor, degrade-safe, probe-only), `gateway/` (`LlmGatewayPort` over `crates/tensorzero`
> + an OpenAI-compat `/v1/chat/completions`), and a governed **MCP interop host**
> (`src/agent-os/mcp/interop-host.ts`) that registers **21 in-proc capability servers** reachable via
> `POST /api/mcp/tools/:server/:tool/call` behind `authorize → risk → execute → audit`. Each engine is
> **built + wired + unit-tested + degrade-safe** — not GUI-verified or deployed. See §2/§3/§5 additions
> below and [RECODER-CAPABILITIES](../architecture/RECODER-CAPABILITIES.md) for the connection table.

## 1. Purpose

`docker-backend` is the **service runtime and agent-orchestration backend** for the
Recoder platform. It is a single Node/TypeScript process (`recoder-docker-backend`,
`package.json` `main: dist/server.js`) built on **Express + express-ws**, listening
on the port in `process.env.PORT` (default **3100** — note: not 3001 as some docs
say; see `src/server.ts:11831`). It began life as a Docker-based code-execution
backend replacing WebContainer (per `README.md`) — creating per-project containers,
terminals, file sync, previews, and sandboxes — and has since absorbed the Recoder
**Agent OS control plane**, the **A2A** (agent-to-agent) gateway, the **Conductor**
(parallel coding-agent substrate), connectors, billing/distribution, and network
fabric routes.

In the platform's layering, this process is the HTTP/WebSocket surface that
mounts Recoder's domain packages (`@recoder/agent-os`, `@recoder/a2a-sdk`,
`@recoder/agent-policy`, `@recoder/agent-events`, etc., all `workspace:*`
dependencies) behind `/api/*`, `/api/v1/*`, and `/internal/*` route trees. Per the
repo's monorepo rules, the core packages own canonical state; this backend is an
execution/adapter surface that exposes them and runs sandboxes, containers, and
agent CLIs.

## 2. Layout

Top-level of `docker-backend/` (real entries):

| Path | What it holds |
|------|---------------|
| `src/` | All TypeScript source (~112 files/dirs at top level). |
| `dist/` | **Committed** compiled JS output (`tsc`). Tracked in git — see Gotchas. |
| `data/` | JSON state stores + sqlite (`a2a-*.json`, `api-keys.json`, `backups/`). Some tracked, some gitignored. |
| `docker/` | Base image build context for the universal execution image. |
| `scripts/` | Dev/CI/verify scripts (`dev-conductor.sh`, `smoke-public-queue.sh`, `agent-os-*` verifiers). |
| `tests/` | Top-level test dir (separate from `src/__tests__` and per-feature `*.test.ts`). |
| `vendor/opencode/` | Vendored third-party opencode code (not authored here). |
| `Dockerfile`, `docker-compose*.yml`, `ecosystem.config.js` | Container + PM2 runtime config. |
| `Makefile` | Local conductor dev harness (`make dev-conductor`). |
| `memory.db` | Local sqlite memory DB (gitignored). |

Key `src/` subdirectories:

| Module | Responsibility |
|--------|----------------|
| `src/server.ts` | **Monolithic main server (~533 KB / >14k lines).** Wires every router, WebSocket, container/preview/terminal logic. |
| `src/conductor/` | Parallel coding-agent substrate: tmux orchestration + git worktrees, runtime drivers, review/merge, governance gates, dmux operator console. Has its own `README.md`. |
| `src/agent-os/` | Agent OS control-plane adapter: controllers, repositories (in-memory / JSON-file / Postgres), routes, MCP control, NATS outbox publisher, code-graph. **`src/agent-os/mcp/`** hosts the **interop host** (`interop-host.ts`, 21 in-proc servers) + the executor **engine skins** (`retrieval-engine.ts`, `browser-use-engine.ts`, `coordination-engine.ts`, `workflow-engine.ts`, `pal-plan-engine.ts`, `notify-engine.ts`, `repo-engine.ts`, `vector-store.ts`, `memory-store-adapter.ts`, `beads/preview/github/logs/store/deployment/billing`-engines) + `inproc-engines.ts` router wiring. |
| `src/fleet/` | **NEW** — declarative polyglot service supervisor (`manifest.ts`, `supervisor.ts`): spawn/health/degrade for the Rust/Go/Py fleet, loopback-only, wired into `/health/full`. Never builds services in-process; absent binary ⇒ the engine's TS fallback. |
| `src/gateway/` | **NEW** — LLM gateway skin: `tensorzero-client.ts` (`LlmGatewayPort` over `crates/tensorzero`, degrade → `pi-ai`), `gateway.routes.ts`, and an OpenAI-compat `openai-compat.routes.ts` (`/v1/chat/completions`). |
| `src/a2a/` | A2A wire interop: routes, runtime adapters, orchestration, connectors, SSE streaming, OpenAPI/SLO surfaces (~125 entries). |
| `src/public-api/` | External developer API (`/api/v1/*`): API keys, BYOK provider keys, sandboxes/projects routes, rate limiting, task-stream protocol. |
| `src/routes/` | Feature route modules extracted from `server.ts` (git, mcp, secrets, deploy, llm-router, daytona-sandbox, e2b, neon, templates, etc.). |
| `src/connectors/` | Chat-channel connectors (Discord, Telegram, webhook ingress) + ingress gate + dispatch runner. |
| `src/distribution/` | CLI auth, billing routes, entitlement gate middleware, session tokens. |
| `src/network/` | Network fabric routes (`/api/network`, `/internal/network`) + XDR sink. |
| `src/billing/` | Polar webhooks, subscription-tier logic. |
| `src/database/` | DB connection manager + drivers (`postgresql.ts`, `sqlite.ts`), schema inspector, query executor. |
| `src/security/` | Abuse prevention, WS rate limiter, admin alerts. |
| `src/errors/` | Error `types.ts` (`ErrorCode`, `createError`) + `handler.ts` (`sendSuccess`/`sendError`). |
| `src/lsp/`, `src/collaboration/`, `src/cli-sync/` | Language-server manager, Yjs collaboration server, CLI<->web file sync. |
| `src/policy/`, `src/metering/`, `src/resources/`, `src/templates/`, `src/integrations/` | Policy, usage metering, execution-limits, project templates, Neon/prompt integration stores. |
| Many flat `src/*.ts` | Container pool/lifecycle, preview, git-operations, daytona/e2b clients, snapshot, health-monitor, metrics, secrets, package-manager, etc. |

## 3. Entry points

Start reading here:

- **`src/server.ts`** — the process entry. Key lines:
  - `src/server.ts:1678` — `const server = http.createServer(baseApp)`
  - `src/server.ts:1682` — `expressWs(baseApp, server)` installs WebSocket support.
  - `src/server.ts:11831` — `const PORT = process.env.PORT || 3100`
  - `src/server.ts:14218` — `server.listen(PORT, …)`; `startupSequence()` runs in the listen callback.
  - Route mounts cluster around `src/server.ts:11786`–`12507` (see `app.use('/api/...')`).
- **Route registries / factory routers** (imported into `server.ts`, good per-area entry points):
  - `src/agent-os/index.ts` — re-exports `createAgentOsRouter`, `createInternalAgentOsRouter`, `createAgentMcpRouter`, `createAgentOsGitHubWebhookRouter`, controllers, repositories, `service-container`.
  - `src/conductor/conductor.routes.ts` — `createConductorRouter()` (start/observe/steer/stop agent sessions).
  - `src/a2a/index.ts` — large barrel of A2A routers (task lifecycle, SSE, connectors, orchestration, admin, registry).
  - `src/a2a-gateway.ts` — `a2aRouter`, `getDockerBackendAgentCard` (the A2A gateway itself; ~160 KB).
  - `src/distribution/index.ts` — `createCliAuthRouter`, `createBillingRouter`, `getDistributionModule`.
  - `src/network/network.routes.ts`, `src/connectors/index.ts`, `src/public-api/routes/*`.
- **Standalone CLIs / workers** (run via `tsx`):
  - `src/a2a-intent-worker.ts` — `pnpm a2a:worker`.
  - `scripts/agent-os-persistence-smoke.ts`, `scripts/verify-agent-os-paid-loop.ts`, `scripts/verify-agent-os-outbox-nats.ts`.
  - `src/conductor/mint-conductor-key.ts`, `scripts/dev-conductor.sh` (via `make dev-conductor`).

## 4. Build / run / test

Real scripts from `package.json`:

| Command | What it does |
|---------|--------------|
| `npm run dev` / `pnpm dev` | `tsx watch src/server.ts` — run server with hot reload. |
| `npm run build` | `tsc` — compile `src/` → `dist/` (per `tsconfig.json`, CommonJS, ES2022). |
| `npm start` | `node dist/server.js` — run compiled server. |
| `npm test` | `vitest --run`. |
| `npm run test:watch` / `test:coverage` / `test:ui` | Vitest variants. |
| `npm run ci:check` | Runs a **curated subset** of vitest files (subagent-workflow, public-api parity/byok/task-stream, resources limits, a2a e2e/chaos/drift/slo, domain-manager, git-operations) — not the full suite. |
| `npm run ci:preflight` | Verifies local `vitest`/`tsc` binaries exist before CI. |
| `npm run smoke:queue` | `bash scripts/smoke-public-queue.sh`. |
| `npm run a2a:worker` | Run the A2A intent worker. |
| `npm run agent-os:persistence-smoke` / `:verify-paid-loop` / `:verify-outbox-nats` | Agent OS verifiers via `tsx`. |
| `npm run docker:build` | `docker build -t recoder-node-base ./docker`. |

Makefile (local conductor harness only):

- `make dev-conductor` → `./scripts/dev-conductor.sh` (boots backend, mints a dev conductor `sk_` key, waits for conductor health, writes desktop config).
- `make dev-conductor-key` → mint-only; writes `.dev/conductor.json`.

Vitest config is `vitest.config.ts`. Note `tsconfig.json` **excludes** three opencode files (`src/a2a/opencode-{bash-tool,edit-tool,session-processor}.ts`) and all `*.test.ts` from the build.

## 5. Key patterns & contracts

- **Auth helper (`authenticateRequest`)** is defined *inside* `server.ts:793`
  (`function authenticateRequest(req, res, next)`) — it is **not** an exported
  shared util; it's local middleware applied to most `/api/*` mounts. Variants seen
  at the mount sites: `authenticateMutatingRequest`, `authenticateApiKey` (public
  API `/api/v1`), and `promoteQueryToken` (promotes a `?token=` for SSE). Anonymous
  identity helpers live in `src/auth-utils.ts` (`RECODER_ANONYMOUS_ID_COOKIE/HEADER`,
  `getProjectIdFromRequest`).
- **Response envelope** comes from `src/errors/`:
  `sendSuccess(res, data)` and `sendError(res, createError(ErrorCode.X, msg))`
  (`src/errors/handler.ts:180,207`; `createError` at `src/errors/types.ts:433`).
  `ErrorCode` enumerates `AUTH_REQUIRED`, `AUTH_INVALID_TOKEN`, `AUTH_SERVICE_ERROR`,
  etc. (imported into `server.ts:269`).
- **Route namespacing** matches the repo API rules:
  - `/api/agent-os/*` → `createAgentOsRouter()` behind `authenticateRequest` (`server.ts:12354`).
  - `/internal/agent-os/*`, `/internal/network` → worker-to-backend routers (no user auth, expect `INTERNAL_SERVICE_KEY`).
  - `/api/a2a/*` → the A2A gateway + the many sub-routers from `a2a/index.ts` (`server.ts:12441`–12503).
  - `/api/conductor/*` → `createConductorRouter()` (`server.ts:12357`).
  - `/api/v1/*` → public developer API with `authenticateApiKey` + rate-limit + request-id middleware.
  - `/api/a2a/github/webhook`, `/api/agent-os/github/webhook`, `/api/connectors/webhook` use **raw/text body parsers** mounted *before* JSON parsing (`server.ts:1816`–1821) for signature verification.
- **RunEvent / Agent OS outbox contract:** `RunEvent` is a type from
  `@recoder/agent-os`. The Agent OS controller (`src/agent-os/controllers/agent-os.controller.ts`)
  has `appendEvent` → `repository.appendEvent` → `appendRunEventOutbox` which maps
  each event to a CloudEvent via `mapRunEventToCloudEvent` and writes an outbox
  record (`createOutboxRecord`). `applyRunEvent` projects state; runtime evidence is
  derived from run events (`runtimeEvidenceInputsFromRunEvent`). The outbox is
  drained by `src/agent-os/outbox-drain-loop.ts` (started at boot via
  `startAgentOsOutboxDrainLoop`) and published to NATS by `nats-outbox-publisher.ts`.
  Repositories are swappable: `in-memory`, `json-file`, `postgres` (selected via
  `service-container.ts` / `agentOsContainer`).
- **Conductor contracts** (`src/conductor/README.md`): user's own coding-agent CLIs
  run in **isolated git worktrees** driven through a **pinned tmux session**; state
  of record lives in `@recoder/agent-os` + Postgres, live execution in tmux+worktrees
  (survives backend restart), and a **reconciler** rebinds them on boot
  (`reconcile` from `workspace-service.ts`, called in startup). `tmux-path.ts`
  exports `TMUX_BIN` (vendored → `RECODER_TMUX_BUILD_PATH`/`CONDUCTOR_TMUX_BIN` →
  system tmux). The launch path is gated **in-process** by `@recoder/agent-hooks`
  via `hook-gate.ts` (pre-launch secret/path/command policy; post-launch artifact
  capture; degrade-safe — a failing gate never blocks unless it positively decided
  to block). `dmux` (`ts/dmux`) is an **optional** operator TUI, never on the
  critical path.
- **Governed MCP interop host (21 in-proc engines).** `src/agent-os/mcp/interop-host.ts`
  registers `IN_PROC_SERVERS` (21: tasks, runs, artifacts, approvals, github, repo, browser, memory,
  beads, git-nexus, preview, logs, oss, deployment, billing, **retrieval**, **browser-use**,
  **coordination**, **workflow**, **pal-plan**, **notify**) plus the external supervised PAL stdio
  server. Every tool call is authorized, risk-scored, executed against the engine skin's port, and
  sealed in the Merkle audit chain; an authorized call with no registered executor returns a truthful
  error, never a fabricated result. Reachable at `POST /api/mcp/tools/:server/:tool/call`. Wiring a new
  engine follows the five-step pattern in RECODER-CAPABILITIES (executor skin → `inproc-engines.ts` →
  `interop-host.ts` `IN_PROC_SERVERS` + `mcp-control.routes.ts` `defaultServers` → rebuild dists →
  capability-tools bridge); the first two steps alone 404 the gated route.
- **Polyglot fleet + LLM gateway (degrade-safe).** `src/fleet/` supervises the Rust/Go/Py services
  declared in `manifest.ts` (governance, openfang, tensorzero, recoder-xds, ziti, beads, multica,
  colbert, mem0, browser-use, ops-recorder), probing health and reporting truthful `available|degraded`
  into `/health/full` — the backend boots with **zero** external services present. `src/gateway/`
  routes every model call through `crates/tensorzero`, degrading to the `pi-ai` BYOK client when the
  gateway binary is absent.
- **State persistence pattern:** JSON stores in `data/` (`a2a-workspaces.json`,
  `a2a-events.json`, `api-keys.json`, etc.) plus sqlite (`better-sqlite3`,
  `memory.db`) and optional Postgres (`pg`). Container lookup is by `projectId`.
- **Heavy dependency surface:** `dockerode` (containers), `node-pty` (terminals),
  `yjs`/`y-protocols` (collaboration), `nats` + `ioredis` (eventing), `duckdb`
  (`/api/a2a/data`), `e2b`, daytona client, `grammy` (Telegram). Many `@recoder/*`
  workspace packages are the real domain owners.

## 6. Gotchas

- **`dist/` is committed to git.** `git ls-files docker-backend/dist` returns
  tracked `.js` files (e.g. `dist/server.js`, `dist/a2a-gateway.js`). The git status
  shows several `dist/*.js` modified alongside their `src` counterparts. Source of
  truth is `src/`; do not hand-edit `dist/` — rebuild with `npm run build`. Stale
  `dist` vs `src` drift is a real risk.
- **`server.ts` is a ~533 KB monolith** (>14k lines). Route extraction into
  `src/routes/*` and the factory routers is partial and ongoing — much logic
  (containers, previews, terminals, figma import, WS handlers) still lives inline.
- **Port confusion:** the README/header context says `:3001`, but the actual default
  is `PORT || 3100` (`server.ts:11831`). In production it's fronted by nginx and PM2
  (`ecosystem.config.js`, `nginx*.conf`); verify the real port from env, not docs.
- **`vendor/opencode/` is vendored third-party code**, not authored in this repo.
  Three opencode files under `src/a2a/` are explicitly **excluded from the tsc
  build** (`tsconfig.json` exclude list) — they won't appear in `dist`.
- **`data/` is split tracking:** `data/performance-profiler.json` and
  `data/projects.json` are tracked (and show as modified in git status), while
  `data/api-keys.json` and `memory.db` are **gitignored**. Don't assume a `data/`
  file is committed; check `git check-ignore`.
- **`tsconfig.json` `paths` reach into `node_modules/@recoder/*/src` and `dist`**
  directly (e.g. `@recoder/shared/a2a` → `node_modules/.../src/...`). This couples
  the build to how the monorepo links workspace packages; a missing/unbuilt
  workspace package breaks type resolution.
- **`src/server.ts:7592` note:** `startupSequence()` is intentionally invoked inside
  the `app.listen()` callback, not at import time — boot-order-sensitive
  initialization (reconciler, outbox drain, connectors) happens there.
- **`recoder-studio` / abandoned surfaces** referenced in repo memory do not live
  here; this dir is active and central. The `tests/` top-level dir coexists with
  `src/__tests__` and colocated `*.test.ts` — three test locations.
