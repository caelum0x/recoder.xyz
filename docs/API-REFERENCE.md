# Recoder HTTP API Reference

The real HTTP surface served by `docker-backend` (Express + `express-ws`, port `3001`). Every endpoint below is grounded in the route source; mount points are cited so you can verify with `grep`.

Related docs:

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [CONDUCTOR-ARCHITECTURE.md](./CONDUCTOR-ARCHITECTURE.md)
- [RECODER-PRODUCT-ARCHITECTURE.md](./RECODER-PRODUCT-ARCHITECTURE.md)

## Surface map

| Base path | Router | Auth | Mount (`docker-backend/src/server.ts`) |
|-----------|--------|------|----------------------------------------|
| `/api/conductor` | `createConductorRouter()` (`src/conductor/conductor.routes.ts`) | `authenticateRequest` | line 12357 |
| `/api/agent-os` | `createAgentOsRouter()` (`src/agent-os/routes/agent-os.routes.ts`) | `authenticateRequest` | line 12354 |
| `/api/agent-os/github/webhook` | `createAgentOsGitHubWebhookRouter()` | raw-body + HMAC (in-router) | line 1817 |
| `/internal/agent-os` | `createInternalAgentOsRouter()` (`src/agent-os/routes/internal.routes.ts`) | `x-internal-service-key` | line 12355 |
| `/api/a2a` | `a2aRouter` + many sub-routers (`src/a2a/*`) | mixed (see [A2A](#apia2a--agent-to-agent)) | lines 12423–12478 |
| `/api/auth/cli` | `createCliAuthRouter()` (`src/distribution/cli-auth.routes.ts`) | unauthenticated handshake | line 12364 |
| `/api/mcp` | `createAgentMcpRouter()` | `authenticateRequest` | line 8050 |
| `/api/billing` | `createBillingRouter()` | `authenticateRequest` | line 12365 |

All JSON bodies are capped at `2mb` by the per-prefix `express.json` parsers.

## Authentication

`authenticateRequest` (`src/server.ts:793`) resolves identity in this precedence order:

1. **Internal service key** — header `x-internal-service-key` (or `Authorization: Bearer <key>`) equal to `INTERNAL_SERVICE_KEY` (`resolveInternalServiceSession`, `src/auth-utils.ts:156`).
2. **Platform API key** — header `x-api-key: sk_...`, validated by `validatePlatformApiKey` (`resolvePlatformApiKeySession`, `src/server.ts:777`). Resolves to the owning user.
3. **Better Auth session token** — `Authorization: Bearer <token>` or a Better Auth session cookie, verified by `verifySessionToken` (`getSessionTokenFromRequest`, `src/server.ts:398`).

When `STRICT_AUTH` is off and the origin is allowed, a missing/invalid token degrades to an anonymous identity (migration mode); otherwise `401`. `authenticateMutatingRequest` (`src/server.ts:883`) skips auth for `GET`/`HEAD`/`OPTIONS` and applies `authenticateRequest` to mutating verbs (used by `/api/a2a`).

```bash
# Platform API key (first-party clients, e.g. the desktop cockpit)
curl -H 'x-api-key: sk_live_xxx' https://docker.recoder.xyz/api/conductor/health

# Better Auth session token
curl -H 'Authorization: Bearer <session-token>' https://docker.recoder.xyz/api/conductor/workspaces
```

## Response envelope

Most routes return the `{ success, data }` / `{ success, error }` envelope:

```json
{ "success": true, "data": { } }
{ "success": false, "error": "workspace not found" }
```

Exceptions are noted inline (the CLI device-flow `/token` route returns OAuth-style fields; A2A `agent.json` returns a raw agent card).

---

## `/api/conductor` — parallel agent sessions

Manages tmux + git-worktree agent runs. Source: `src/conductor/conductor.routes.ts`. All routes require `authenticateRequest`.

### Health & availability

| Method | Path | Description | Source |
|--------|------|-------------|--------|
| `GET` | `/health` | `conductorAvailability()` — tmux/git readiness | L64 |
| `GET` | `/health/full` | `conductorHealth()` — substrate + runtimes + resources + tails + dmux | L379 |
| `GET` | `/metrics` | `metrics.snapshot()` — counters/gauges/histograms | L384 |
| `GET` | `/resources` | `resourceSnapshot()` — governor utilization vs limits | L389 |
| `GET` | `/runtimes` | Installed agent CLIs Conductor can launch | L127 |
| `GET` | `/substrates` | Registered substrates + availability (`tmux_worktree`, daytona…) | L132 |
| `GET` | `/dmux` | dmux availability + visible sessions (optional view layer) | L142 |
| `POST` | `/dmux/launch` | Launch dmux operator console (`{ repoPath, extraArgs }`) | L150 |

### Raw tmux sessions

The lower-level session primitive (the workspace API below wraps this).

| Method | Path | Body / Query | Source |
|--------|------|--------------|--------|
| `GET` | `/sessions` | — | L68 |
| `POST` | `/sessions` | `{ sessionId, repoPath, command, branch?, baseRef? }` → `201` | L72 |
| `GET` | `/sessions/:sessionId/output` | `?lines=200` | L86 |
| `POST` | `/sessions/:sessionId/keys` | `{ keys }` | L96 |
| `DELETE` | `/sessions/:sessionId` | `?keepWorktree=true` to retain worktree | L111 |
| `GET` | `/sessions/:sessionId/exit-code` | true pane exit code | L117 |

```bash
curl -X POST https://docker.recoder.xyz/api/conductor/sessions \
  -H 'x-api-key: sk_live_xxx' -H 'content-type: application/json' \
  -d '{"sessionId":"demo","repoPath":"/repos/app","command":"claude"}'
```

### Workspaces (persisted, restart-survivable unit of work)

| Method | Path | Body / Notes | Source |
|--------|------|--------------|--------|
| `GET` | `/workspaces` | List all workspaces | L174 |
| `POST` | `/workspaces/plan` | Pre-launch advisory plan. Body: persisted `{ taskId }` or inline `{ task }` (TaskSpec, guarded against `@recoder/agent-schemas`). Returns plan + `effectiveRuntimeId`. Does **not** launch. | L188 |
| `POST` | `/workspaces` | Create + launch. Required: `spaceId, projectId, taskId, repoPath, createdBy`, and one of `command` \| `prompt`. `runtimeId` optional (pal defaults it). `429` on resource rejection, `409` on other launch failure. | L224 |
| `GET` | `/workspaces/:workspaceId` | Get one (`404` if absent) | L268 |
| `GET` | `/workspaces/:workspaceId/events` | `RunEvent` log for the run | L278 |
| `GET` | `/workspaces/:workspaceId/diff` | Worktree diff vs base ref | L283 |
| `POST` | `/workspaces/:workspaceId/pr` | Open PR. Body `{ title?, body?, base?, draft?, remote? }`. **Approval-gated**: `409` + `awaiting_approval` when no approval record. | L295 |
| `POST` | `/workspaces/:workspaceId/merge` | Merge PR. Body `{ strategy?, deleteBranch? }`. **Approval-gated** (same `409` shape). | L330 |
| `POST` | `/workspaces/:workspaceId/archive` | Stop session, remove worktree, mark archived | L360 |
| `GET` | `/workspaces/:workspaceId/status` | Live agent status (alive + exit code + recent output) | L446 |
| `POST` | `/workspaces/:workspaceId/steer` | Send keys to a running agent. Body `{ keys }`. `409` if terminal or no live handle. | L470 |
| `GET` | `/workspaces/:workspaceId/delivery` | Delivery summary (diff + logs + exit code) | L500 |
| `GET` | `/workspaces/:workspaceId/memory-candidate` | Review-gated memory candidate (`204` if none) | L509 |

Approval-gated `409` response shape (PR/merge), surfacing the `@recoder/governance` verdict:

```json
{
  "success": false,
  "error": "delivery approval required",
  "data": {
    "state": "awaiting_approval",
    "action": "open_pr",
    "approvalId": "...",
    "transitioned": true,
    "governance": { "tier": null, "effect": null, "auditHash": null, "hardDeny": false, "degraded": false }
  }
}
```

### Workflows, batch & maintenance

| Method | Path | Body / Notes | Source |
|--------|------|--------------|--------|
| `POST` | `/reconcile` | Reconcile persisted workspaces vs real tmux/git | L370 |
| `POST` | `/workflows` | Multi-agent workflow. Required: `spaceId, projectId, taskId, repoPath, createdBy, pattern, steps[]`. `pattern ∈ {direct, fan_out, pipeline, competitive}`; each step needs `runtimeId` + `prompt`. `429` rejected, `502` failed, `201` ok. | L395 |
| `POST` | `/batch/cancel` | Cancel non-terminal workspaces (`{ projectId?, createdBy? }`) | L523 |
| `POST` | `/batch/archive` | Archive terminal workspaces (`{ projectId?, states? }`) | L533 |
| `POST` | `/cleanup` | Prune stale worktrees + kill orphaned sessions | L543 |

### Beads (`bd`) issue sync

Degrade-safe: when the `bd` binary is absent these return `200` with a skipped reason.

| Method | Path | Body | Source |
|--------|------|------|--------|
| `GET` | `/issues/availability` | `bd` CLI availability | L554 |
| `POST` | `/issues/import` | `{ spaceId, repo?, cwd? }` → import ready issues as TaskSpecs | L561 |
| `POST` | `/issues/export` | `{ taskId, artifacts?, cwd? }` → export one task to `bd` | L577 |

### Context ingest & work signals

| Method | Path | Body / Query | Source |
|--------|------|--------------|--------|
| `POST` | `/context/ingest` | `{ title, content? \| base64?, format? }`, `format ∈ {text, markdown, pdf}`. Hands the doc to the shared Brain (mem0). Degrade-safe. | L606 |
| `POST` | `/work-signals` | Ingest one stuck/blocked/needs-handoff signal (parsed by `parseWorkSignal`). `201`. | L646 |
| `GET` | `/work-signals` | `?taskId=&workspaceId=&limit=` — newest first | L662 |

### Live stream (WebSocket)

`WS /api/conductor/workspaces/:workspaceId/stream` — live RunEvents for the operator console. Registered only when `express-ws` injected `.ws` onto the router (`src/conductor/conductor.routes.ts:675`).

---

## `/api/agent-os` — control-plane state of record

Canonical agents/tasks/runs/approvals/artifacts/memory/instructions/policies/events. Source: `src/agent-os/routes/agent-os.routes.ts`, served by `AgentOsController`. Requires `authenticateRequest`. Bodies marked **(schema)** are validated against `@recoder/agent-schemas` via `validateBody` (`schema-guard.middleware`).

### Nested sub-routers (mounted in the agent-os router)

| Prefix | Router | Notes | Source |
|--------|--------|-------|--------|
| `/code-graph` | `createCodeGraphUserRouter()` | Flag-gated (`RECODER_CODE_GRAPH_ENABLED`), owner-scoped GitHub connect + code-graph reads | L33 |
| `/policy` | `createPolicyEvaluateRouter()` | `POST /policy/evaluate` → live `PolicyDecision` | L38 |
| `/memory/lifecycle` | `createMemoryCandidateRouter()` | Reviewed-candidate lifecycle (`/candidates` + review) | L46 |
| `/brain` | `createBrainStatsRouter()` | `GET /brain/stats` — Brain cache accounting + governance audit | L52 |

### Core CRUD & lifecycle

| Method | Path | Notes | Source |
|--------|------|-------|--------|
| `GET` | `/health` | | L54 |
| `GET` | `/summary` | | L55 |
| `GET` / `POST` | `/agents` | POST **(schema:** `agentProfileSchema`**)** | L56–57 |
| `POST` | `/agents/reconcile` | | L58 |
| `GET` / `POST` | `/spaces` | | L59–60 |
| `POST` | `/spaces/:spaceId/repositories/github` | Connect a GitHub repo to a space | L61 |
| `GET` / `POST` | `/tasks` | POST **(schema:** `taskSpecSchema`**)** | L62–63 |
| `POST` | `/tasks/route` | Route a task to a runtime/agent | L64 |
| `GET` | `/tasks/:taskId/history` | | L65 |
| `GET` | `/tasks/:taskId/context-pack` | | L66 |
| `GET` / `POST` | `/runs` | | L67–68 |
| `GET` | `/runs/:runId/history` | | L69 |
| `POST` | `/runs/:runId/claim` | | L70 |
| `POST` | `/runs/:runId/transition` | | L71 |
| `POST` | `/runs/:runId/handoff` | | L72 |
| `POST` | `/runs/:runId/verification-results` | | L73 |
| `GET` / `POST` | `/approvals` | POST **(schema:** `approvalSchema`**)** | L74–75 |
| `POST` | `/approvals/:approvalId/approve` | | L76 |
| `POST` | `/approvals/:approvalId/reject` | | L77 |
| `GET` / `POST` | `/artifacts` | POST **(schema:** `artifactSchema`**)** | L78–79 |
| `GET` / `POST` | `/runtime-evidence` | | L80–81 |
| `POST` | `/artifacts/pull-request` | | L82 |
| `POST` | `/artifacts/preview` | | L83 |
| `GET` / `POST` | `/github/delivery-links` | | L84–85 |
| `POST` | `/github/delivery-links/:linkId/pull-request` | | L86 |
| `POST` | `/github/delivery-links/:linkId/previews` | | L87 |
| `POST` | `/github/delivery-links/:linkId/checks` | Sync GitHub checks | L88 |
| `POST` | `/github/delivery-links/:linkId/reviews` | Sync GitHub reviews | L89 |
| `POST` | `/github/delivery-links/:linkId/issue` | | L90 |
| `GET` / `POST` | `/work-signals` | POST **(schema:** `workSignalSchema`**)** | L91–92 |
| `PATCH` | `/work-signals/:signalId/status` | Resolve a work signal | L93 |
| `GET` | `/memory` | | L94 |
| `GET` | `/memory/search` | | L95 |
| `POST` | `/memory/candidates` | **(schema:** `memoryCandidateSchema`**)** | L96 |
| `POST` | `/memory/candidates/:candidateId/review` | | L97 |
| `POST` | `/memory/items` | | L98 |
| `GET` / `POST` | `/instructions` | POST **(schema:** `instructionBundleSchema`**)** | L99–100 |
| `POST` | `/instructions/compile` | | L101 |
| `GET` / `POST` | `/policies` | | L102–103 |
| `POST` | `/policies/decisions` | | L104 |
| `GET` / `POST` | `/work-locks` | POST **(schema:** `workLockSchema`**)** | L105–106 |
| `POST` | `/work-locks/acquire` | | L107 |
| `DELETE` | `/work-locks/:lockId` | Release a work lock | L108 |
| `GET` / `POST` | `/events` | POST **(schema:** `runEventSchema`**)** | L109–110 |
| `GET` | `/outbox` | | L111 |
| `GET` / `POST` | `/oss` | OSS component registry | L112, L114 |
| `GET` | `/oss/components/:componentId` | | L113 |
| `GET` | `/workflows` | | L115 |

### `/internal/agent-os` — worker-to-backend (key-gated)

Mounted at `src/server.ts:12355`; `createInternalAgentOsRouter()` requires `x-internal-service-key` equal to `INTERNAL_SERVICE_KEY` (else `403`; `src/agent-os/routes/internal.routes.ts:8`). Surfaces outbox drain and the internal code-graph router. Not for first-party clients.

---

## `/api/a2a` — agent-to-agent

Wire-level Agent-to-Agent interoperability. Many sub-routers are mounted in `src/server.ts` (lines 12423–12478). `a2aRouter` and `taskLifecycleRouter` use `authenticateMutatingRequest` (GET/HEAD/OPTIONS pass; mutations authenticate). Body is kept as raw JSON text (`express.text`, L1816) so signed payloads verify over exact bytes.

| Method | Path | Notes | Source |
|--------|------|-------|--------|
| `GET` | `/api/a2a` | Gateway index — `{ name, version, protocol, docs, endpoints }` | L1797 |
| `GET` | `/api/a2a/.well-known/agent.json` | A2A agent card (`authentication.schemes: ["hmac_shared_secret"]`) | L1804 |
| — | `/api/a2a/agents` | `agentRegistryRouter` (mounted before legacy router) | L12423 |
| — | `/api/a2a/tasks` | `taskLifecycleRouter` (`authenticateMutatingRequest`) | L12425 |
| — | `/api/a2a/channels` | `collaborationRouter` | L12426 |
| — | `/api/a2a/approvals` | `approvalRouter` | L12428 |
| — | `/api/a2a/openclaw` | `openclawAdapterRouter` | L12429 |
| — | `/api/a2a/connectors/{claude,codex,opencode,cursor,windsurf,replit}` | Per-runtime connector routers | L12443–12448 |
| — | `/api/a2a/adapters/{rest,git}` | `authenticateRequest` | L12454–12455 |
| — | `/api/a2a/context` | `contextBridgeRouter` | L12456 |
| — | `/api/a2a/workspaces` | `authenticateRequest` | L12457 |
| — | `/api/a2a/{memory,code-search,search,scratchpad,workflows,data,patterns,orchestration}` | `authenticateRequest` | L12459–12478 |
| — | `/api/a2a/webhook` | `webhookRouter` | L12462 |
| `GET` | `/api/a2a/bridge/agents` | Live connected bridge sessions (`authenticateRequest`) | L11636 |

The `agent.json` card is also produced by `getDockerBackendAgentCard` (`src/a2a-gateway.ts`). For the full A2A connector/SLO surface, read `src/a2a/index.ts`.

---

## `/api/auth/cli` — CLI device-flow (RFC 8628)

recoder.xyz is the source of truth. These routes are intentionally unauthenticated at the route layer — the flow itself is the auth handshake (`/authorize` verifies the recoder.xyz session cookie internally). Source: `src/distribution/cli-auth.routes.ts`; mounted at `src/server.ts:12364`.

| Method | Path | Body | Source |
|--------|------|------|--------|
| `POST` | `/device` | `{ client_id? }` → `{ device_code, user_code, verification_uri, verification_uri_complete, expires_in, interval }` | L52 |
| `POST` | `/authorize` | `{ user_code, action? }` (`approve`\|`deny`); requires recoder.xyz session cookie (`401` without) | L72 |
| `POST` | `/token` | `device_code` grant **or** `refresh_token` grant (see below) | L103 |
| `POST` | `/verify` | `{ access_token }` → `{ valid, user? }` | L200 |

`/token` device-code grant (`grant_type: urn:ietf:params:oauth:grant-type:device_code`, `{ device_code }`) returns OAuth-style polling states (`authorization_pending`, `slow_down`, `access_denied`, `expired_token`, all `400`) or, on completion:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "Bearer",
  "expires_at": 0,
  "user": { "id": "...", "email": "...", "subscription_plan": "..." },
  "scopes": ["..."]
}
```

`/token` refresh grant (`grant_type: refresh_token`, `{ refresh_token, user_id? }`) returns the same token shape; `401` on denied refresh. When `CLI_TOKEN_SIGNING_KEY` is missing, token issuance fails closed with `503 { code: "key_missing" }` (`requireSigningKey`, L35). Matches `scripts/verify-cli-device-flow-e2e.sh`.

```bash
# 1. request a device code
curl -X POST https://recoder.xyz/api/auth/cli/device -d '{}'
# 2. poll for the token
curl -X POST https://recoder.xyz/api/auth/cli/token \
  -H 'content-type: application/json' \
  -d '{"grant_type":"urn:ietf:params:oauth:grant-type:device_code","device_code":"<code>"}'
```

---

## Notes & honesty

- The conductor `WS .../stream` route is **conditionally mounted** — present only when `express-ws` is enabled on the server (skipped in isolated unit tests that build the router directly).
- `/api/conductor` and `/api/agent-os` accept the internal service key, platform `sk_` key, or a Better Auth bearer/cookie; `/internal/agent-os` accepts **only** the internal service key.
- Workspace PR/merge are approval-gated; absent an approval record they return `409` with `state: awaiting_approval` rather than performing the delivery.
- Beads (`bd`) and Brain context-ingest are degrade-safe: they return success/empty results rather than failing when their dependency is absent.
