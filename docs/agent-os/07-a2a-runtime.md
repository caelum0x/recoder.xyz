# A2A Runtime

A2A is the agent/task transport layer.

Packages and surfaces:

- `packages/a2a-sdk`
- `apps/agent-gateway`
- `docker-backend/src/a2a`
- `mcp/recoder-a2a-bridge`

Use A2A for:

- agent discovery
- agent cards and capabilities
- task send/claim/status
- stream updates
- artifacts
- cancellation
- handoff

Recoder extensions include signed envelopes, instruction bundle references, policy decisions, work locks, approval gates, verification plans, and memory candidates.

`validateSignedEnvelopeIngress` in `@recoder/a2a-sdk/signing` is the shared signed-envelope validation boundary. Gateway ingress delegates to this validator, which checks envelope shape, timestamp validity, expiry, supported algorithm, configured secret requirements, and HMAC signature validity before unwrapping payloads.
