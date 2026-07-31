# AGENT-ENGINE module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): backend/engines/rust/openfang

**Interface:** `asRuntime · hands · activateHand · run · onEvent · health`

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../RECODER-MODULES.md §AGENT-ENGINE.

**Shipped:** a REAL cohesive facet at
`backend/src/domains/engines/agent-engine/` — `createAgentEngineService`
(`agent-engine.service.ts`, exposed as `engines.agentEngine(): AgentEngineService | null`,
`engines/index.ts:130`), its provenance gate (`provenance-gate.ts`), and a test
(`agent-engine.service.test.ts`). `openfang-native.ts` is a REAL in-process NAPI
loader (~51 `#[napi]` methods on the booted kernel: `runAgent`, `spawnAgent`,
`activateHand`/`listActiveHands`, `health`, …). The facet composes every pure
kernel verb over the ONE napi transport (`OpenfangNapiAdapter` via
`engine.invoke({op,input})`), and threads the two STREAMING verbs (`run`/
`continueRun`) through the sibling `launchOpenfangRun` function seam so a PER-CALL
RunEvent sink + the SHARED provenance gate ride into each turn
(`agent-engine.service.ts:92-146`). The `.node` addon is **disk-gated / not built
by default**, so `engines.agentEngine()` is `null` (and every verb degrades to a
truthful `{ available:false }` / `[]` / `false`) when the engine is undeclared or
its addon is absent — never a fake run, never a faked token count.

## `asRuntime` dispatch — SHIPPED (previously documented as "still planned")

The prior claim that `asRuntime` dispatch was "still planned" because
"`ConductorRuntimeId` is a closed union so not yet dispatchable" is **now false**.
The shipped reality:

- **The runtime union carries openfang.** `ConductorRuntimeKind` in
  `backend/src/domains/conductor/types.ts:22-28` includes `'openfang'` alongside the
  CLI runtimes (`claude_code`/`codex`/`opencode`/`recoder_code`/`pi`). openfang is
  NOT a member of the package's CLI `ConductorRuntimeId` union (it is an in-process
  runtime), so it is classified against the conductor's OWN runtime list rather than
  the package guard — the two never drift.
- **The execution-path selector.** `runtime-substrate-selector.ts` is the pure seam:
  `isOpenfangRuntime` (over `IN_PROCESS_RUNTIME_IDS = ['openfang']`),
  `resolveExecutionPath` (`'openfang' | 'cli'`), and `selectSubstrateForRuntime`
  (openfang → `in_process`; every CLI runtime → `tmux_worktree`).
- **The one dispatch seam.** `ConductorComposer.createWorkspace`
  (`conductor-module.ts:992-1012`) calls `isOpenfangRuntime(runtimeId)` to pick the
  substrate: openfang → the native `in_process` substrate; every other runtime →
  `tmux_worktree`. Both paths then converge on `engine.createWorkspace` + the SAME
  capability seams. For the in-process path the enriched prompt is passed as
  `command` (bypassing the CLI-only `resolveRuntimeCommand`).
- **The native substrate.** `createOpenfangRuntimeSubstrate`
  (`conductor/adapters/openfang-runtime.adapter.ts`) is the real `in_process`
  `ConductorSubstrate`: `launch` provisions an isolated git worktree, then runs ONE
  openfang agent turn via the injected `AgentTurnPort` (`engines.agentEngine()`)
  pointed at that worktree; `continueRun` runs another turn in the SAME worktree,
  reusing the SAME agent by name so the kernel `runAgent` continues its session.
  `capture`/`alive`/`exitCode`/`diff`/`teardown` complete the contract. It is wired
  end-to-end at bootstrap: `createOpenfangRuntimeSubstrate({ agentTurn: engines.
  agentEngine() ?? undefined })` (`bootstrap/index.ts:700-704`), registered in the
  substrate registry (`substrates: [cliSub, openfangSub, …]`, `bootstrap/index.ts:848`).

So `run`, `continueRun`, `hands`, `activateHand`, and `health` are live through the
facet, AND a workspace whose `runtimeId === 'openfang'` dispatches to the native
in-process runtime (substrate `in_process`) — no closed-union blocker remains. (The
stale `IN_PROCESS_RUNTIME_SPECS` / "not yet dispatchable" note in the
`openfang-runtime.ts` file header predates this selector-based dispatch and no
longer describes the wiring.)

## `onEvent` — one-way sink live; terminal event metered; bidirectional bridge is the residual

The in-process turn emits honest `started` / `log(response)` / `completed` (or
`failed`) RunEvents (`launchOpenfangRun`, `openfang-runtime.ts:314-459`). The
native substrate hands `agentTurn.run` a PER-CALL BUFFER sink that keeps `log`
messages for `capture()` AND forwards the TERMINAL event — which carries
`workspaceId` + the kernel's REAL `inputTokens`/`outputTokens` — to a late-bound
completion-hook `runSink` (`setRunSink`), so a merged run can meter real `token`
usage instead of a flat `agent_run` (`openfang-runtime.adapter.ts:194-299,331-334`).
Still a residual, not fabricated: the default sink when none is injected only logs
and drops the event (`openfang-runtime.ts:287-305`, `TODO(bd)` to wire the agent-os
repository as the default `runSink`), and the FULL bidirectional openfang-event-bus
↔ RunEvent bridge (kernel-side events flowing back into the run stream) is not yet
wired. Absent a sink ⇒ tokens are captured on the turn result but not metered — a
truthful degrade, never a faked emit.

## Governance provenance gate (runs BEFORE every fresh spawn)

`createOpenfangProvenanceGate` (`agent-engine/provenance-gate.ts`) bridges the
engines-domain provenance vocabulary to the governance kernel
(`GovernanceKernelPort.decide`) and back. It is the ONE gate instance the engines
module builds from the injected kernel and shares BOTH into the napi adapter's
`launch_run` option AND the facet's direct `run()` path. It runs before every fresh
`spawnAgent`: a signed manifest envelope is cryptographically verified
(`verifySignedManifest`) and the distilled provenance rides into the gate; a
`deny`/`needs_approval` verdict — or a kernel that THROWS — folds deny-biased into
`allow:false` (never a fabricated allow, `provenance-gate.ts:36-75`;
`openfang-runtime.ts:360-415`). A reused-by-name agent was already gated at its own
spawn; an unwired gate is skipped truthfully (provenance is advisory, never a stall).

## openfang MCP read tools (real-bound, degrade-truthful)

Engine tools expose the booted kernel's introspection surface to governed agent
callers (subject-tools are caller-bound). Beyond the two run-status reads —

- `openfang.introspect_hands` — lists the kernel's registered hands + their active
  state (over `listActiveHands`), so an agent can see which capability hands are
  live before `activateHand`; the `.node` absent ⇒ a truthful down report.
- `openfang.agent_run_status` — reports the status of an in-process openfang run
  (from `launchOpenfangRun`'s honest RunEvent stream); degrades truthfully when the
  kernel is not booted.

— the engine also registers `openfang.{health, list_agents, list_models,
list_skills, list_hands, bundled_hands, memory_get/set/list, spawn_agent, run_agent,
launch_run, invoke}` (grep `src/domains/engines`). Native openfang
also ships a workflow subsystem in the `.node`, promoted to a degrade-safe driver
(`openfang-workflow.ts`, `createOpenfangWorkflowDriver`: `register` / `run` /
`registerAndRun` over the kernel's `register_workflow` / `run_workflow`), so the
control plane can drive event-driven agent workflows without importing an engine
internal.
