# MCP Integration

MCP is Recoder's tool and context connector standard. It is not the Agent OS state model.

Recoder can expose and consume MCP servers for:

- GitHub and repository data
- browser automation
- deployment and preview checks
- memory candidate review
- logs and artifacts
- billing and approvals

Tool descriptions are not enforcement. Every MCP tool call must pass through policy before execution when it can read sensitive data, mutate state, access the network, or publish artifacts.

The control flow is:

```text
runtime
  -> Recoder MCP host
  -> MCP registry
  -> policy engine
  -> allowed tool call
  -> audit event
```

## Agent OS Tool Surfaces

The MCP package now exposes executable registration helpers for two control-plane critical surfaces:

- `recoder.work_locks`: `work_locks.list`, `work_locks.acquire`, and `work_locks.release` call `WorkLockService` and require caller state ports to list and replace locks.
- `recoder.memory`: `memory.search`, `memory.candidate.create`, and `memory.review` call `MemoryStore` and `MemoryReviewWorkflow` so agents can propose memory but cannot silently write accepted memory without review.

Memory candidate creation requires task and artifact evidence. The tool accepts both domain-style evidence keys (`taskId`, `artifactId`) and hook-style keys (`task_id`, `artifact_id`) so Claude/Codex hook output can flow through the same reviewed memory path.
