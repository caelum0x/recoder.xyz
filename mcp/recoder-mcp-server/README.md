# Recoder MCP Server

This folder is the package boundary for Recoder-owned MCP servers.

Canonical servers are registered in `packages/agent-mcp`:

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

Implementation rule: MCP exposes tools/resources/prompts. Recoder Agent OS remains the source of truth for task state, approvals, artifacts, memory review, work locks, and audit history.
