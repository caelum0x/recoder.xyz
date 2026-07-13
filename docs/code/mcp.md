# mcp

> Area: **mcp** — MCP/A2A runtime adapters that let external coding agents (Claude Code, OpenAI Codex) drive the Recoder platform.
> Path: `/Users/arhansubasi/recoder.xyz/mcp`
>
> **Capability-bridge update (2026-07-13).** `recoder-a2a-server.js` now loads
> **`recoder-capability-tools.cjs`** (`createCapabilityTools`, `recoder-a2a-server.js:96`) — a shared
> bridge of **~28 governed capability tools** (`recoder_memory_search`, `recoder_repo_search`,
> `recoder_retrieval_search`, `recoder_browser_navigate`, `recoder_coordination_acquire_lock`,
> `recoder_workflow_verify`, `recoder_pal_plan`, `recoder_notify`, …) that call the backend's governed
> **MCP interop host** at `POST /api/mcp/tools/:server/:tool/call` (which registers **21 in-proc
> capability servers**) behind the full `authorize → risk → execute → audit` gate. So the stdio server
> exposes its 11 native A2A/sandbox/workspace tools **plus** this bridged capability set. The bridge
> file is vendored byte-identically into every stdio copy (main + `packages/recoder-a2a` +
> `packages/recoder-code`), guarded by a drift test. See
> [RECODER-CAPABILITIES](../architecture/RECODER-CAPABILITIES.md) (connection table) +
> [docker-backend.md](./docker-backend.md) (interop host). The §2–§6 detail below documents the native
> 11-tool server + shared core.

## 1. Purpose

This directory holds the **stdio MCP/JSON-RPC bridges** that connect external coding-agent runtimes to the Recoder control plane. It is the "agents-in" surface: a runtime like Claude Code or Codex spawns one of these Node processes, speaks JSON-RPC over stdin/stdout, and the process translates tool calls into HTTP/WebSocket requests against the Recoder backend (docker control plane at `/api/a2a/*`, the Python agents API at `/v1/*`, the conductor at `/api/conductor/*`, and Daytona sandboxes).

These adapters are **execution surfaces, not owners of state**. Every `manifest.json` in the subdirectories sets `"ownsCanonicalState": false`, matching the repo-wide Agent OS rule (`.claude/rules/agent-os.md`): canonical task/approval/artifact/memory state lives in `packages/agent-os` and the backend, not here. The two live `.js` files build request shapes, attach auth, parse `{success,error}` envelopes, and never fabricate success. The `recoder-*` subdirectories are mostly **documentation-only package boundaries** (README + manifest) describing where the real contracts live (`packages/a2a-sdk`, `packages/agent-mcp`, `packages/agent-os`).

## 2. Layout

Real top-level structure (excluding `node_modules`):

| Path | Kind | What it holds |
|------|------|---------------|
| `recoder-a2a-server.js` | **live MCP server** | Claude Code stdio MCP server (`serverInfo.name: "recoder-a2a"`, v3.2.0). Exposes 11 tools; maintains a WebSocket A2A bridge connection. ~760 lines. This is `package.json`'s `main`. |
| `recoder-codex-adapter.js` | **live runtime adapter** | OpenAI Codex JSON-RPC adapter exposing 5 tools (`recoder-codex-a2a`, v1.0.0). HMAC request signing, auth gating. ~242 lines. |
| `lib/recoder-mcp-core.js` | **shared helpers** | Pure, side-effect-free functions shared by both live entrypoints: credential resolution, header builders, envelope parsing, Daytona URL/body helpers, HMAC signing. |
| `recoder-capability-tools.cjs` | **governed capability bridge** | `createCapabilityTools({agentId, dockerUrl})` → ~28 `recoder_*` tools that proxy to the backend's governed MCP interop host (`/api/mcp/tools/:server/:tool/call`) using the conductor-injected `INTERNAL_SERVICE_KEY`. Vendored byte-identically into `packages/recoder-a2a` + `packages/recoder-code`; a drift test enforces the copies stay identical. |
| `test/` | tests | `node --test` suites: `recoder-mcp-core.test.js` (23 tests), `recoder-a2a-server.test.js` (5), `recoder-codex-adapter.test.js` (6). |
| `claude-code-config.json` | config sample | Example `mcpServers.recoder` block pointing Claude Code at `recoder-a2a-server.js` with env vars (contains placeholder secrets `YOUR_*`). |
| `package.json` / `package-lock.json` | package | CommonJS, single dep `ws`; `test` script only. |
| `recoder-mcp-server/` | doc boundary | README + manifest for `@recoder/agent-mcp`-registered canonical servers (`recoder.tasks`, `recoder.runs`, …). **No code** — points to `packages/agent-mcp`. |
| `recoder-claude-bridge/` | doc boundary | README + manifest describing the Claude Code bridge (instruction sources: `CLAUDE.md`, `.claude/rules/*`, skills). **No code.** |
| `recoder-codex-adapter/` | doc boundary | README + manifest + `.env.example`. The README is explicit that the *live* entrypoint stays at `../recoder-codex-adapter.js`. **No code besides `.env.example`.** |
| `recoder-a2a-bridge/` | doc boundary | README + manifest listing A2A HTTP entrypoints (`/api/a2a/*`). Implementation lives in `packages/a2a-sdk` + `docker-backend/src/a2a`. **No code.** |
| `shared/` | doc boundary | README + manifest naming canonical contract packages. Documentation-first to avoid duplicating contract code. **No code.** |

## 3. Entry points

Start reading here, in order:

- **`recoder-a2a-server.js:211`** — the `TOOLS` array: the 11 Claude Code tool definitions with JSON schemas (`recoder_list_agents`, `recoder_list_tasks`, `recoder_send_task`, `recoder_create_thread`, `recoder_get_thread`, `recoder_sandbox_exec`, `recoder_inbox`, `recoder_task_respond`, `recoder_workspace_create`, `recoder_workspace_diff`, `recoder_workspace_merge`).
- **`recoder-a2a-server.js:347`** — `handleToolCall(name, args)`: the switch that implements each tool against the backend.
- **`recoder-a2a-server.js:719`** — `handleMessage`: the MCP JSON-RPC dispatcher (`initialize` / `notifications/initialized` / `tools/list` / `tools/call`).
- **`recoder-a2a-server.js:148`** — `connectBridge()` + `handleBridgeMessage` (line 91): the WebSocket A2A bridge client (registration, inbound `task.assigned`, heartbeat, reconnect-forever loop).
- **`recoder-codex-adapter.js:106`** — `handleMessage`: Codex JSON-RPC dispatcher. Tool list is declared inline in the `initialize` response at `recoder-codex-adapter.js:122`.
- **`lib/recoder-mcp-core.js`** — read this first to understand auth: `resolveCredentials` (line 36), `buildPlatformHeaders` / `buildPythonApiHeaders` (50/62), `signRequest` (148), `buildDaytonaCreateBody` (165).
- **`claude-code-config.json`** — concrete example of how a runtime registers the server (env var names, URLs).

## 4. Build / run / test

CommonJS, no build step. Real scripts from `package.json`:

```bash
# Run the test suites (the ONLY npm script defined)
npm test          # → node --test "test/**/*.test.js"
```

Run the live servers directly (they read config from env vars):

```bash
# Claude Code MCP server (stdio)
node mcp/recoder-a2a-server.js

# Codex adapter (stdio)
node mcp/recoder-codex-adapter.js
```

Registration is via MCP host config rather than a CLI flag — see `claude-code-config.json` (or the repo-root `.mcp.json`, which also references these entrypoints). There is **no** lint/format/typecheck script in this package; the files are plain `.js` with JSDoc.

Key env vars (defaults differ per entrypoint):

| Var | Used by | Notes |
|-----|---------|-------|
| `RECODER_DOCKER_URL` | both | docker control plane base. a2a-server default `https://docker.recoder.xyz`; codex default `http://127.0.0.1:3002`. |
| `RECODER_API_URL` | both | Python agents API base. a2a-server default `https://api.recoder.xyz`; codex default `http://127.0.0.1:3001`. |
| `RECODER_API_TOKEN` | both | raw auth token. If it is a `pk_…:sk_…` pair it routes to `x-api-key`; otherwise treated as bearer session token. |
| `RECODER_SESSION_TOKEN` / `PLATFORM_TOKEN` | a2a-server | bearer token for control plane + conductor. |
| `RECODER_CONDUCTOR_URL` / `CONDUCTOR_URL` / `RECODER_BACKEND_URL` | a2a-server | conductor mount; falls back to `${DOCKER_URL}/api/conductor`. |
| `RECODER_DAYTONA_URL` + `DAYTONA_API_KEY` | both | required for sandbox exec/run tools. |
| `RECODER_A2A_SIGNING_SECRET` | codex | optional HMAC ingress signing. |
| `RECODER_ALLOW_UNAUTHENTICATED_LOCAL` | codex | `true` permits unauthenticated calls **only** against loopback URLs. |

See `recoder-codex-adapter/.env.example` for the canonical Codex template (intentionally ships no real Daytona URL/IP).

## 5. Key patterns & contracts

- **Two distinct auth materials (do not mix).** `resolveCredentials` (`lib/recoder-mcp-core.js:36`) splits credentials into `pythonApiKey` (a `pk_…:sk_…` pair → `x-api-key` against the Python agents API) and `platformToken` (a bearer session token → `Authorization: Bearer` against the docker control plane / conductor). A `pk_/sk_` pair is **never** reused as a bearer token. This mirrors the repo memory note distinguishing Recoder platform keys vs BYOK keys.
- **Truthful "not configured" instead of fake success.** Every tool that needs auth checks `hasPlatformAuth()` / `hasPythonApiAuth()` first and returns an explicit `Error: … not configured. Set RECODER_SESSION_TOKEN…` string rather than attempting a call that would silently fail. The codex adapter throws JSON-RPC errors (`requireRecoderAuth`, `recoder-codex-adapter.js:30`).
- **Envelope parsing never throws.** `readJsonResponse` + `extractApiError` (`lib/recoder-mcp-core.js:85`/`101`) parse `{success, error:{message}}` and common `{message}/{detail}/{error}` shapes without crashing on empty or non-JSON bodies — aligning with the repo's `ApiResponse<T>` envelope convention.
- **A2A bridge model.** `recoder-a2a-server.js` opens a WebSocket to `${A2A_URL}` (`…/agent-bridge`), registers with `agentId`/`sessionId`/capabilities, queues inbound `task.assigned` messages in an in-memory `inboundTasks` array (max 50), auto-acknowledges, and pushes MCP `notifications/message` so Claude sees new tasks without polling. Reconnects effectively forever (`WS_MAX_RETRIES = 9999`).
- **REST task state machine.** `recoder_task_respond` (`recoder-a2a-server.js:591`) implements `claim → working → completed|failed` against `/api/a2a/tasks/:id/{claim,transition}`, tolerating 409 (claimed elsewhere) and 422 (already past a state).
- **Conductor workspace contract.** `recoder_workspace_{create,diff,merge}` POST/GET `${CONDUCTOR_URL}/workspaces…`. `merge` is **approval-gated**: the conductor enforces a delivery approval record and returns `awaiting_approval` rather than merging without one (the adapter does not bypass it).
- **Daytona field-name contract.** `buildDaytonaCreateBody` (`lib/recoder-mcp-core.js:165`) emits `snapshot` (not `image`) and `autoStopInterval` (not `auto_stop_interval`) — the test file calls the wrong names "the real bug." Default snapshot `daytonaio/sandbox:0.5.0-slim`.
- **HMAC signing (codex).** `signRequest` (`lib/recoder-mcp-core.js:148`) signs `METHOD\npathname\ntimestamp\nbody` with SHA-256, emitting `X-Recoder-A2A-Timestamp` + `X-Recoder-A2A-Signature`. Returns `{}` (no-op) when no secret is set.
- **Manifests as boundary contracts.** Each subdir `manifest.json` declares `kind` (`mcp-server` / `runtime-bridge` / `runtime-adapter` / `a2a-bridge` / `shared-contracts`), `ownsCanonicalState: false`, and pointers to the canonical packages. Treat them as the authoritative map of where real code lives.

## 6. Gotchas

- **Doc-only subdirectories.** `recoder-mcp-server/`, `recoder-claude-bridge/`, `recoder-a2a-bridge/`, and `shared/` contain **only** README + manifest — no executable code. The actual implementations live in `packages/agent-mcp`, `packages/a2a-sdk`, `packages/agent-os`, `tools/a2a-interop`, `apps/agent-gateway`, and `docker-backend/src/a2a`. Don't expect to find servers under `recoder-mcp-server/`.
- **Live entrypoints are at the directory root, not inside their named subdir.** The Codex adapter runs from `mcp/recoder-codex-adapter.js`, *not* `mcp/recoder-codex-adapter/`. The subdir's manifest `entrypoint` is `../recoder-codex-adapter.js` and its README warns: "Do not move the existing JS entrypoint without updating external adapter consumers."
- **`claude-code-config.json` contains placeholder secrets** (`YOUR_DAYTONA_API_KEY`, `YOUR_RECODER_SESSION_TOKEN`) and an absolute machine-specific path (`/Users/arhansubasi/…`). It is a sample, not a runtime config — do not commit real keys here.
- **Two adapters, divergent tool sets and defaults.** The a2a-server exposes 11 tools and defaults to **production** HTTPS URLs; the codex adapter exposes 5 tools (`recoder_sandbox_run`, not `recoder_sandbox_exec`) and defaults to **localhost** ports `3001/3002`. They share only `lib/recoder-mcp-core.js`.
- **In-memory inbound queue is volatile.** Bridge `task.assigned` tasks live only in the running process's `inboundTasks` array (cap 50); on restart they are lost. The REST fallback in `recoder_inbox` re-fetches from the backend, so durable state is server-side.
- **No build output / no TypeScript.** Plain CommonJS `.js` with JSDoc; the only dependency is `ws`. There is no `dist/`, no compile step, and no lint/typecheck script — verification is `node --test` only.
- **Backend coupling is implicit.** These files hardcode backend route shapes (`/api/a2a/tasks`, `/v1/threads`, `/api/conductor/workspaces`). If the backend route contracts change, these adapters break silently at runtime (they only have integration tests against fake local servers, not against the real backend).
