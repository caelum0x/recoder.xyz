# Agent OS API Rules

Use `/api/agent-os/*` for canonical Recoder control-plane state:

- spaces
- agents
- tasks
- runs
- approvals
- artifacts
- memory
- instructions
- policies
- events
- workflows

Use `/api/a2a/*` for A2A-compatible wire interoperability and connector traffic.

Use `/api/mcp/*` for Recoder MCP host and tool/resource/prompt registry surfaces.

Use `/internal/agent-os/*` only for worker-to-backend operations protected by `INTERNAL_SERVICE_KEY`.

Do not make runtime-specific routes the source of truth for task state, approvals, memory, artifacts, or verification.
