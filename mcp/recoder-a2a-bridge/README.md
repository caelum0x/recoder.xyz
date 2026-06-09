# Recoder A2A Bridge

This folder documents the bridge boundary for A2A-compatible agents.

The bridge contract is implemented through:

- `packages/a2a-sdk`
- `tools/a2a-interop`
- `apps/agent-gateway`
- `docker-backend/src/a2a`

Bridge sessions must preserve durable agent identity, workspace binding, task/run history, artifacts, cancellation, and signed ingress metadata. The bridge does not own Recoder state.
