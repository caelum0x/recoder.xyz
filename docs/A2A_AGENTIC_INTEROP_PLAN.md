# Recoder A2A Agentic Interop Plan

## Goal

Provide one communication contract so all Recoder services and external coding agents can collaborate:
- `recoder-web`
- `docker-backend`
- `recoder-pm`
- `recoder-agency`
- desktop/CLI agents
- external peers (`codex`, `claude_code`)

## Protocol Baseline

- A2A protocol version: `0.3.0`
- Transport baseline: JSON-RPC 2.0 over HTTP(S)
- Recoder overlay: `RecoderA2AEnvelope` carried inside A2A `text` parts

## Recoder Overlay Contract

Envelope fields:
- routing: `from`, `to`, `threadId`
- workflow semantics: `intent` (`plan`, `execute`, `review`, `handoff`, `tool_call`, `tool_result`, `status`, `sync`, `error`)
- payload: typed parts (`text`, `json`, `command`, `artifact`)
- tracing: `traceId`, `parentMessageId`

This keeps internal execution models private while standardizing inter-agent collaboration.

## Codex + Claude Code Interop

Canonical approach:
1. Convert provider-native chat message to `RecoderA2AEnvelope`.
2. Exchange via A2A (or queue/webhook carrying the same envelope).
3. Convert the received envelope back to each provider-native shape.

Implemented adapters:
- TypeScript: `shared/src/a2a/bridge.ts`
- Python: `tools/a2a-interop/python/codex_claude_bridge.py`

## Web to Terminal Bridge Runtime

For `recoder.xyz` web users, Codex/Claude CLIs run locally on the user machine via an outbound bridge daemon.

Bridge script:
- `tools/a2a-interop/js/recoder-a2a-bridge.mjs`
- npm command: `pnpm a2a:bridge:start`

Required env:
- `RECODER_A2A_BRIDGE_URL`
- `RECODER_A2A_BRIDGE_TOKEN`

Optional env:
- `RECODER_A2A_CODEX_CMD` (default `codex`)
- `RECODER_A2A_CLAUDE_CMD` (default `claude`)
- `RECODER_A2A_BRIDGE_POLL_MS`
- `RECODER_A2A_BRIDGE_HEARTBEAT_MS`
- `RECODER_A2A_BRIDGE_COMMAND_TIMEOUT_MS`
- `RECODER_A2A_BRIDGE_ONESHOT` (single poll cycle)

Expected bridge API contract:
- `GET /api/a2a/bridge/jobs/next`
- `POST /api/a2a/bridge/jobs/:jobId/result`
- `POST /api/a2a/bridge/heartbeat`

## Integration Sequence

1. Publish each Recoder service as an A2A endpoint with an Agent Card.
2. Use `@recoder/shared/a2a` in JS/TS runtimes.
3. Use the Python bridge in Python runtimes.
4. Add auth/signature checks in each ingress route.
5. Add replay protection and idempotency by `messageId`.
6. Track cross-agent traces with `traceId`.

## Minimum Rollout Checklist

- [ ] Agent card for each service published at `/.well-known/agent-card.json`
- [ ] Incoming envelope validated before execution
- [ ] Outgoing envelope includes `threadId` and `traceId`
- [ ] Codex -> Claude Code roundtrip smoke test passes
- [ ] Claude Code -> Codex roundtrip smoke test passes
- [ ] Task handoff between at least 2 Recoder services passes
