# Runtime Adapters

Runtime adapters translate Recoder task specs and instruction bundles into execution calls for external runtimes.

Supported runtime classes:

- Claude Code
- Codex
- Recoder Code
- OpenCode
- Qwen Code
- Gemini CLI
- browser agents
- custom hosted or local workers

All adapters should expose the same core contract:

- health
- capabilities
- start when applicable
- send task
- cancel
- approve when applicable
- stream shared `RunEvent` records

Adapters are replaceable. They do not own canonical task state, memory, approvals, artifacts, or verification history.

## Agent Identity Reconciliation

`AgentProfileReconciliationService` is the shared domain service for reconnect-safe agent identity. It matches an incoming profile by `agentId` first, then by connector/runtime surface plus optional workspace or project binding stored in profile health details. Reconnects merge capabilities, tools, supported intents, and health, but preserve existing permission, memory, approval, and cwd policy by default so a reconnect cannot silently expand authority.
