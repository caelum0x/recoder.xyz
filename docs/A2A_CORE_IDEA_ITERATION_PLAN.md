# A2A Core Idea Iteration Plan (Codex + Claude + Recoder)

Last updated: 2026-02-14

Companion strategy doc:
- `docs/A2A_CORE_PRODUCT_IDEA.md`

## Core Idea

Run a single A2A protocol plane across:
- Recoder cloud services (`recoder-web`, `docker-backend`, `recoder-agency`, `recoder-pm`)
- User-local terminal agents (`codex`, `claude_code`) via outbound bridge daemon

This makes orchestration mode (`codex_only`, `claude_only`, `parallel`, `handoff`, `fallback`) a product feature instead of service-specific logic.

## Current Build Status

Implemented:
- Signed envelope ingest (`/api/a2a/envelope`) with replay/idempotency checks
- Cross-service dispatch + stream workers + intent handlers
- Agent registry + orchestrate API
- Bridge queue APIs (`/api/a2a/bridge/*`) and local bridge daemon
- Bridge pairing/sessions (scoped tokens) + heartbeat/status
- Policy + audit controls:
  - `GET/PUT /api/a2a/policy`
  - `GET /api/a2a/audit`
  - dual-approval and deadline/target guardrails
- Deterministic parallel merge (`deterministic_score_v1`) with persisted provenance/timing
- Operator override API for merge winner (`/api/a2a/orchestrate/:threadId/:traceId/override`)
- Merge recompute API to roll back override (`/api/a2a/orchestrate/:threadId/:traceId/recompute`)

## Iteration Backlog

### Iteration A: Product Surface + Control Plane
1. Add Recoder web “Agents” panel:
   - primary agent, mode, dual-approval toggle
   - policy sync with `/api/a2a/policy`
2. Add per-workflow overrides persisted on thread/workflow settings.
3. Show provenance per step (agent, mode, traceId, policy decision).

### Iteration B: Deep Orchestration Semantics
1. Add `review` as first-class execution stage in all services.
2. Implement deterministic merge policy for `parallel`:
   - outcome scoring by success, latency, policy priority
   - persisted merge decision and winner
3. Add handoff packet schema and validation.

### Iteration C: Bridge Reliability + Governance
1. Device-code style pairing flow (web-initiated, short-lived code).
2. Bridge lease/online state with stale-session revocation.
3. Approval modes for risky commands:
   - local prompt required
   - allowlist by intent/tool
4. Cost/latency budgets enforced per orchestration.

### Iteration D: Ops + E2E
1. Prometheus-compatible metrics export:
   - success rate by mode/agent
   - queue depth and deadletter rate
   - retry spikes
2. Dashboard for bridge fleet + orchestration audits.
3. E2E matrix:
   - codex-only / claude-only / parallel / handoff / fallback
   - signature fail / replay / stale timestamp
   - dual-approval rejections

## Immediate Next Sprint (Recommended)

1. Wire policy + mode controls into Recoder web settings.
2. Add end-to-end smoke for paired bridge token flow on Hetzner staging.
3. Add merge conflict reason UI and operator override action.
   - backend override API is implemented; UI wiring remains.
