# Agent OS Contracts

The Agent OS boundary is defined by a small set of stable contracts:

- `TaskSpec`: normalized human, Beads, GitHub, Slack, PM, or Agency intent.
- `ContextPack`: Git Nexus repo graph, owners, tests, impact, and source refs.
- `PALPlan`: runtime, reviewer, sandbox, skills, MCP tool grants, risk, and approval gates.
- `InstructionBundle`: compiled runtime-specific instructions with provenance and verification.
- `RunEvent`: durable lifecycle and streaming event.
- `Artifact`: evidence, logs, summaries, PRs, previews, screenshots, and verification output.
- `Approval`: explicit pause/resume gate for risky work.
- `MemoryCandidate`: proposed memory with evidence, not silent model-written notes.
- `WorkLock`: write coordination across agents.
- `PolicyDecision`: allow, deny, or needs-approval result for a specific action.
- `BridgeJob` and `BridgeSession`: local/external bridge polling, pairing, heartbeat, result, and session ownership state.
- `RunHistoryEvent`: shared PM, Agents, Agency, runtime evidence, approval, handoff, artifact, and policy history.
- `RuntimeEvidence`: git status, clone provenance, stdout, stderr, file mutation, preview, browser, desktop, and verification evidence attached to a run.

Runtimes and tools can be swapped. These contracts should not drift per runtime.

`@recoder/agent-schemas` exposes `agentOsCanonicalSchemas` plus `validateAgentOsCanonicalSchema` as the discovery surface for runtime-safe guards. Keep schema field names aligned with `@recoder/agent-os` domain types; runtime adapters and MCP tools should not invent alternate contract shapes.
