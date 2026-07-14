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
- github_delivery_links
- work_signals
- policy_decisions
- oss_components
- memory_items
- memory_candidates
- events
- event_outbox
- mcp_servers
- mcp_tool_calls

Repository selection:

- Default: in-memory repository for local development.
- `AGENT_OS_STATE_FILE=/path/state.json`: JSON-file repository for lightweight durability.
- `AGENT_OS_REPOSITORY=postgres` with `AGENT_OS_DATABASE_URL` or `DATABASE_URL`: Postgres repository backed by this schema.

Run this migration before enabling the Postgres repository. Startup intentionally fails if `AGENT_OS_REPOSITORY=postgres` is set without a database URL.
