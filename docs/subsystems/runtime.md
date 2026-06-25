# Subsystem: `packages/runtime`

> The Recoder **Runtime** subsystem. It drives the user's *own* coding-agent CLIs
> (Claude Code, OpenAI Codex, opencode, pi, plus in-process agents) headless, behind one
> uniform driver contract, and streams every byte of their work back to the control plane
> as `RunEvent` records.

This is a **first-party** subsystem. Everything fused here is code we own and merge — we
edit and reshape it, we never thin-HTTP-wrap it. The runtime is an **execution surface**,
not a state-of-record: canonical task/approval/memory/artifact state lives in
`@recoder/agent-os`. The runtime only *emits* `RunEvent`s and *consumes* `TaskSpec` +
`InstructionBundle` + `RuntimePolicy`.

---

## 1. Mission and boundaries

### What it does
1. Accept a compiled task (`RuntimeTaskInput = { task: TaskSpec, bundle: InstructionBundle, policy: RuntimePolicy }`).
2. Pick a **driver** for the requested `AgentSurface` (`claude_code | codex | opencode | recoder_code | qwen_code | gemini_cli | custom | browser`).
3. Launch the user's real CLI **headless** (print / json / rpc / acp / exec modes) inside a chosen **execution environment** (local process, sandbox, hosted) at a policy-bounded `cwd`.
4. Translate the CLI's native event stream (JSONL frames, ANSI text, ACP messages, tool calls) into the canonical `RunEvent` stream.
5. Enforce runtime-layer policy gates (work locks, forbidden paths, approval pauses) *before* the model can write.
6. Persist a replayable run journal, attach evidence artifacts, and surface truthful health/capabilities.

### What it explicitly does NOT do
- It does not own task state, approvals, memory, or artifact records (that is `agent-os`).
- It does not compile instructions (that is `@recoder/agent-instructions`).
- It does not decide policy *outcomes* (that is `@recoder/agent-policy`); it *enforces* the decisions it is handed and refuses to proceed when a gate is open.
- It does not publish to NATS/Postgres directly (it hands `RunEvent`s to `@recoder/agent-events`).
- It does not provision sandboxes (that is `@recoder/agent-sandbox` / `sandbox-daytona`); it *uses* them through a thin environment port.

### The contract it must keep compatible (cited, read)
`AgentRuntimeAdapter` in `packages/agent-runtimes/src/index.ts` and the mirrored port
`RuntimeAdapterPort` in `packages/agent-os/src/ports/runtime-adapter.ts`:

```ts
interface AgentRuntimeAdapter {
  id: string;
  kind: AgentSurface | 'browser_agent';
  health(): Promise<RuntimeHealth>;
  capabilities(): Promise<AgentCapability[]>;
  start?(input: RuntimeStartInput): Promise<RuntimeHandle>;
  sendTask(input: RuntimeTaskInput): AsyncIterable<RunEvent>;
  cancel(runId: string): Promise<void>;
  approve?(approvalId, decision): Promise<void>;
}
```

`packages/runtime` **becomes the real implementation** behind these factory shells.
`packages/agent-runtimes` stays as the *contract* package (types + port); `packages/runtime`
depends on it and exports concrete drivers. The current factory files
(`adapters/codex-adapter.ts`, `claude-code-adapter.ts`, `opencode-adapter.ts`, etc.) today
return a `createGenericRuntimeAdapter` with **no driver attached** — they emit `started` then
throw `runtime_unavailable` because `options.driver?.run` is undefined
(`packages/agent-runtimes/src/adapters/generic-adapter.ts:140`). This subsystem supplies the
missing drivers.

---

## 2. File tree (`packages/runtime`)

```text
packages/runtime
├── package.json                         # @recoder/runtime; deps: agent-runtimes, agent-os, pi-*, ai
├── tsup.config.ts                       # multi-entry build (index, drivers/*, env/*)
├── tsconfig.json
├── README.md
└── src
    ├── index.ts                         # public barrel: createRuntime, registry, driver factories
    ├── public-api.ts                    # the curated public surface (re-exports, nothing private leaks)
    │
    ├── engine/                          # the uniform core that every driver plugs into
    │   ├── runtime.ts                   # createRuntime(): builds registry + engine, top-level entry
    │   ├── runtime-engine.ts            # orchestrates one sendTask(): lifecycle, gates, normalization
    │   ├── run-context.ts               # per-run context object (ids, signal, emit, clock, deadlines)
    │   ├── run-lifecycle.ts             # state machine wrapper aligned to TaskRunState transitions
    │   ├── event-pipeline.ts            # async pipeline: driver frames -> middleware -> RunEvent sink
    │   ├── event-normalizer.ts          # coerce RuntimeExecutionOutput -> canonical RunEvent (ids, agentId)
    │   ├── terminal-event-guard.ts      # detect completed/failed; forbid post-terminal emissions
    │   ├── cancellation.ts              # AbortController registry keyed by runId + taskId aliases
    │   ├── deadline.ts                  # wall-clock + idle timeouts -> timeout RuntimeAdapterError
    │   ├── backpressure.ts              # bounded queue between driver and consumer; drop/coalesce logs
    │   ├── concurrency-limiter.ts       # per-surface + global max concurrent runs (semaphore)
    │   ├── run-journal.ts               # append-only in-memory journal of emitted events for replay
    │   ├── retry-policy.ts              # classify RuntimeErrorCode -> retryable; exponential backoff
    │   ├── emit.ts                      # low-level RunEvent builder (wraps runtimeEvent factory)
    │   └── index.ts
    │
    ├── adapter/                         # the AgentRuntimeAdapter implementation over a driver
    │   ├── runtime-adapter.ts           # createRuntimeAdapter(driver, opts): implements AgentRuntimeAdapter
    │   ├── adapter-options.ts           # resolve id/kind/capabilities/health from driver descriptor
    │   ├── send-task.ts                 # async generator: start->gate->run->normalize->terminal
    │   ├── health-aggregator.ts         # merge driver health + env health + CLI-presence probe
    │   ├── capability-resolver.ts       # AgentCapability[] from driver descriptor + CLI feature probe
    │   ├── approve.ts                   # forward approval decisions to a paused, awaiting driver run
    │   └── index.ts
    │
    ├── registry/                        # driver discovery + selection
    │   ├── driver-registry.ts           # register/lookup drivers by AgentSurface + variant id
    │   ├── driver-descriptor.ts         # static metadata: kind, surfaces, capabilities, modes, cli
    │   ├── surface-resolver.ts          # TaskSpec/AgentProfile -> chosen driver descriptor
    │   ├── builtin-drivers.ts           # register claude-code, codex, opencode, pi, in-process, browser
    │   ├── variant-resolver.ts          # pick headless mode variant (json vs rpc vs acp vs exec)
    │   └── index.ts
    │
    ├── contracts/                       # the driver SPI every fused source implements
    │   ├── runtime-driver.ts            # RuntimeDriver interface: start/run/cancel/approve/probe
    │   ├── driver-context.ts            # DriverContext: cwd, env, signal, emit, policy, deadlines
    │   ├── driver-frame.ts              # DriverFrame union (text, json-event, tool-call, error, done)
    │   ├── driver-result.ts             # DriverResult: exit code, stop reason, usage, final text
    │   ├── headless-mode.ts             # HeadlessMode enum: print | json | rpc | acp | exec | in_process
    │   ├── cli-invocation.ts            # CliInvocation: command, args, stdin, env, cwd builder type
    │   └── index.ts
    │
    ├── types/                           # subsystem-local domain types (Zod-backed)
    │   ├── runtime-config.ts            # RuntimeConfig schema (timeouts, concurrency, paths)
    │   ├── runtime-policy.ts            # re-export + Zod parse of RuntimePolicy from agent-runtimes
    │   ├── run-id.ts                     # RunId/branded ids + makeRunId()
    │   ├── usage.ts                      # TokenUsage/cost accounting shape (from pi-ai usage)
    │   ├── tool-call.ts                  # normalized ToolCall/ToolResult shape across all CLIs
    │   ├── stop-reason.ts               # unified StopReason mapping (end_turn|error|aborted|max_steps)
    │   ├── evidence.ts                   # RuntimeEvidence artifact descriptors (diff, log, html, junit)
    │   └── index.ts
    │
    ├── drivers/                         # ONE folder per fused agent; each implements RuntimeDriver
    │   │
    │   ├── shared/                       # reusable driver machinery (the merge of common CLI code)
    │   │   ├── process-driver.ts        # base class: spawn CLI, wire stdio, stream frames, exit
    │   │   ├── spawn.ts                  # MERGE of pi-coding-agent/src/utils/child-process.ts
    │   │   ├── wait-for-exit.ts          # MERGE of waitForChildProcess (windows stdio grace handling)
    │   │   ├── jsonl-reader.ts           # line-delimited JSON stream reader (MERGE pi rpc/jsonl.ts)
    │   │   ├── jsonl-writer.ts           # write JSONL commands to a child's stdin (rpc steering)
    │   │   ├── ansi-text-reader.ts       # buffer + strip ANSI for print-text CLIs (uses pi ansi util)
    │   │   ├── env-builder.ts            # assemble child env: policy-scoped, secret-redacted, BYOK keys
    │   │   ├── arg-builder.ts            # compose CLI args from TaskSpec + bundle + headless mode
    │   │   ├── cwd-resolver.ts           # apply CwdPolicy: repo_root|workspace_root|task_path
    │   │   ├── prompt-writer.ts          # write renderedPrompt to stdin or temp prompt file
    │   │   ├── stdin-prompt.ts           # feed InstructionBundle.renderedPrompt as first message
    │   │   ├── cli-locator.ts            # find the user's CLI binary (PATH, node_modules/.bin, config)
    │   │   ├── cli-version-probe.ts      # `--version` probe -> health + capability gating
    │   │   ├── frame-debouncer.ts        # coalesce token deltas into log RunEvents (rate-limited)
    │   │   ├── tool-call-tracker.ts      # pair tool-call frames with results across the stream
    │   │   └── index.ts
    │   │
    │   ├── claude-code/                  # drives the user's `claude` CLI headless
    │   │   ├── claude-code-driver.ts     # RuntimeDriver impl; spawns claude in stream-json mode
    │   │   ├── claude-args.ts            # build `-p --output-format stream-json --verbose` args
    │   │   ├── claude-stream-json.ts     # parse Anthropic stream-json frames -> DriverFrame
    │   │   ├── claude-tool-mapper.ts     # map claude tool_use/tool_result -> normalized ToolCall
    │   │   ├── claude-permission-bridge.ts # map policy -> --permission-mode / --allowedTools flags
    │   │   ├── claude-mcp-config.ts      # write .mcp.json passthrough from agent-mcp registry
    │   │   ├── claude-session.ts         # --resume / --session-id continuity for steering
    │   │   ├── claude-health.ts          # claude CLI presence + auth-state probe
    │   │   ├── claude-capabilities.ts    # static AgentCapability[] for claude_code surface
    │   │   ├── claude-descriptor.ts      # DriverDescriptor wiring all of the above
    │   │   └── index.ts
    │   │
    │   ├── codex/                        # drives the user's OpenAI `codex` CLI (FUSE oh-my-codex)
    │   │   ├── codex-driver.ts           # RuntimeDriver impl; `codex exec --json` headless
    │   │   ├── codex-args.ts             # build exec args, sandbox/approval flags, model/profile
    │   │   ├── codex-event-stream.ts     # parse codex experimental JSON events -> DriverFrame
    │   │   ├── codex-tool-mapper.ts      # codex tool/patch events -> normalized ToolCall/diff
    │   │   ├── codex-approval-bridge.ts  # map codex on-request approvals -> approval_requested
    │   │   ├── codex-config-writer.ts    # MERGE oh-my-codex/src/config/generator.ts (config.toml)
    │   │   ├── codex-mcp-registry.ts     # MERGE oh-my-codex/src/config/mcp-registry.ts
    │   │   ├── codex-runtime-bridge.ts   # ADAPT oh-my-codex/src/runtime/bridge.ts (omx-runtime sidecar, optional)
    │   │   ├── codex-profile.ts          # ADAPT oh-my-codex/src/config/models.ts (model/profile select)
    │   │   ├── codex-health.ts           # codex CLI presence + login state probe
    │   │   ├── codex-capabilities.ts     # static AgentCapability[] for codex surface
    │   │   ├── codex-descriptor.ts       # DriverDescriptor
    │   │   └── index.ts
    │   │
    │   ├── opencode/                     # drives the user's `opencode` CLI (FUSE oh-my-openagent)
    │   │   ├── opencode-driver.ts        # RuntimeDriver impl; opencode run --print-logs / server
    │   │   ├── opencode-args.ts          # build run/serve args, model, agent selection
    │   │   ├── opencode-event-stream.ts  # parse opencode SSE/JSON message stream -> DriverFrame
    │   │   ├── opencode-server-client.ts # talk to opencode's local server API when in server mode
    │   │   ├── opencode-tool-mapper.ts   # opencode tool parts -> normalized ToolCall
    │   │   ├── opencode-plugin-config.ts # ADAPT oh-my-openagent/src/plugin-config.ts (config load)
    │   │   ├── opencode-hooks-bridge.ts  # ADAPT oh-my-openagent/src/create-hooks.ts -> RunEvent hooks
    │   │   ├── opencode-tools-bridge.ts  # ADAPT oh-my-openagent/src/create-tools.ts (extra tools)
    │   │   ├── opencode-tmux-config.ts   # ADAPT oh-my-openagent/src/create-runtime-tmux-config.ts
    │   │   ├── opencode-health.ts        # opencode CLI presence + auth probe
    │   │   ├── opencode-capabilities.ts  # static AgentCapability[]
    │   │   ├── opencode-descriptor.ts    # DriverDescriptor
    │   │   └── index.ts
    │   │
    │   ├── pi/                           # drives the in-repo `pi` agent (FUSE pi-coding-agent)
    │   │   ├── pi-driver.ts              # RuntimeDriver impl; runs pi headless in-process or spawned
    │   │   ├── pi-print-driver.ts        # IN-PROCESS via runPrintMode (pi-coding-agent print-mode.ts)
    │   │   ├── pi-rpc-driver.ts          # JSONL RPC via pi rpc-mode (steer/follow_up/abort/get_state)
    │   │   ├── pi-rpc-client.ts          # ADAPT pi-coding-agent/src/modes/rpc/rpc-client.ts
    │   │   ├── pi-session-host.ts        # construct AgentSessionRuntime for in-process runs
    │   │   ├── pi-event-mapper.ts        # pi session events (print-mode json) -> DriverFrame
    │   │   ├── pi-rpc-command-mapper.ts  # RuntimeTaskInput/steer -> RpcCommand (rpc-types.ts)
    │   │   ├── pi-model-resolver.ts      # bridge to pi-ai model registry + BYOK keys
    │   │   ├── pi-tool-mapper.ts         # pi AgentToolCall/AgentToolResult -> normalized ToolCall
    │   │   ├── pi-compaction.ts          # expose pi compaction as a control op (set_auto_compaction)
    │   │   ├── pi-health.ts              # pi self-check (model auth, provider reachability)
    │   │   ├── pi-capabilities.ts        # static AgentCapability[]
    │   │   ├── pi-descriptor.ts          # DriverDescriptor
    │   │   └── index.ts
    │   │
    │   ├── in-process/                   # in-repo Vercel-AI agent (FUSE open-agents ToolLoopAgent)
    │   │   ├── tool-loop-driver.ts       # RuntimeDriver impl over ai.ToolLoopAgent (open-agent.ts)
    │   │   ├── tool-loop-stream.ts       # consume fullStream -> DriverFrame (text/tool/step/finish)
    │   │   ├── tool-loop-tools.ts        # ADAPT open-agents tools (read/write/edit/bash/grep/glob)
    │   │   ├── tool-loop-context.ts      # build AgentSandboxContext from DriverContext env
    │   │   ├── tool-loop-models.ts       # ADAPT open-agents models.ts (gateway model selection)
    │   │   ├── tool-loop-system-prompt.ts# ADAPT open-agents system-prompt.ts + bundle.renderedPrompt
    │   │   ├── tool-loop-subagents.ts    # ADAPT open-agents subagents (executor/explorer) as RunEvents
    │   │   ├── tool-loop-health.ts       # provider/gateway reachability probe
    │   │   ├── tool-loop-capabilities.ts # static AgentCapability[]
    │   │   ├── tool-loop-descriptor.ts   # DriverDescriptor
    │   │   └── index.ts
    │   │
    │   ├── recoder-code/                 # the Recoder-native surface (recoder_code)
    │   │   ├── recoder-code-driver.ts    # delegates to pi or in-process per config (first-party default)
    │   │   ├── recoder-code-descriptor.ts
    │   │   └── index.ts
    │   │
    │   ├── gemini-cli/                   # drives `gemini` CLI headless (generic process driver)
    │   │   ├── gemini-driver.ts
    │   │   ├── gemini-args.ts
    │   │   ├── gemini-event-stream.ts
    │   │   ├── gemini-descriptor.ts
    │   │   └── index.ts
    │   │
    │   ├── qwen-code/                    # drives `qwen-code` CLI headless (generic process driver)
    │   │   ├── qwen-driver.ts
    │   │   ├── qwen-args.ts
    │   │   ├── qwen-event-stream.ts
    │   │   ├── qwen-descriptor.ts
    │   │   └── index.ts
    │   │
    │   ├── acp/                          # Agent Client Protocol generic driver (Zed/Codex ACP)
    │   │   ├── acp-driver.ts             # RuntimeDriver over JSON-RPC ACP transport
    │   │   ├── acp-transport.ts          # newline-framed JSON-RPC over stdio
    │   │   ├── acp-session.ts            # session/new, session/prompt, session/cancel
    │   │   ├── acp-event-mapper.ts       # ACP session updates -> DriverFrame
    │   │   ├── acp-permission-bridge.ts  # ACP requestPermission -> approval_requested
    │   │   ├── acp-descriptor.ts
    │   │   └── index.ts
    │   │
    │   └── index.ts                      # export all driver descriptors for builtin-drivers
    │
    ├── env/                              # execution environments (where the CLI runs)
    │   ├── execution-environment.ts      # ExecutionEnvironment port: spawn, exec, fs, cwd, dispose
    │   ├── local-environment.ts          # local child_process environment (default)
    │   ├── sandbox-environment.ts        # delegates to @recoder/agent-sandbox (Daytona/E2B)
    │   ├── sandbox-exec-stream.ts        # stream remote exec stdout/stderr as frames
    │   ├── hosted-environment.ts         # hosted/remote worker environment (internal service)
    │   ├── env-factory.ts                # pick env from RuntimeKind + policy
    │   ├── workspace-resolver.ts         # workspaceId -> concrete root path (git worktree aware)
    │   ├── git-worktree-env.ts           # create/reuse worktree branch per branchPolicy
    │   └── index.ts
    │
    ├── policy/                           # runtime-layer ENFORCEMENT (not decision) of gates
    │   ├── policy-gate.ts                # pre-run gate: refuse if signed-envelope/work-lock missing
    │   ├── work-lock-guard.ts            # verify path/work-lock coverage before any write frame
    │   ├── forbidden-path-guard.ts       # block writes hitting TaskSpec.forbiddenPaths
    │   ├── target-path-guard.ts          # warn/deny writes outside TaskSpec.targetPaths
    │   ├── approval-pause.ts             # pause run on approval_requested until approve() resolves
    │   ├── network-guard.ts              # toggle CLI network flags from policy.allowNetwork
    │   ├── shell-guard.ts                # toggle/deny shell tool from policy.allowShell
    │   ├── secret-redactor.ts            # redact secrets from frames/logs before emit + journal
    │   ├── envelope-verifier.ts          # verify signed envelope when policy.requireSignedEnvelope
    │   └── index.ts
    │
    ├── events/                           # the RunEvent emission seam
    │   ├── run-event-sink.ts             # RunEventSink port (async push of RunEvent)
    │   ├── outbox-sink.ts                # adapt to @recoder/agent-events outbox/run-event-mapper
    │   ├── memory-sink.ts                # in-memory sink (tests + collectRuntimeEvents)
    │   ├── tee-sink.ts                   # fan-out to journal + outbox + observability
    │   ├── frame-to-event.ts            # DriverFrame -> RunEvent type mapping table
    │   ├── usage-aggregator.ts           # accumulate TokenUsage across frames -> completed.data
    │   └── index.ts
    │
    ├── evidence/                         # capture artifacts as run output
    │   ├── evidence-collector.ts         # orchestrate diff/log/junit/html capture at terminal state
    │   ├── git-diff-artifact.ts          # capture working-tree diff as artifact (uses git-nexus)
    │   ├── log-artifact.ts               # full run log -> artifact (hashed)
    │   ├── junit-artifact.ts             # parse verification junit output -> artifact
    │   ├── verification-runner.ts        # run TaskSpec.verification.commands, emit verified/failed
    │   ├── artifact-hasher.ts            # sha256 content hashing for provenance
    │   ├── artifact-uploader.ts          # hand artifacts to agent-os artifact service (port)
    │   └── index.ts
    │
    ├── persistence/                      # replayable run journal storage
    │   ├── run-store.ts                  # RunStore port: append/read/list run journals
    │   ├── jsonl-run-store.ts            # ADAPT pi-agent-core jsonl-storage.ts (append RunEvents)
    │   ├── memory-run-store.ts           # ADAPT pi-agent-core memory-storage.ts (ephemeral)
    │   ├── run-replay.ts                 # replay a journal as AsyncIterable<RunEvent> (recovery)
    │   ├── run-snapshot.ts               # snapshot run state for crash recovery / handoff
    │   ├── store-factory.ts              # choose store from RuntimeConfig
    │   └── index.ts
    │
    ├── observability/                    # truthful telemetry, never fakes success
    │   ├── runtime-logger.ts             # structured logger (wraps @recoder/logger)
    │   ├── run-metrics.ts                # counters/histograms: runs, duration, tokens, exit codes
    │   ├── run-tracing.ts                # spans per run/step (langfuse/otel via observability pkg)
    │   ├── health-monitor.ts             # periodic CLI/env health snapshots
    │   ├── frame-debug-tap.ts            # opt-in raw-frame dump for debugging (redacted)
    │   └── index.ts
    │
    ├── errors/                           # error taxonomy
    │   ├── runtime-error.ts              # re-export RuntimeAdapterError + RuntimeErrorCode
    │   ├── error-codes.ts                # extend codes: cli_not_found, spawn_failed, parse_error...
    │   ├── error-classifier.ts           # exit code / stderr -> RuntimeErrorCode + retryable
    │   ├── error-to-event.ts             # RuntimeAdapterError -> failed RunEvent (data.code)
    │   └── index.ts
    │
    ├── config/                           # configuration loading + validation
    │   ├── runtime-config.ts             # load+validate RuntimeConfig (Zod, env overrides)
    │   ├── defaults.ts                   # default timeouts, concurrency, paths
    │   ├── env-keys.ts                   # documented env var names (no secrets inlined)
    │   ├── cli-paths.ts                  # configurable CLI binary path overrides per surface
    │   └── index.ts
    │
    └── seams/                            # typed ports to OTHER subsystems (no hard coupling)
        ├── agent-os-port.ts             # read TaskSpec/bundle; write RunEvents (control plane)
        ├── instructions-port.ts         # consume InstructionBundle from agent-instructions
        ├── policy-port.ts               # request policy decisions from agent-policy (decide, not enforce here)
        ├── brain-port.ts                # request model/route hints from brain subsystem
        ├── coordination-port.ts         # report run progress to coordination (A2A handoff)
        ├── governance-port.ts           # approval gate + audit hooks to governance subsystem
        ├── memory-port.ts               # emit memory candidates (never write durable memory)
        ├── mcp-port.ts                  # pull MCP server config from @recoder/agent-mcp
        ├── sandbox-port.ts             # provision/exec via @recoder/agent-sandbox
        └── index.ts
```

A parallel `tests/` tree mirrors `src/` (see §10).

---

## 3. Module responsibilities (deep dive)

### 3.1 `engine/` — the uniform core
The engine is the part that is identical no matter which CLI runs. It is the merge target
for the orchestration logic currently scattered in
`packages/agent-runtimes/src/adapters/generic-adapter.ts` (the `sendTask` generator, abort
aliasing, terminal-event detection, error→event coercion).

- **`runtime-engine.ts`** owns the one true `sendTask` flow. Given a `RuntimeDriver` + `RuntimeTaskInput`, it: builds a `RunContext`, opens the run-lifecycle (`created→...→running`), runs the **policy gate**, invokes `driver.run(ctx)`, feeds frames through `event-pipeline.ts`, and guarantees exactly one terminal event.
- **`event-pipeline.ts`** is an async middleware chain: `[deadline] → [backpressure] → [secret-redactor] → [normalizer] → [terminal-guard] → sink`. Each middleware is a `(frame, ctx) => frame | RunEvent | drop`.
- **`event-normalizer.ts`** is the merge of `normalizeRuntimeOutput` + `createRunEventFromUpdate` from `generic-adapter.ts:217-256`, hardened: every event gets `taskId`, `agentId` (from `bundle.agentId`), `runId`, `createdAt`.
- **`terminal-event-guard.ts`** is `isTerminalRunEvent` (`generic-adapter.ts:280`) plus a hard invariant: once a `completed`/`failed` is emitted, further frames are journaled but not re-emitted.
- **`cancellation.ts`** generalizes the `controllers` map + `deleteControllerAliases` (`generic-adapter.ts:284`).
- **`concurrency-limiter.ts`** + **`backpressure.ts`** are new production needs: many parallel runs, slow consumers.
- **`run-journal.ts`** keeps the ordered event list so `persistence/` can flush it and `collectRuntimeEvents` (`agent-runtimes/index.ts:53`) still works.

### 3.2 `adapter/` — the `AgentRuntimeAdapter` skin
Wraps the engine to satisfy the existing contract so callers of `agent-runtimes` need no
change. `createRuntimeAdapter(descriptor)` returns `{ id, kind, health, capabilities, start,
sendTask, cancel, approve }`. `send-task.ts` is the public async generator. `approve.ts`
implements the optional `approve()` by resolving the `approval-pause` promise.

### 3.3 `registry/` — driver discovery
Maps a requested `AgentSurface` + optional variant to a concrete `DriverDescriptor`.
`surface-resolver.ts` reads `TaskSpec`/`AgentProfile.vendorSurface`; `variant-resolver.ts`
chooses the headless mode (e.g. claude `stream-json`, codex `exec --json`, pi `print json`
vs `rpc`). `builtin-drivers.ts` registers all of §3.5.

### 3.4 `contracts/` — the driver SPI
The single interface every fused source must satisfy. This is the *internal* analog of the
public `AgentRuntimeAdapter`, but frame-oriented:

```ts
interface RuntimeDriver {
  descriptor: DriverDescriptor;
  probe(ctx: DriverContext): Promise<DriverProbe>;   // health + cli presence
  start?(ctx: DriverContext): Promise<RuntimeHandle>;
  run(ctx: DriverContext): AsyncIterable<DriverFrame>; // the headless run
  cancel?(runId: string): Promise<void>;
  approve?(approvalId: string, decision): Promise<void>;
}
```

`DriverFrame` is the universal lingua franca the engine understands:
`{ kind: 'text' | 'thinking' | 'tool_call' | 'tool_result' | 'state' | 'needs_input' |
'approval' | 'usage' | 'artifact' | 'log' | 'error' | 'done', ... }`. Each driver's only job
is `native CLI output → DriverFrame[]`. The engine does the rest.

### 3.5 `drivers/` — the fusion targets
Each driver folder is where a fused source's real code is merged. Mapping in §6.

- **`shared/`** is the de-duplicated CLI plumbing. `spawn.ts` + `wait-for-exit.ts` are direct merges of `pi-coding-agent/src/utils/child-process.ts` (`spawnProcess`, `waitForChildProcess` with its Windows stdio-grace logic). `jsonl-reader.ts`/`jsonl-writer.ts` merge `pi-coding-agent/src/modes/rpc/jsonl.ts`.
- **`claude-code/`** spawns the user's `claude` CLI with `-p --output-format stream-json --verbose --input-format stream-json`, parses Anthropic stream-json frames, maps tool_use blocks, and bridges policy → `--permission-mode`/`--allowedTools`/`--disallowedTools`.
- **`codex/`** is the **oh-my-codex fusion**: `codex exec --json` for the headless run; `codex-config-writer.ts`/`codex-mcp-registry.ts` are merges of `ts/oh-my-codex/src/config/generator.ts` and `mcp-registry.ts`; `codex-runtime-bridge.ts` adapts `ts/oh-my-codex/src/runtime/bridge.ts` (the optional `omx-runtime` Rust sidecar for authority/dispatch state — kept optional via `OMX_RUNTIME_BRIDGE`).
- **`opencode/`** is the **oh-my-openagent fusion**: drives the user's `opencode` CLI; `opencode-plugin-config.ts`/`opencode-hooks-bridge.ts`/`opencode-tools-bridge.ts`/`opencode-tmux-config.ts` adapt `ts/oh-my-openagent/src/{plugin-config,create-hooks,create-tools,create-runtime-tmux-config}.ts`.
- **`pi/`** is the **pi-coding-agent fusion**: `pi-print-driver.ts` runs `runPrintMode` (`packages/pi-coding-agent/src/modes/print-mode.ts`) **in-process** with `mode: 'json'`, subscribing to the session event stream; `pi-rpc-driver.ts` speaks the JSONL `RpcCommand`/`RpcResponse` protocol (`packages/pi-coding-agent/src/modes/rpc/rpc-types.ts`) to enable steering/abort/compaction mid-run. The model layer bridges `@recoder/pi-ai`.
- **`in-process/`** is the **open-agents fusion**: wraps `ToolLoopAgent` from `ts/open-agents/packages/agent/open-agent.ts`, consuming its `fullStream` and mapping `AgentSandboxContext` from our `ExecutionEnvironment`.
- **`recoder-code/`** is the first-party default surface — delegates to `pi` or `in-process` per config.
- **`acp/`**, **`gemini-cli/`**, **`qwen-code/`** are thinner generic process drivers for the remaining surfaces in `AgentSurface`.

### 3.6 `env/` — execution environments
Decouples *which CLI* from *where it runs*. `local-environment.ts` spawns locally;
`sandbox-environment.ts` runs the same CLI inside a Daytona/E2B sandbox via `seams/sandbox-port.ts`
(streaming remote stdout via `sandbox-exec-stream.ts`). `git-worktree-env.ts` honors
`TaskSpec.branchPolicy` (`reuse_branch | create_worktree_branch | no_git_write`).

### 3.7 `policy/` — runtime enforcement
This layer *enforces* what `agent-policy` *decided*. It never invents allow/deny; it refuses
to run when a required gate is unmet and pauses on approval. `secret-redactor.ts` runs on
every frame before journal + emit. `work-lock-guard.ts`/`forbidden-path-guard.ts` inspect
write-bearing tool-call frames and convert a violation into a `failed` event with
`policy_denied` (never silently dropping).

### 3.8 `events/` — emission seam
`run-event-sink.ts` is the port; `outbox-sink.ts` adapts to `@recoder/agent-events`
(`run-event-mapper.ts`, `outbox.ts`) so events become CloudEvents in the transactional
outbox. `frame-to-event.ts` is the canonical `DriverFrame.kind → RunEventType` table:

| DriverFrame.kind | RunEventType        | Notes |
|------------------|---------------------|-------|
| text / thinking  | `log`               | debounced token deltas |
| tool_call/result | `log`               | structured `data.toolCall` |
| state            | `state_transition`  | carries `TaskRunState` |
| needs_input      | `needs_input`       | pauses run |
| approval         | `approval_requested`| pauses until approve() |
| artifact         | `artifact`          | carries `artifactId` |
| usage            | (folded into completed `data.usage`) |
| done(ok)         | `completed`         | terminal |
| done(err)/error  | `failed`            | terminal, `data.code` |

### 3.9 `evidence/` — artifacts + verification
At terminal state the engine triggers `evidence-collector.ts`: capture git diff, full log,
run `TaskSpec.verification.commands` (`verification-runner.ts`) emitting `verified`/`failed`,
hash everything (`artifact-hasher.ts`), and hand to the artifact service. This satisfies the
project rule: *never claim success without evidence*.

### 3.10 `persistence/` — replayable journal
`jsonl-run-store.ts` adapts `pi-agent-core/src/harness/session/jsonl-storage.ts` to append
`RunEvent`s as JSONL. `run-replay.ts` re-streams a journal for crash recovery / handoff /
autowake. `memory-run-store.ts` is the test/ephemeral store.

### 3.11 `observability/`, `errors/`, `config/`, `seams/`
- `errors/` extends `RuntimeErrorCode` (`agent-runtimes/src/runtime-errors.ts`) with operational codes (`cli_not_found`, `spawn_failed`, `parse_error`, `env_unavailable`) and keeps the `RuntimeAdapterError` shape.
- `config/` loads `RuntimeConfig` via Zod, with env overrides and **no inlined secrets** (per repo security rule).
- `seams/` are typed ports — the only way this subsystem talks to brain/coordination/governance/memory/mcp/sandbox/agent-os, keeping the monorepo boundary clean (`.claude/rules/monorepo.md`).

---

## 4. Data flow (end to end)

```text
agent-os control plane
  │  RuntimeTaskInput { task: TaskSpec, bundle: InstructionBundle, policy: RuntimePolicy }
  ▼
adapter/runtime-adapter.sendTask()                     ← satisfies AgentRuntimeAdapter
  ▼
engine/runtime-engine
  ├─ registry.surface-resolver → DriverDescriptor      (task.metadata.surface | AgentProfile)
  ├─ env/env-factory → ExecutionEnvironment            (local | sandbox | hosted)
  ├─ env/cwd-resolver + git-worktree-env → cwd          (CwdPolicy + branchPolicy)
  ├─ policy/policy-gate                                 (signed-envelope? work-locks? else REFUSE)
  ├─ run-lifecycle: created → compiled → routed → claimed → running
  ├─ emit  started (state=running)                      ← runtimeEvent factory
  └─ driver.run(DriverContext)  ──────────────┐
                                              ▼
        drivers/<surface>: spawn user CLI headless in env
          claude  → claude -p --output-format stream-json
          codex   → codex exec --json     (+ omx-runtime bridge, optional)
          opencode→ opencode run (+ plugin hooks)
          pi      → runPrintMode(json) in-process | rpc JSONL
          in-proc → ToolLoopAgent.fullStream
                                              │  native frames (stream-json / JSONL / SSE / AI stream)
                                              ▼
        drivers/<surface>/*-event-stream → DriverFrame[]
                                              ▼
engine/event-pipeline  [deadline → backpressure → secret-redactor →
                        policy guards(work-lock/forbidden-path) →
                        normalizer → terminal-guard]
                                              ▼
                          ┌──────────── tee-sink ───────────┐
                          ▼                ▼                 ▼
                 run-journal        events/outbox-sink   observability
                 (persistence)      → agent-events       (metrics/traces)
                                     → CloudEvents outbox
                                     → agent-os RunEvent stream
                                              ▼
        terminal frame → evidence-collector (diff/log/junit) → verification-runner
                       → emit verified | needs approval (pause) | completed/failed
```

**Steering / approvals (mid-run):**
`cancel(runId)` → `engine/cancellation` aborts the signal → driver kills the child
(`wait-for-exit`) → engine emits terminal `failed(state=cancelled)`.
`approve(approvalId, decision)` → `adapter/approve` → `policy/approval-pause` resolves →
driver resumes (pi via `rpc` `follow_up`, codex/acp via permission response).

---

## 5. Public API surface (`src/public-api.ts` / `index.ts`)

```ts
// Engine entry
export function createRuntime(config?: RuntimeConfig): Runtime;
export interface Runtime {
  adapterFor(surface: AgentSurface | string): AgentRuntimeAdapter;
  registry: DriverRegistry;
  health(): Promise<Record<string, RuntimeHealth>>;
}

// Driver factories (drop-in replacements for agent-runtimes shells)
export function createClaudeCodeDriver(opts?): RuntimeDriver;
export function createCodexDriver(opts?): RuntimeDriver;
export function createOpenCodeDriver(opts?): RuntimeDriver;
export function createPiDriver(opts?): RuntimeDriver;
export function createInProcessDriver(opts?): RuntimeDriver;
export function createRecoderCodeDriver(opts?): RuntimeDriver;
export function createAcpDriver(opts?): RuntimeDriver;

// Contract re-exports (kept compatible)
export type { AgentRuntimeAdapter, RuntimeHandle, RuntimePolicy,
             RuntimeStartInput, RuntimeTaskInput } from '@recoder/agent-runtimes';
export { RuntimeAdapterError } from '@recoder/agent-runtimes';

// Driver SPI (for custom first-party drivers)
export type { RuntimeDriver, DriverContext, DriverFrame, DriverDescriptor } from './contracts';

// Ports (for host wiring)
export type { RunEventSink, ExecutionEnvironment, RunStore } from './engine';
```

The key compatibility promise: **`createRuntime().adapterFor('codex')` returns an
`AgentRuntimeAdapter`** that the existing `agent-runtimes` consumers, `agent-os`
`RuntimeAdapterPort`, and the API routes (`/api/agent-os/runs`) already understand.

---

## 6. Fusion map (which real files merge where)

| Fused source (read) | Real path | Lands in `packages/runtime` |
|---|---|---|
| Driver contract + generic adapter loop | `packages/agent-runtimes/src/adapters/generic-adapter.ts` | `engine/*` (sendTask loop, normalizer, terminal-guard, cancellation) — **becomes the engine** |
| Adapter contract + event factory | `packages/agent-runtimes/src/index.ts`, `runtime-events.ts`, `runtime-errors.ts` | `adapter/*`, `engine/emit.ts`, `errors/*` (re-exported, kept compatible) |
| Codex driver shell | `packages/agent-runtimes/src/adapters/codex-adapter.ts` | replaced by `drivers/codex/*` (real driver) |
| Claude/opencode shells | `.../adapters/{claude-code,opencode}-adapter.ts` | replaced by `drivers/{claude-code,opencode}/*` |
| pi headless print | `packages/pi-coding-agent/src/modes/print-mode.ts` | `drivers/pi/pi-print-driver.ts` |
| pi RPC protocol | `packages/pi-coding-agent/src/modes/rpc/{rpc-types,rpc-client,jsonl,rpc-mode}.ts` | `drivers/pi/{pi-rpc-driver,pi-rpc-client}.ts`, `drivers/shared/jsonl-*.ts` |
| pi session host | `packages/pi-coding-agent/src/core/agent-session-runtime.ts`, `agent-session.ts` | `drivers/pi/pi-session-host.ts` |
| pi child-process utils | `packages/pi-coding-agent/src/utils/child-process.ts` | `drivers/shared/{spawn,wait-for-exit}.ts` |
| pi ANSI util | `packages/pi-coding-agent/src/utils/ansi.ts` | `drivers/shared/ansi-text-reader.ts` |
| pi agent loop / events | `packages/pi-agent-core/src/{agent-loop,types}.ts` | `drivers/pi/pi-event-mapper.ts`, `types/tool-call.ts` |
| pi JSONL session storage | `packages/pi-agent-core/src/harness/session/{jsonl-storage,memory-storage}.ts` | `persistence/{jsonl-run-store,memory-run-store}.ts` |
| pi-ai model registry/usage | `packages/pi-ai/src/{models,types,stream}.ts` | `drivers/pi/pi-model-resolver.ts`, `types/usage.ts` |
| Codex config generator | `ts/oh-my-codex/src/config/generator.ts` | `drivers/codex/codex-config-writer.ts` |
| Codex MCP registry | `ts/oh-my-codex/src/config/mcp-registry.ts` | `drivers/codex/codex-mcp-registry.ts` |
| Codex model/profile select | `ts/oh-my-codex/src/config/models.ts` | `drivers/codex/codex-profile.ts` |
| Codex runtime bridge (Rust sidecar) | `ts/oh-my-codex/src/runtime/bridge.ts` | `drivers/codex/codex-runtime-bridge.ts` (optional) |
| opencode plugin entry/config | `ts/oh-my-openagent/src/{index,plugin-config}.ts` | `drivers/opencode/opencode-plugin-config.ts` |
| opencode hooks/tools/tmux | `ts/oh-my-openagent/src/{create-hooks,create-tools,create-runtime-tmux-config}.ts` | `drivers/opencode/{opencode-hooks-bridge,opencode-tools-bridge,opencode-tmux-config}.ts` |
| open-agents ToolLoopAgent | `ts/open-agents/packages/agent/open-agent.ts` | `drivers/in-process/tool-loop-driver.ts` |
| open-agents tools | `ts/open-agents/packages/agent/tools/*` | `drivers/in-process/tool-loop-tools.ts` |
| open-agents models/system-prompt/subagents | `ts/open-agents/packages/agent/{models,system-prompt,subagents/*}.ts` | `drivers/in-process/{tool-loop-models,tool-loop-system-prompt,tool-loop-subagents}.ts` |
| open-agents sandbox interface | `ts/open-agents/packages/sandbox/interface.ts` | informs `env/execution-environment.ts` |
| RunEvent / TaskSpec / bundle / profile | `packages/agent-os/src/domain/{event,task-spec,instruction-bundle,agent-profile}.ts` | consumed as-is via `seams/agent-os-port.ts` (never redefined) |
| Outbox / CloudEvents | `packages/agent-events/src/{outbox,run-event-mapper,cloudevent}.ts` | `events/outbox-sink.ts` |

---

## 7. Seams to other subsystems

| Subsystem | Port file | Direction | Contract |
|---|---|---|---|
| **agent-os** (control plane) | `seams/agent-os-port.ts` | in: `TaskSpec`,`InstructionBundle`,`RuntimePolicy`; out: `RunEvent[]` | source of record; runtime never writes task/approval state |
| **agent-instructions** (brain/compile) | `seams/instructions-port.ts` | in: `InstructionBundle` w/ `renderedPrompt`+`sourceRefs` | runtime feeds `renderedPrompt` to the CLI; honors `forbiddenActions` |
| **agent-policy** (governance) | `seams/policy-port.ts` | in: decisions | runtime *enforces*, never decides |
| **brain** | `seams/brain-port.ts` | in: model/route hints | optional model selection override |
| **coordination** | `seams/coordination-port.ts` | out: progress + `handoff` events | A2A handoff to reviewer/finalOwner |
| **governance** | `seams/governance-port.ts` | out: `approval_requested`; in: decisions; out: audit | approval pause + audit trail |
| **memory** | `seams/memory-port.ts` | out: memory *candidates* w/ evidence | never writes durable memory |
| **agent-mcp** | `seams/mcp-port.ts` | in: MCP server/tool config | injected into each CLI's MCP config |
| **agent-sandbox / daytona** | `seams/sandbox-port.ts` | exec substrate | runs CLI remotely; attaches evidence only |

---

## 8. Error handling

- All failures funnel through `errors/error-classifier.ts` → `RuntimeAdapterError(code, msg, {retryable, details})` (the existing class, `runtime-errors.ts`).
- Codes: existing (`runtime_unavailable`, `capability_mismatch`, `policy_denied`, `approval_required`, `timeout`, `cancelled`, `unknown`) **plus** operational additions (`cli_not_found`, `spawn_failed`, `parse_error`, `env_unavailable`, `verification_failed`).
- The engine guarantees exactly one terminal `RunEvent`. A thrown error becomes a `failed` event with `data.code` + `data.retryable` (mirrors `generic-adapter.ts:186-205`).
- **No fake success**: a driver with no attached run impl, a missing CLI binary, or a failed verification produces `failed`, never `completed`. Cancellation produces `failed(state=cancelled)` with `retryable=false`.
- `retry-policy.ts` consults `retryable` for engine-level retry (network/spawn flaps), never re-running write-bearing steps that already partially applied.

---

## 9. Config and observability

- **Config** (`config/runtime-config.ts`, Zod): `maxConcurrentRuns`, per-surface concurrency, `wallClockTimeoutMs`, `idleTimeoutMs`, `cliPaths` overrides, `defaultEnv` (`RuntimeKind`), `redactionPatterns`, `journalStore`. Env overrides documented in `config/env-keys.ts`; **no secrets inlined**.
- **Observability** (`observability/`): structured logs via `@recoder/logger`; metrics (run count, duration, token usage, exit-code distribution, queue depth); traces via `@recoder/agent-observability`/langfuse; periodic `health-monitor` snapshots that feed `health()`. Raw-frame debug tap is opt-in and runs *after* `secret-redactor`.

---

## 10. Tests tree (mirrors `src/`)

```text
packages/runtime/tests
├── unit
│   ├── engine/{event-normalizer,terminal-event-guard,cancellation,
│   │           backpressure,deadline,retry-policy,run-journal}.test.ts
│   ├── adapter/{send-task,health-aggregator,capability-resolver,approve}.test.ts
│   ├── registry/{driver-registry,surface-resolver,variant-resolver}.test.ts
│   ├── drivers/shared/{spawn,wait-for-exit,jsonl-reader,jsonl-writer,
│   │           env-builder,arg-builder,cwd-resolver,cli-locator}.test.ts
│   ├── drivers/claude-code/{claude-stream-json,claude-args,claude-tool-mapper,
│   │           claude-permission-bridge}.test.ts
│   ├── drivers/codex/{codex-event-stream,codex-args,codex-config-writer,
│   │           codex-mcp-registry,codex-runtime-bridge}.test.ts
│   ├── drivers/opencode/{opencode-event-stream,opencode-args,
│   │           opencode-plugin-config,opencode-hooks-bridge}.test.ts
│   ├── drivers/pi/{pi-event-mapper,pi-rpc-command-mapper,pi-model-resolver,
│   │           pi-print-driver}.test.ts
│   ├── drivers/in-process/{tool-loop-stream,tool-loop-tools,tool-loop-models}.test.ts
│   ├── policy/{work-lock-guard,forbidden-path-guard,approval-pause,
│   │           secret-redactor,envelope-verifier,network-guard}.test.ts
│   ├── events/{frame-to-event,usage-aggregator,outbox-sink}.test.ts
│   ├── evidence/{verification-runner,git-diff-artifact,artifact-hasher}.test.ts
│   ├── persistence/{jsonl-run-store,memory-run-store,run-replay}.test.ts
│   ├── errors/{error-classifier,error-to-event}.test.ts
│   └── config/runtime-config.test.ts
├── contract
│   ├── adapter-conformance.test.ts      # every driver -> AgentRuntimeAdapter contract
│   ├── runtime-adapter-port.test.ts     # matches agent-os RuntimeAdapterPort
│   ├── run-event-shape.test.ts          # emitted events match agent-os RunEvent
│   └── terminal-invariant.test.ts       # exactly-one-terminal, no post-terminal emit
├── integration
│   ├── codex-driver.fixture.test.ts     # replay recorded codex --json frames -> RunEvents
│   ├── claude-stream-json.fixture.test.ts
│   ├── opencode-sse.fixture.test.ts
│   ├── pi-print-mode.inproc.test.ts     # in-process pi run, no network (faux provider)
│   ├── pi-rpc-steering.test.ts          # steer/abort mid-run over JSONL
│   ├── tool-loop.inproc.test.ts         # ToolLoopAgent w/ mock model
│   ├── sandbox-environment.test.ts      # CLI run inside mock sandbox env
│   └── policy-gate-refusal.test.ts      # missing work-lock -> policy_denied, no run
├── e2e
│   ├── full-task-codex.e2e.ts           # TaskSpec -> codex -> verified -> artifacts (gated)
│   └── full-task-pi.e2e.ts
└── fixtures
    ├── codex-events.jsonl
    ├── claude-stream-json.jsonl
    ├── opencode-messages.jsonl
    └── task-specs/*.json
```

---

## 11. Verification plan

Per `.claude/rules/testing.md` (narrowest checks that prove behavior):

```bash
pnpm --filter @recoder/runtime test           # unit + contract + integration
pnpm --filter @recoder/runtime check-types
pnpm --filter @recoder/runtime build          # tsup multi-entry must succeed
pnpm test:contracts:agent-os                  # ensures RuntimeAdapterPort still satisfied
```

Driver integration tests run **offline** against recorded fixtures (`tests/fixtures/*.jsonl`)
and the pi `faux` provider (`packages/pi-ai/src/providers/faux.ts`) — no real model spend, no
network — so they are deterministic and CI-safe. E2E tests that spawn real user CLIs are
gated behind an env flag and a present-binary probe (`cli-version-probe.ts`); when the binary
is absent they **skip with a truthful reason**, never green-wash.

---

## 12. Migration / rollout

1. Create `packages/runtime` depending on `@recoder/agent-runtimes` (contract) + `pi-*` + `ai`.
2. Build `engine/` by lifting the proven loop out of `generic-adapter.ts` (keep behavior identical; add tests first).
3. Land `drivers/pi` + `drivers/in-process` first (in-repo, no external CLI needed → fully testable offline).
4. Land `drivers/codex`, `drivers/claude-code`, `drivers/opencode` against recorded fixtures.
5. Re-point the `agent-runtimes` factory shells (`codex-adapter.ts` et al.) to delegate to `createRuntime().adapterFor(...)`, so existing callers transparently gain real drivers.
6. Wire `events/outbox-sink.ts` to `@recoder/agent-events`; wire `seams/agent-os-port.ts` to the run service.
