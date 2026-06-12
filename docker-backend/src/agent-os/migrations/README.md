# Agent OS Migrations

This folder is reserved for the persistent Agent OS schema from `docs/arch.md`.

Minimum tables:

- agent_profiles
- agent_sessions
- agent_capabilities
- spaces
- tasks
- task_runs
- instruction_bundles
- work_locks
- approval_requests
- artifacts
- runtime_evidence
- work_signals
- memory_items
- memory_candidates
- events
- event_outbox
- mcp_servers
- mcp_tool_calls

The current `InMemoryAgentOsRepository` is an adoption boundary, not the final storage implementation.
