# MCP Tools

MCP is the tool/context layer for agents. It is not the agent state model.

Package:

- `packages/agent-mcp`

Server registrations:

- `recoder.tasks`
- `recoder.runs`
- `recoder.artifacts`
- `recoder.approvals`
- `recoder.memory`
- `recoder.git_nexus`
- `recoder.beads`
- `recoder.github`
- `recoder.repo`
- `recoder.browser`
- `recoder.preview`
- `recoder.deploy`
- `recoder.billing`
- `recoder.logs`
- `recoder.oss`

Every MCP tool call should pass through policy and produce an audit event.

MCP descriptions are not enforcement. Recoder policy, work locks, signed ingress, and approvals are enforcement.
