# OSS Inventory

Recoder uses OSS and external projects as capability providers, not as owners of product state.

Canonical state stays in Recoder:

- `TaskSpec`
- `AgentProfile`
- `InstructionBundle`
- `RunEvent`
- `Artifact`
- `Approval`
- `MemoryCandidate`
- `WorkLock`
- `PolicyDecision`

Capability providers are declared in `oss/manifests/oss-components.yaml`.

## Core Roles

- Beads: repo-local issue graph and offline task ledger.
- Git Nexus: repo intelligence, impact reports, owners, and related tests.
- PAL: planner that chooses runtime, reviewer, skills, tools, sandbox, and approvals.
- MCP: tool, resource, and prompt connector layer.
- A2A: agent/task wire protocol and streaming task updates.
- Claude Code: long-running implementation runtime.
- Codex: patch, review, investigation, and verification runtime.
- Recoder Code: native runtime expected to consume `TaskSpec` and `InstructionBundle` directly.
- Playwright MCP: browser verification and screenshot evidence.
- Daytona/E2B: sandbox execution substrates.
- mem0/pgvector: memory retrieval adapters; Recoder remains canonical memory store.
- OpenZiti/zrok: network isolation and tunnel options.
- Observability stack: health, logs, metrics, traces, and evidence.

## Rule

Adapters can fail. Recoder state must stay truthful.

Every capability provider should declare:

- contract
- source path or upstream
- health check
- owner
- patch policy
- whether it owns canonical state
