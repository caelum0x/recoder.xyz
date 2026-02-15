# A2A Multi-Platform Execution Plan

Last updated: 2026-02-14

## Objective

Ship a production-safe agentic communication layer so all Recoder platforms can collaborate over one contract, including external coding agents (`codex`, `claude_code`).

## Platforms In Scope

- `recoder-web` (Remix + Node server)
- `docker-backend` (Express backend)
- `recoder-agency/apps/agency` (Next.js)
- `recoder-pm/apps/api` (Next.js API service)
- External peers: Codex, Claude Code

## Contract Baseline

- Envelope contract: `@recoder/shared/a2a` (`RecoderA2AEnvelope`)
- Discovery path: `/.well-known/agent-card.json`
- Ingress path: `POST /api/a2a/envelope`
- Egress path: `POST /api/a2a/dispatch`
- Auth headers:
  - `x-recoder-a2a-agent-id`
  - `x-recoder-a2a-timestamp`
  - `x-recoder-a2a-signature` (`v1=<hex-hmac>`)

## Security Policy

1. Verify HMAC signature against raw request body.
2. Reject stale timestamps outside skew window.
3. Restrict allowed sender IDs via `RECODER_A2A_ALLOWED_AGENTS`.
4. Enforce egress allowlist via `RECODER_A2A_EGRESS_ALLOWLIST`.
5. Idempotency by `messageId` with TTL cache.

## Environment Variables

Required:
- `RECODER_A2A_SHARED_SECRET`

Recommended:
- `RECODER_A2A_ALLOWED_AGENTS`
- `RECODER_A2A_EGRESS_ALLOWLIST`
- `RECODER_A2A_AGENT_ID`
- `RECODER_A2A_MAX_SKEW_MS`
- `RECODER_A2A_IDEMPOTENCY_TTL_MS`

Service URLs (optional, for cards):
- `RECODER_WEB_URL`
- `DOCKER_BACKEND_PUBLIC_URL`
- `AGENCY_PUBLIC_URL`
- `PM_API_PUBLIC_URL`

## Rollout Sequence

1. `docker-backend` as first receiver and relay.
2. `recoder-web` orchestration dispatch integration.
3. `recoder-agency` delivery workflow handoffs.
4. `recoder-pm` analytics/insight workflow handoffs.
5. Codex/Claude Code roundtrip smoke tests using bridge examples.

## Verification Matrix

- Card discoverability:
  - `GET /.well-known/agent-card.json` returns 200 and correct URL.
- Signature enforcement:
  - unsigned request -> 401
  - bad signature -> 401
  - stale timestamp -> 401
- Idempotency:
  - same `messageId` replay -> 202 duplicate
- Egress:
  - blocked target -> 403
  - allowed target + signed request -> 200/accepted
- Codex/Claude interop:
  - `pnpm a2a:smoke:codex-claude` succeeds (both directions 2xx)

## Ownership

- `A1`: `recoder-web`, `docker-backend` rollout and smoke evidence
- `A2`: `recoder-agency` route activation and cross-service handoff
- `A3`: `recoder-pm` route activation and PM workflow handoff
- `A5`: cross-platform E2E verification and release gate

## Immediate Next Steps

1. Add integration tests for each `/api/a2a/envelope` route.
2. Add structured logs for accepted/replayed/rejected envelopes.
3. Add persistent idempotency backing (Redis/Postgres) for multi-instance deployment.
4. Integrate task execution hooks behind `intent` routing (`plan`, `execute`, `handoff`, `tool_call`).

## Worker Runtime (Implemented)

Consumer commands:
- `pnpm -C recoder-web a2a:worker`
- `pnpm -C recoder-agency/apps/agency a2a:worker`
- `pnpm -C recoder-pm/apps/api a2a:worker`
- `pnpm -C docker-backend a2a:worker`

Optional in-process consumer for docker-backend:
- `RECODER_A2A_ENABLE_CONSUMER=true`

Worker env:
- `RECODER_A2A_REDIS_URL` (or `REDIS_URL`)
- `RECODER_A2A_INTENT_STREAM_KEY` (default: `recoder:a2a:intents`)
- `RECODER_A2A_RESULTS_STREAM_KEY` (default: `recoder:a2a:results`)
- `RECODER_A2A_DEADLETTER_STREAM_KEY` (default: `recoder:a2a:deadletter`)
- `RECODER_A2A_CONSUMER_GROUP` (default: `recoder-a2a-workers-<serviceId>`)
- `RECODER_A2A_CONSUMER_NAME` (optional)
- `RECODER_A2A_CONSUMER_SERVICE` (service identity, e.g. `recoder_web`)
- `RECODER_A2A_CONSUME_UNTARGETED` (`true` to process records without `targetService`)
- `RECODER_A2A_CLAIM_MIN_IDLE_MS` (default: `30000`, for `XAUTOCLAIM` recovery)
- `RECODER_A2A_MAX_RETRIES` (default: `2`, requeue failed jobs before dead-letter)
- `RECODER_A2A_RETRY_DELAY_MS` (default: `500`)
- `RECODER_A2A_RETRY_BACKOFF_MULTIPLIER` (default: `2`)
- `RECODER_A2A_RETRY_MAX_DELAY_MS` (default: `10000`)
- `RECODER_A2A_GROUP_START_ID` (default: `$`, use `0` for backlog replay)
- `RECODER_A2A_WORKER_TOKEN` (optional; required by intent handlers when set)

Intent execution env:
- `RECODER_A2A_PLAN_HANDLER_URL`
- `RECODER_A2A_EXECUTE_HANDLER_URL`
- `RECODER_A2A_REVIEW_HANDLER_URL`
- `RECODER_A2A_HANDOFF_HANDLER_URL`
- `RECODER_A2A_TOOL_CALL_HANDLER_URL`
- `RECODER_A2A_DEFAULT_HANDLER_URL`
- `RECODER_A2A_INTENT_PLAN_EXECUTOR_URL`
- `RECODER_A2A_INTENT_EXECUTE_EXECUTOR_URL`
- `RECODER_A2A_INTENT_REVIEW_EXECUTOR_URL`
- `RECODER_A2A_INTENT_HANDOFF_EXECUTOR_URL`
- `RECODER_A2A_INTENT_TOOL_CALL_EXECUTOR_URL`

Intent endpoints:
- `POST /api/a2a/intents/plan`
- `POST /api/a2a/intents/execute`
- `POST /api/a2a/intents/review`
- `POST /api/a2a/intents/handoff`
- `POST /api/a2a/intents/tool_call`

Registry + orchestrator endpoints (docker-backend):
- `GET /api/a2a/agents`
- `PUT /api/a2a/agents/:agentId`
- `POST /api/a2a/agents/test`
- `GET /api/a2a/policy`
- `PUT /api/a2a/policy`
- `POST /api/a2a/orchestrate`

Terminal bridge endpoints (docker-backend):
- `POST /api/a2a/bridge/pair` (admin issues scoped bridge session token)
- `GET /api/a2a/bridge/sessions` (admin list active bridge sessions)
- `POST /api/a2a/bridge/jobs` (admin enqueue)
- `GET /api/a2a/bridge/jobs/next` (bridge pull; filtered by bridge token scope claim when present)
- `POST /api/a2a/bridge/jobs/:jobId/result` (bridge push result)
- `GET /api/a2a/bridge/jobs/:jobId/result` (admin result lookup)
- `POST /api/a2a/bridge/heartbeat`
- `GET /api/a2a/bridge/heartbeats` (admin heartbeat list)
- `GET /api/a2a/bridge/heartbeats/:bridgeId` (admin heartbeat detail)
- `GET /api/a2a/bridge/status` (admin heartbeat + queue depth summary)

Orchestration inspection endpoint (docker-backend):
- `GET /api/a2a/orchestrate/:threadId/:traceId`
- `GET /api/a2a/orchestrate/:threadId/:traceId/history` (compact summary + timeline; supports `?cursor=<n>&limit=<n>`)
- `GET /api/a2a/orchestrate/:threadId/:traceId/history/stream` (SSE realtime updates)
- `POST /api/a2a/orchestrate/:threadId/:traceId/override` (admin manual winner override)
- `POST /api/a2a/orchestrate/:threadId/:traceId/recompute` (admin recompute deterministic winner)

Audit endpoint (docker-backend):
- `GET /api/a2a/audit?limit=50` (admin)

Orchestrator modes:
- `codex_only`
- `claude_only`
- `parallel`
- `handoff`
- `fallback`

Orchestration persistence:
- keyed by `threadId + traceId`
- TTL via `RECODER_A2A_ORCH_TTL_MS` (default: 24h)
- includes deterministic merge output (`merge.strategy`, `winnerAgentId`, candidate scores)
- merge includes `conflictReasons` and optional `override` metadata
- state includes append-only `overrideHistory` entries for operator timeline UI
- merge includes `collaboration` assignments (`driver`, `reviewer`, `support`) for cooperative agent workflows
- history payload is versioned (`historyVersion`) and paginated (`page.cursor`, `page.limit`, `page.nextCursor`)
- stream events include:
  - `history_snapshot`
  - `history_update` with `eventType`: `orchestration_completed`, `merge_overridden`, `merge_recomputed`
- stream supports reconnect and filtering:
  - query: `eventTypes=merge_overridden,merge_recomputed`
  - query: `sinceAt=<ISO timestamp>`
  - query/header: `lastEventId=<event id>` or `Last-Event-ID`
- stream fan-out uses Redis-backed per-orchestration event streams when Redis is configured (with in-memory fallback)
- when scope enforcement is enabled, read/stream/override/recompute access requires token scope claims matching orchestration scope (optional header fallback only when explicitly enabled)

Terminal bridge env:
- `RECODER_A2A_ENABLE_BRIDGE_FALLBACK` (`true` to queue Codex/Claude jobs to bridge when base URL is missing)
- `RECODER_A2A_BRIDGE_DEFAULT_ID` (default bridge routing key)
- `RECODER_A2A_BRIDGE_TOKEN` (Bearer auth for bridge daemon)
- `RECODER_A2A_BRIDGE_SESSION_TTL_MS` (default session token TTL)
- `RECODER_A2A_BRIDGE_HEARTBEAT_TTL_MS`
- `RECODER_A2A_ORCH_ALLOWED_INTENTS` (comma-separated allowlist)
- `RECODER_A2A_ORCH_DUAL_APPROVAL_INTENTS` (comma-separated intents requiring >=2 targets)
- `RECODER_A2A_ORCH_MAX_TARGETS`
- `RECODER_A2A_ORCH_MAX_DEADLINE_MS`
- `RECODER_A2A_ORCH_POLICY_KEY`
- `RECODER_A2A_AUDIT_STREAM_KEY`
- `RECODER_A2A_AUDIT_TTL_MS`
- `RECODER_A2A_HISTORY_STREAM_BUFFER_SIZE`
- `RECODER_A2A_HISTORY_STREAM_POLL_MS`
- `RECODER_A2A_ENFORCE_SCOPE` (`true` to enforce orchestration scope checks)
- `RECODER_A2A_SCOPE_HEADER` (default: `x-recoder-a2a-scope`)
- `RECODER_A2A_ALLOW_HEADER_SCOPE_FALLBACK` (`true` only for temporary migration from header scopes to token claims)
- `RECODER_A2A_ADMIN_TOKEN_SCOPE` (single scope claim for `RECODER_A2A_ADMIN_TOKEN`)
- `RECODER_A2A_ADMIN_TOKEN_SCOPES` (JSON token->scope map; precedence over `RECODER_A2A_ADMIN_TOKEN`)
- `RECODER_A2A_BRIDGE_TOKEN_SCOPE` (scope claim for static bridge bearer token)
- Optional queue/result key prefixes:
  - `RECODER_A2A_BRIDGE_RESULT_ACK_KEY_PREFIX`
  - `RECODER_A2A_BRIDGE_JOB_QUEUE_PREFIX`
  - `RECODER_A2A_BRIDGE_RESULT_KEY_PREFIX`
  - `RECODER_A2A_BRIDGE_HEARTBEAT_KEY_PREFIX`
  - `RECODER_A2A_BRIDGE_SESSION_KEY_PREFIX`
  - `RECODER_A2A_HISTORY_STREAM_KEY_PREFIX`

## Hetzner Worker Operations

Bootstrap:
- `cp .env.a2a.workers.example .env.a2a.workers`
- Fill `RECODER_A2A_REDIS_URL`, handler URLs, and `RECODER_A2A_SHARED_SECRET`.
- Set internal service URLs used by worker launcher defaults:
  - `RECODER_WEB_INTERNAL_URL`
  - `RECODER_AGENCY_INTERNAL_URL`
  - `RECODER_PM_API_INTERNAL_URL`
  - `DOCKER_BACKEND_INTERNAL_URL`

Run workers:
- `scripts/a2a-workers-hetzner.sh start`
- `scripts/a2a-workers-hetzner.sh status`
- `scripts/a2a-workers-hetzner.sh logs`
- `scripts/a2a-workers-hetzner.sh stop`

Notes:
- Per-service consumer groups prevent one platform from accidentally acknowledging another platform's stream entry.
- Workers claim stale pending entries (`XAUTOCLAIM`) and emit failures to `recoder:a2a:deadletter`.
- Workers requeue transient execution failures with incrementing `attempt` and exponential backoff delay until `RECODER_A2A_MAX_RETRIES` is reached.
