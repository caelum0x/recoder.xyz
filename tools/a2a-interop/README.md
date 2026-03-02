# Recoder A2A Interop Kit

This folder provides a portable communication contract for cross-agent orchestration in the Recoder ecosystem.

## What is included

- `schemas/recoder-a2a-envelope.schema.json`: JSON Schema for the Recoder envelope.
- `js/codex-claude-bridge.mjs`: JavaScript bridge example for Codex <-> Claude Code.
- `python/codex_claude_bridge.py`: Python bridge example for Codex <-> Claude Code.

## Shared package contract

Primary TypeScript contract:
- `shared/src/a2a/types.ts`
- `shared/src/a2a/bridge.ts`

Import with:

```ts
import { codexToEnvelope, envelopeToClaudeCode } from '@recoder/shared/a2a';
```

## Smoke usage

```bash
node tools/a2a-interop/js/codex-claude-bridge.mjs
python3 tools/a2a-interop/python/codex_claude_bridge.py
```

## Signed HTTP smoke (Codex <-> Claude Code)

This verifies live A2A ingress compatibility with signed envelopes.

Required env:
- `RECODER_A2A_SHARED_SECRET`
- Either:
  - `RECODER_A2A_SMOKE_ENDPOINT` (single target for both directions), or
  - `RECODER_A2A_CODEX_ENDPOINT` and `RECODER_A2A_CLAUDE_ENDPOINT`

Optional env:
- `RECODER_A2A_CODEX_AGENT_ID` (default: `codex`)
- `RECODER_A2A_CLAUDE_AGENT_ID` (default: `claude_code`)
- `RECODER_A2A_THREAD_ID`
- `RECODER_A2A_CODEX_MESSAGE`

Run:

```bash
pnpm a2a:smoke:codex-claude
```

## Local terminal bridge daemon (web <-> terminal)

Use this when Recoder web should dispatch jobs to local Codex/Claude CLIs.

Required env:
- `RECODER_A2A_BRIDGE_URL` (Recoder backend URL)
- `RECODER_A2A_BRIDGE_TOKEN` (short-lived bridge token from Recoder auth/pairing)

Optional env:
- `RECODER_A2A_BRIDGE_ID` (default random UUID)
- `RECODER_A2A_CODEX_CMD` (default: `codex`)
- `RECODER_A2A_CLAUDE_CMD` (default: `claude`)
- `RECODER_A2A_BRIDGE_POLL_MS` (default: `1500`)
- `RECODER_A2A_BRIDGE_HEARTBEAT_MS` (default: `15000`)
- `RECODER_A2A_BRIDGE_COMMAND_TIMEOUT_MS` (default: `120000`)
- `RECODER_A2A_BRIDGE_ONESHOT` (default: `false`, runs single poll then exits)

Run:

```bash
pnpm a2a:bridge:start
```

Bridge API contract expected by this daemon:
- `GET /api/a2a/bridge/jobs/next` -> `204` (no scope-matching job) or JSON `{ jobId, agentId, envelope, traceId?, scope? }`
- `POST /api/a2a/bridge/jobs/:jobId/result` (result envelope)
- `POST /api/a2a/bridge/heartbeat`

Admin APIs related to bridge operations:
- `GET /api/a2a/policy`
- `PUT /api/a2a/policy`
- `GET /api/a2a/orchestrate/:threadId/:traceId/history` (`cursor` + `limit` pagination)
- `GET /api/a2a/orchestrate/:threadId/:traceId/history/stream` (SSE; supports `eventTypes`, `sinceAt`, `lastEventId` / `Last-Event-ID`, token-scope enforcement)
- `POST /api/a2a/orchestrate/:threadId/:traceId/override`
- `POST /api/a2a/orchestrate/:threadId/:traceId/recompute`
- `POST /api/a2a/bridge/pair`
- `GET /api/a2a/bridge/sessions`
- `POST /api/a2a/bridge/jobs`
- `GET /api/a2a/bridge/jobs/:jobId/result`
- `GET /api/a2a/bridge/heartbeats`
- `GET /api/a2a/bridge/heartbeats/:bridgeId`

## Weekly evidence pack generator (SFA-017)

Generates a structured JSON evidence pack tracking connector health, latency
percentiles, policy metrics, and release readiness. Intended to run weekly in
CI and on manual dispatch.

Data sources:
- `logs/release-evidence/` (summary + connector-support JSON files)
- `logs/phase3-gates/` (scorecard + connector-support JSON files)
- `shared/src/a2a/snapshots/connector-contract.snapshot.json` (schema versions)
- `docs/SLO.md` (threshold definitions)

Output sections:
- `connector_health` -- per-connector success rate, status distribution, SLO evaluation
- `latency_stats` -- p50/p95/p99 by connector and overall gate execution
- `policy_summary` -- checks, approvals, denials, skips, approval turnaround
- `slo_compliance` -- per-check pass/fail against SLO thresholds
- `release_readiness` -- overall PASS/FAIL verdict with blocker details

Usage:

```bash
# default 7-day look-back, output to logs/evidence-packs/
pnpm evidence:pack

# 30-day look-back
pnpm evidence:pack:30d

# custom output path and period
node tools/a2a-interop/js/generate-evidence-pack.mjs --period-days 14 --output /tmp/pack.json

# JSON-only mode (no console output)
node tools/a2a-interop/js/generate-evidence-pack.mjs --json
```

CI workflow: `.github/workflows/weekly-evidence-pack.yml`

## Tier-2 connector promotion validator (SFA-022)

Checks that each Tier-2 connector has:
- RFC draft with required sections and policy mapping
- evidence artifacts in `logs/phase3-gates` and `logs/release-evidence`
- optional promotable status assertion (`supported|ga|promoted`)

Usage:

```bash
# checklist validation for all Tier-2 connectors
pnpm connectors:tier2:validate

# strict assert mode (fails unless latest connector status is promotable)
pnpm connectors:tier2:assert

# validator test suite
pnpm test:tier2:validator

# single connector
node tools/a2a-interop/js/validate-tier2-promotion.mjs --connector cursor
node tools/a2a-interop/js/validate-tier2-promotion.mjs --connector cursor --assert-promotable
```

Phase3/CI gate wrappers:
- `pnpm phase3:tier2:gate` (checklist mode)
- `pnpm phase3:tier2:assert` (strict promotable mode)

## Tier-2 promotion workflow (P15-010)

Controlled workflow stages:
- `backlog -> pilot -> supported`
- transitions are blocked unless RFC + evidence checks pass
- promotion checks require Tier-1 support gates and no-skip closeout precondition from latest phase3 artifact

Usage:

```bash
# current workflow state
pnpm phase3:tier2:workflow:status

# validate a transition request (no state write)
node tools/a2a-interop/js/tier2-promotion-workflow.mjs \
  validate --connector cursor --to pilot --json

# apply a transition when gates pass
node tools/a2a-interop/js/tier2-promotion-workflow.mjs \
  transition --connector cursor --to pilot --apply \
  --approved-by "release-bot" --reason "pilot rollout approved"

# workflow tests
pnpm test:tier2:workflow
```

Optional CI gate inputs (via `scripts/check-tier2-promotion.sh`):
- `TIER2_PROMOTION_CONNECTOR=<id>`
- `TIER2_PROMOTION_TARGET=<pilot|supported>`
