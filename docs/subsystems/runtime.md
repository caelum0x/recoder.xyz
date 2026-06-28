# Subsystem: `packages/runtime`

> The Recoder **Runtime** subsystem. It drives the user's *own* coding-agent CLIs
> (Claude Code, OpenAI Codex, opencode, pi, plus in-process agents) headless, behind one
> uniform driver contract, and streams every byte of their work back to the control plane
> as `RunEvent` records.

> **Status (2026-06-28): BUILT & GREEN + NOW WIRED.** `@recoder/runtime` is real and green
> (**160/160 tests**) and — as of `b83e21ff0` — **no longer a zero-importer shelf package**.
> The real engine now backs two seams: (1) `apps/agent-worker/src/runtimes/runtime-registry.ts`
> builds its `RuntimeAdapterPort` registry from `createRuntime().adapterFor(surface)`, and
> (2) the conductor's new `in_process` `ConductorSubstrate` (`docker-backend/src/conductor/substrate-in-process.ts`)
> is driven by `@recoder/runtime` (degrade-safe `runtime_unavailable` when absent).
> **Honest caveat:** the **proven** live `claude -p` run (BUILD-STATUS §7a) went through the
> canonical **tmux+worktree conductor driver**, not this package — `@recoder/runtime` is the
> second, now-imported driver path whose live-run proof through the conductor seam is still the
> dual-runtime reconciliation item (BUILD-STATUS §10).

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

> **This tree is the ACTUAL shipped `src/` layout** (verified by reading the directory on
> 2026-06-29), not a design wishlist. Where the original design named files that were never
> landed, those are called out in §13 (Gaps). Notably: the **generic** surfaces
> (`gemini_cli`, `qwen_code`, `acp`) are NOT separate driver folders — they are thin factories
> over **one** `drivers/generic/generic-process-driver.ts`. Cross-subsystem **seams** are a
> single `seams/index.ts` (interfaces only), not one file per port.

```text
packages/runtime
├── package.json                         # @recoder/runtime; deps: agent-runtimes, agent-os, agent-events, pi-{coding-agent,ai,agent-core}, ai
├── tsup.config.ts                       # single-entry build (index)
├── tsconfig.json
├── README.md
├── tests/                               # see §10 (ACTUAL: only unit driver tests landed)
└── src
    ├── index.ts                         # `export * from './public-api'`
    ├── public-api.ts                    # the curated public surface (re-exports; see §5)
    │
    ├── engine/                          # the uniform core every driver plugs into
    │   ├── runtime.ts  runtime-engine.ts  run-context.ts  run-lifecycle.ts
    │   ├── event-pipeline.ts  event-normalizer.ts  terminal-event-guard.ts
    │   ├── cancellation.ts  deadline.ts  backpressure.ts  concurrency-limiter.ts
    │   ├── run-journal.ts  retry-policy.ts  emit.ts
    │   └── index.ts
    │
    ├── adapter/                         # the AgentRuntimeAdapter skin over a driver
    │   ├── runtime-adapter.ts  adapter-options.ts  send-task.ts
    │   ├── health-aggregator.ts  capability-resolver.ts  approve.ts
    │   └── index.ts
    │
    ├── registry/                        # driver discovery + selection
    │   ├── driver-registry.ts  driver-descriptor.ts  surface-resolver.ts
    │   ├── builtin-drivers.ts  variant-resolver.ts  index.ts
    │
    ├── contracts/                       # the driver SPI every driver implements
    │   ├── runtime-driver.ts  driver-context.ts  driver-frame.ts  driver-result.ts
    │   ├── headless-mode.ts  cli-invocation.ts  index.ts
    │
    ├── types/                           # subsystem-local domain types
    │   ├── runtime-config.ts  runtime-policy.ts  run-id.ts  usage.ts
    │   ├── tool-call.ts  stop-reason.ts  evidence.ts  index.ts
    │
    ├── drivers/                         # one folder per fused driver; each implements RuntimeDriver
    │   ├── shared/                       # reusable CLI plumbing (the de-duped merge)
    │   │   ├── process-driver.ts  spawn.ts  wait-for-exit.ts
    │   │   ├── jsonl-reader.ts  jsonl-writer.ts  ansi-text-reader.ts
    │   │   ├── env-builder.ts  arg-builder.ts  cwd-resolver.ts  prompt-writer.ts
    │   │   ├── cli-locator.ts  cli-version-probe.ts  frame-debouncer.ts
    │   │   ├── tool-call-tracker.ts  index.ts
    │   │
    │   ├── claude-code/                  # drives the user's `claude` CLI (stream-json)
    │   │   ├── claude-code-driver.ts  claude-args.ts  claude-stream-json.ts
    │   │   ├── claude-tool-mapper.ts  claude-permission-bridge.ts  claude-mcp-config.ts
    │   │   ├── claude-health.ts  claude-capabilities.ts  claude-descriptor.ts  index.ts
    │   │
    │   ├── codex/                        # drives `codex exec --json` (FUSE oh-my-codex)
    │   │   ├── codex-driver.ts  codex-args.ts  codex-event-stream.ts  codex-tool-mapper.ts
    │   │   ├── codex-approval-bridge.ts  codex-config-writer.ts  codex-mcp-registry.ts
    │   │   ├── codex-runtime-bridge.ts  codex-profile.ts  codex-health.ts
    │   │   ├── codex-capabilities.ts  codex-descriptor.ts  index.ts
    │   │
    │   ├── opencode/                     # drives `opencode` (FUSE oh-my-openagent)
    │   │   ├── opencode-driver.ts  opencode-args.ts  opencode-event-stream.ts
    │   │   ├── opencode-tool-mapper.ts  opencode-plugin-config.ts  opencode-hooks-bridge.ts
    │   │   ├── opencode-tools-bridge.ts  opencode-tmux-config.ts  opencode-health.ts
    │   │   ├── opencode-capabilities.ts  opencode-descriptor.ts  index.ts
    │   │
    │   ├── pi/                           # drives in-repo `pi` (FUSE packages/pi-coding-agent)
    │   │   ├── pi-print-driver.ts  pi-rpc-driver.ts  pi-rpc-client.ts  pi-session-host.ts
    │   │   ├── pi-event-mapper.ts  pi-model-resolver.ts  pi-wire-types.ts
    │   │   ├── pi-descriptor.ts  index.ts
    │   │   #  NOTE: factory is createPiDrivers() (plural) — returns print + rpc drivers
    │   │
    │   ├── in-process/                   # in-repo Vercel-AI agent (FUSE open-agents ToolLoopAgent)
    │   │   ├── tool-loop-driver.ts  tool-loop-stream.ts  tool-loop-tools.ts
    │   │   ├── tool-loop-context.ts  tool-loop-models.ts  tool-loop-system-prompt.ts
    │   │   ├── tool-loop-health.ts  tool-loop-capabilities.ts  tool-loop-descriptor.ts
    │   │   ├── local-sandbox.ts  path-security.ts  index.ts
    │   │
    │   ├── recoder-code/                 # first-party surface; delegates to pi | in-process
    │   │   ├── recoder-code-driver.ts  recoder-code-descriptor.ts  index.ts
    │   │
    │   ├── generic/                      # ONE process driver behind gemini_cli/qwen_code/acp
    │   │   ├── generic-process-driver.ts  index.ts
    │   │   #  index.ts exports createGeminiCliDriver / createQwenCodeDriver / createAcpDriver
    │   │   #  as thin presets over createGenericProcessDriver — NO dedicated folders/parsers
    │   │
    │   └── index.ts                      # barrel re-exporting every driver factory
    │
    ├── env/                              # execution environments (where the CLI runs)
    │   ├── execution-environment.ts  local-environment.ts  sandbox-environment.ts
    │   ├── env-factory.ts  git-worktree-env.ts  index.ts
    │
    ├── policy/                           # runtime-layer ENFORCEMENT (not decision)
    │   ├── policy-gate.ts  work-lock-guard.ts  forbidden-path-guard.ts  target-path-guard.ts
    │   ├── approval-pause.ts  network-guard.ts  shell-guard.ts  secret-redactor.ts
    │   ├── envelope-verifier.ts  path-match.ts  index.ts
    │
    ├── events/                           # the RunEvent emission seam
    │   ├── run-event-sink.ts  outbox-sink.ts  memory-sink.ts  tee-sink.ts
    │   ├── frame-to-event.ts  usage-aggregator.ts  index.ts
    │
    ├── evidence/                         # capture artifacts as run output
    │   ├── evidence-collector.ts  git-diff-artifact.ts  verification-runner.ts
    │   ├── artifact-hasher.ts  index.ts
    │
    ├── persistence/                      # replayable run journal storage
    │   ├── run-store.ts  jsonl-run-store.ts  memory-run-store.ts  run-replay.ts
    │   ├── store-factory.ts  index.ts
    │
    ├── observability/                    # truthful telemetry, never fakes success
    │   ├── runtime-logger.ts  run-metrics.ts  health-monitor.ts  frame-debug-tap.ts  index.ts
    │
    ├── errors/                           # error taxonomy
    │   ├── runtime-error.ts  error-codes.ts  error-classifier.ts  error-to-event.ts  index.ts
    │
    ├── config/                           # configuration loading + validation
    │   ├── runtime-config.ts  defaults.ts  env-keys.ts  cli-paths.ts  index.ts
    │
    └── seams/                            # typed ports to OTHER subsystems
        └── index.ts                      # AgentOsPort, InstructionsPort, PolicyPort, BrainPort,
                                          # CoordinationPort, GovernancePort, MemoryPort, McpPort,
                                          # SandboxPort — all interfaces in ONE file (no per-port files)
```

A `tests/` tree mirrors only the **driver** part of `src/` today (see §10 + §13).

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
- **`recoder-code/`** is the first-party default surface — delegates to `pi` or `in-process` per config (`createRecoderCodeDriver({ delegate })`, default `pi`).
- **`generic/`** is a **single** `generic-process-driver.ts`; `createGeminiCliDriver`, `createQwenCodeDriver`, and `createAcpDriver` are thin **preset factories** over it (`generic/index.ts`). There are **no** dedicated `gemini-cli/`, `qwen-code/`, or `acp/` driver folders, no bespoke event parsers, and no ACP JSON-RPC transport implementation — these are generic line-buffered process drivers only (see §13).

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

> Exact export list verified against `src/public-api.ts`.

```ts
// Engine entry
export function createRuntime(input?: CreateRuntimeInput): Runtime;
// CreateRuntimeInput = { drivers?, config?, ... } — NOT a bare RuntimeConfig.

// Adapter factory + registry
export { createRuntimeAdapter } from './adapter/runtime-adapter';
export { DriverRegistry, createDriverRegistry, registerBuiltinDrivers,
         createBuiltinDrivers, resolveSurface, resolveVariant } from './registry';

// Driver factories (real names — note the PLURAL pi factory + the generic preset family)
export function createClaudeCodeDriver(opts?: ClaudeCodeDriverOptions): RuntimeDriver;
export function createCodexDriver(opts?: CodexDriverOptions): RuntimeDriver;
export function createOpenCodeDriver(opts?: OpenCodeDriverOptions): RuntimeDriver;
export function createPiDrivers(opts?: PiDriverOptions): RuntimeDriver[];   // PLURAL → [print, rpc]
export function createInProcessDriver(opts?: InProcessDriverOptions): RuntimeDriver;
export function createRecoderCodeDriver(opts?: RecoderCodeDriverOptions): RuntimeDriver;
export function createGeminiCliDriver(opts?: GenericProcessDriverOptions): RuntimeDriver;
export function createQwenCodeDriver(opts?: GenericProcessDriverOptions): RuntimeDriver;
export function createAcpDriver(opts?: GenericProcessDriverOptions): RuntimeDriver;
export function createGenericProcessDriver(opts: GenericProcessDriverOptions): RuntimeDriver;

// Contract re-exports (kept compatible)
export type { AgentRuntimeAdapter, RuntimeHandle, RuntimePolicy,
             RuntimeStartInput, RuntimeTaskInput } from '@recoder/agent-runtimes';
export { RuntimeAdapterError } from './errors';

// Driver SPI, sinks, policy guards, env, evidence, persistence, observability, seams
export type { RuntimeDriver, DriverContext, DriverFrame, DriverDescriptor } from '...';
export { MemoryRunEventSink, OutboxRunEventSink, TeeRunEventSink } from './events';
export { LocalEnvironment, SandboxEnvironment, createExecutionEnvironment } from './env';
export { collectEvidence, runVerification } from './evidence';
export { MemoryRunStore, JsonlRunStore, replayRun } from './persistence';
```

The key compatibility promise: **`createRuntime().adapterFor('codex')` returns an
`AgentRuntimeAdapter`** that the existing `agent-runtimes` consumers, `agent-os`
`RuntimeAdapterPort`, and the API routes (`/api/agent-os/runs`) already understand.

---

## 6. Fusion map (which real files merge where)

> **Fusion lineage = owned, in-process.** The owned drivers live in `packages/runtime`.
> The upstream OSS sources are **fused in** (we own and reshape them), not thin-wrapped.
> Their checkout status in this repo (verified 2026-06-29):
>
> | Fused source | Path | In-repo status |
> |---|---|---|
> | **oh-my-codex** | `ts/oh-my-codex` | **gitignored** (fused-in, not tracked) |
> | **open-agents** | `ts/open-agents` | **gitignored** (fused-in, not tracked) |
> | **oh-my-openagent** | `ts/oh-my-openagent` | tracked |
> | **opencode** (upstream CLI) | `ts/opencode` | tracked |
> | **pi** (coding agent) | `packages/pi-coding-agent`, `packages/pi-ai`, `packages/pi-agent-core` | tracked workspace packages |
>
> Because two of the lineage sources are gitignored, the rows below that cite
> `ts/oh-my-codex/*` and `ts/open-agents/*` describe the **merge provenance**, not files a
> fresh clone will see. The merged owned code under `packages/runtime/src/drivers/{codex,in-process}/`
> is what ships and is tested.

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

## 10. Tests tree (ACTUAL, verified 2026-06-29)

> **160/160 tests pass** (`node --test --import tsx`, run 2026-06-29: `tests 160 / pass 160 /
> fail 0 / skipped 0`). **All landed tests are driver-level unit tests** under
> `tests/unit/drivers/`. The broad `engine/ · adapter/ · registry/ · policy/ · events/ ·
> evidence/ · persistence/ · errors/ · config/` unit folders and the separate `contract/`,
> `integration/`, and `e2e/` suites from the original design have **not** been landed as their
> own test files — see §13. There are **no co-located `src/**/*.test.ts` files** (the test
> script globs both, but `src/` currently has none). Several driver tests double as
> fixture-replay integration tests (`*.fixture.test.ts`).

```text
packages/runtime/tests
├── unit/drivers
│   ├── claude-code/   (5 test files)  claude-args · claude-code-driver · claude-permission-bridge
│   │                                  · claude-stream-json · claude-tool-mapper
│   ├── codex/         (8 test files)  codex-approval-bridge · codex-args · codex-config-writer
│   │                                  · codex-driver · codex-event-stream · codex-mcp-registry
│   │                                  · codex-profile · codex-runtime-bridge
│   ├── in-process/    (3 test files)  local-sandbox · tool-loop-driver · tool-loop-stream
│   │                                  (+ mock-model.ts helper)
│   ├── opencode/      (6 test files)  opencode-args · opencode-driver.fixture · opencode-event-stream
│   │                                  · opencode-hooks-bridge · opencode-plugin-config · opencode-tool-mapper
│   └── pi/            (5 test files)  pi-descriptor · pi-event-mapper · pi-print-driver.fixture
│                                      · pi-rpc-driver.fixture · pi-session-host
└── fixtures
    ├── claude-stream-json.jsonl   codex-events.jsonl   opencode-messages.jsonl   pi-run-stream.jsonl
    └── fake-opencode.mjs   fake-pi.mjs   fake-pi-no-done.mjs   (spawnable fake CLIs for fail-safe paths)
```

**27 test files, 160 assertions, all green, fully offline** — fixture replays and spawnable
fake CLIs (`fake-pi.mjs`, `fake-opencode.mjs`), no real model spend, no network.

---

## 11. Verification plan

Per `.claude/rules/testing.md` (narrowest checks that prove behavior):

```bash
pnpm --filter @recoder/runtime test           # 160 driver unit + fixture-replay tests (verified green)
pnpm --filter @recoder/runtime check-types
pnpm --filter @recoder/runtime build          # tsup single-entry build
pnpm test:contracts:agent-os                  # ensures RuntimeAdapterPort still satisfied
```

> The `test` script is `node --test --import tsx 'tests/**/*.test.ts' 'src/**/*.test.ts'`
> (no `vitest`). Run 2026-06-29 → `tests 160 / pass 160 / fail 0`.

Driver tests run **offline** against recorded fixtures (`tests/fixtures/*.jsonl`) and
spawnable fake CLIs (`tests/fixtures/fake-*.mjs`) — no real model spend, no network — so they
are deterministic and CI-safe. There is **no landed e2e suite** spawning real user CLIs (see
§13); the fail-safe paths (missing CLI → `runtime_unavailable`, no terminal frame → synthesized
`failed`) are exercised by the fake-CLI fixtures and **never green-wash**.

---

## 13. Gaps / not-yet-live (honest status, verified 2026-06-29)

This section keeps the doc truthful: the foundation + drivers are real and green, but parts of
the original design above are **not yet shipped**. Treated as gaps, not as done:

**Design-named source files that do NOT exist in `src/`:**
- `drivers/pi/pi-driver.ts`, `pi-tool-mapper.ts`, `pi-compaction.ts`, `pi-rpc-command-mapper.ts`
  — the pi driver ships as `pi-print-driver.ts` + `pi-rpc-driver.ts` (factory `createPiDrivers`, plural).
- `drivers/claude-code/claude-session.ts` (no `--resume`/session-continuity module landed).
- `drivers/opencode/opencode-server-client.ts` (no opencode server-mode client landed).
- `drivers/shared/stdin-prompt.ts` (prompt handling is in `prompt-writer.ts`).
- `drivers/in-process/tool-loop-subagents.ts` (no subagent executor/explorer mapping landed).
- `env/sandbox-exec-stream.ts`, `env/hosted-environment.ts`, `env/workspace-resolver.ts`
  (env ships local + sandbox + worktree only; no hosted/remote-worker env, no standalone
  workspace resolver, no remote-exec stream module).
- `evidence/log-artifact.ts`, `evidence/junit-artifact.ts`, `evidence/artifact-uploader.ts`
  (evidence ships diff capture + verification-runner + hasher; **no junit parser, no
  log-artifact module, no artifact-uploader port impl** — artifact handoff to agent-os is not
  yet wired here).
- `persistence/run-snapshot.ts` (no crash-recovery snapshot module).
- `observability/run-tracing.ts` (no langfuse/otel span module; logger + metrics + health only).
- `seams/*.ts` per-port files: all seam interfaces live in a **single** `seams/index.ts`; the
  ports are **type contracts only** — no concrete host wiring (brain/coordination/governance/
  memory/mcp hint resolution) is implemented inside this package.

**Generic surfaces are shallow:** `gemini_cli`, `qwen_code`, `acp` are presets over one
`generic-process-driver.ts`. There is **no ACP JSON-RPC transport**, **no per-CLI event
parser**, and no fixtures for them — they are line-buffered process drivers, not the rich
ACP/Gemini/Qwen drivers the design tree implies.

**Test coverage is driver-only:** no landed `contract/`, `integration/`, or `e2e/` suites and
no dedicated `engine/ · adapter/ · registry/ · policy/ · events/ · evidence/ · persistence/`
unit tests. Those modules are currently covered only transitively through the 27 driver test
files. The 80%-coverage rule in `.claude/rules/testing.md` is **not** demonstrated for the
non-driver modules.

**Live-run proof is still the conductor path, not this package (infra-gated):** the proven
live `claude -p` run (BUILD-STATUS §7a) went through the canonical **tmux+worktree conductor
driver**, NOT `@recoder/runtime`. This package is now *imported* by `apps/agent-worker`'s
`runtime-registry.ts` and the conductor's `in_process` substrate
(`docker-backend/src/conductor/substrate-in-process.ts`, commit `b83e21ff0`), but a proven
end-to-end live run *through this package's adapter into the conductor seam* remains the
dual-runtime reconciliation item (BUILD-STATUS §10). Do not read "wired" as "proven live".

**Sandbox / artifact-service seams are stubs:** `env/sandbox-environment.ts` and the
`SandboxPort`/agent-os artifact handoff are present as ports/skeletons; real Daytona/E2B remote
execution and durable artifact upload are infra/secret-gated and **not exercised by the green
test suite**.

---

## 12. Migration / rollout

1. Create `packages/runtime` depending on `@recoder/agent-runtimes` (contract) + `pi-*` + `ai`.
2. Build `engine/` by lifting the proven loop out of `generic-adapter.ts` (keep behavior identical; add tests first).
3. Land `drivers/pi` + `drivers/in-process` first (in-repo, no external CLI needed → fully testable offline).
4. Land `drivers/codex`, `drivers/claude-code`, `drivers/opencode` against recorded fixtures.
5. Re-point the `agent-runtimes` factory shells (`codex-adapter.ts` et al.) to delegate to `createRuntime().adapterFor(...)`, so existing callers transparently gain real drivers.
6. Wire `events/outbox-sink.ts` to `@recoder/agent-events`; wire `seams/agent-os-port.ts` to the run service.
