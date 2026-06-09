# Instruction Compiler

The instruction compiler turns task intent into runtime-specific instructions.

Inputs include:

- `TaskSpec`
- `AgentProfile`
- root `AGENTS.md`
- `CLAUDE.md` or `.codex/AGENTS.md`
- repo/path rules
- policy gates
- memory snapshots
- recent failure patterns
- verification plan

Output is an `InstructionBundle` with shared goal, rendered prompt, acceptance criteria, verification commands, forbidden actions, approval gates, memory refs, source refs, and provenance.

Every orchestrated run should store the compiled bundle or a durable `InstructionBundleRef` so later review can answer what the agent knew and which rules were loaded.

## API Surface

The Agent OS API exposes instruction compilation at:

```text
POST /api/agent-os/instructions/compile
POST /api/agent-os/instructions
```

The request can pass either inline `task` and `agent` objects or existing `taskId` and `agentId` references. The endpoint resolves the `TaskSpec` and `AgentProfile`, calls `compileAgentOsInstructionBundle`, persists the runtime-ready `InstructionBundle`, and returns both:

- `runtimeBundle`: the Agent OS bundle used by runtime adapters.
- `auditBundle`: the A2A-compatible audited bundle with rendered prompt, source refs, memory refs, verification commands, approval gates, and provenance.
- `artifact`: an `instruction_bundle` artifact containing the runtime bundle and audit bundle for PM, Agency, and future audit views.

Direct `POST /api/agent-os/instructions` upserts are for externally compiled or restored bundles. They also create the same `instruction_bundle` artifact by default, with `createArtifact: false` reserved for import/reconciliation jobs that must avoid duplicate artifact records.

This keeps manual prompting as a fallback. The normal path is task state plus agent identity plus repo/policy/memory context compiled into a runtime-specific instruction artifact.
