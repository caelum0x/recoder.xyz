# Agent OS OSS Inventory

Recoder treats OSS and internal projects as components behind explicit contracts. The canonical machine-readable inventory lives in `oss/manifests/recoder-components.yaml`; `oss/manifests/oss-components.yaml` is the smaller compatibility manifest for generic OSS health checks.

## Contract Owners

- Agent OS owns canonical task, run, instruction, policy, memory, event, artifact, and approval state.
- Beads owns repo-local task graph sync through `TaskGraph`.
- Git Nexus owns repo intelligence through `RepoIntelligence`.
- PAL owns planning and routing through `Planner`.
- MCP servers own tool/data access through `McpServer`.
- A2A owns external agent/task transport through `A2AAgent`.
- Claude Code, Codex, Recoder Code, OpenCode, Qwen Code, Gemini CLI, and browser agents are `RuntimeAdapter` implementations.

## Registry Rules

- Every component must declare owner, status, contract, location, health check, and security risk.
- Components that execute code, handle secrets, or touch production must require auth.
- Vendored or forked OSS must declare patch policy and owner before it is wired into runtime paths.
- Unknown infrastructure should be registered as `needs-contract` instead of silently becoming part of production behavior.

`RecoderComponentRegistry` is the typed in-code view over `recoder-components.yaml` style descriptors. It supports lookup by id, contract, owner, canonical-state ownership, validation findings, and security-risk ordering so UI/API surfaces can answer "what owns this contract?" without parsing manifests ad hoc.
