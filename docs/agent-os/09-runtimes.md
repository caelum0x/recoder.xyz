# Runtimes

Claude Code, Codex, Recoder Code, OpenCode, Qwen Code, Gemini CLI, OpenClaw-derived modules, browser agents, and future runtimes are execution adapters.

Runtimes receive `TaskSpec` plus `InstructionBundle`, then emit `RunEvent`, `Artifact`, `PolicyDecision`, `MemoryCandidate`, and verification evidence. They do not own canonical workspace state.

## Adapter Boundary

All runtime shims should use `createGenericRuntimeAdapter` unless they need a fully custom bridge. The generic adapter owns:

- adapter health and capability reporting
- `TaskSpec` plus `InstructionBundle` ingress
- normalized `RunEvent` output for `started`, `log`, `artifact`, `verified`, `needs_input`, `approval_requested`, `completed`, and `failed`
- cancellation via shared run id or task id aliases
- fail-safe behavior when no execution driver is attached

Runtime-specific code should live behind a `RuntimeExecutionDriver`. The driver receives the task input and an execution context with an `AbortSignal`; it may emit either full `RunEvent` objects or compact `RuntimeExecutionUpdate` objects. The adapter fills in canonical `taskId`, `agentId`, `runId`, timestamps, and structured failure metadata.

Concrete adapter factories keep backward-compatible string ids, but they also accept options:

```ts
createClaudeCodeAdapter({
  id: "claude-local",
  capabilities,
  health,
  driver,
});
```

Use that options path for Claude connector routes, the Codex JSON-RPC bridge, Recoder Code, OpenCode, Qwen Code, Gemini CLI, browser agents, and OSS framework bridges. Do not add runtime-specific task shapes outside this boundary.

## Fail-Safe Rule

An adapter without an execution driver must not mark work complete. It should report `runtime_unavailable` so Recoder can reroute, request operator action, or keep the run truthful in audit history.
