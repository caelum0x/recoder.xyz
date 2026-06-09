# Recoder Monorepo Rules

Keep the Agent OS boundary clean:

- `packages/agent-os` owns domain contracts and legal state transitions.
- `packages/a2a-sdk` owns wire-level A2A interoperability contracts.
- `packages/agent-instructions` owns instruction loading, rendering, and provenance.
- `packages/agent-policy` owns deterministic policy decisions.
- `packages/agent-events` owns CloudEvents and outbox envelopes.
- `packages/agent-memory` owns reviewed memory candidate lifecycle helpers.
- `packages/agent-runtimes` owns runtime adapter contracts.
- `packages/agent-workflows` owns workflow definitions and driver contracts.
- `packages/agent-mcp` owns MCP registry and tool permission contracts.

Do not couple core packages to specific runtimes, UI apps, sandboxes, or model providers. Runtimes and OSS systems are adapters around Recoder state, not owners of Recoder state.
