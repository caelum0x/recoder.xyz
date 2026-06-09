# Security Policy

Recoder uses three layers:

1. Instruction guidance: `AGENTS.md`, `CLAUDE.md`, `.codex/AGENTS.md`, skills, rules.
2. Runtime guardrails: Claude/Codex hooks, MCP permissions, runtime adapter policy.
3. Server enforcement: policy engine, work locks, signed envelopes, approvals, artifacts, audit events.

Critical gates:

- `file.write`
- `command.run`
- `tool.call`
- `secret.read`
- `network.request`
- `memory.write`
- `artifact.publish`
- `branch.push`
- `pull_request.open`
- `preview.deploy`
- `production.deploy`
- `billing.change`
- `auth.change`

Policy starts in TypeScript through `packages/agent-policy`. OPA can be added when policies need customer/admin configuration across services.
