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
