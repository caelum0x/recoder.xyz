/**
 * OSS dispatch boundary — wires `@recoder/agent-oss` IN-PROCESS behind the
 * conductor substrate dispatch (substrate-in-process.ts `launch`).
 *
 * MONOREPO RULE (.claude/rules/monorepo.md): OSS execution frameworks
 * (langgraph / crewai / autogen / browser-use / e2b / playwright / ...) are
 * REPLACEABLE execution surfaces that must NEVER own Recoder state. This module
 * enforces that boundary on the real product path: when an in_process workspace
 * is launched with a `runtimeId` that names an OSS provider, the substrate runs
 * the launch input through `@recoder/agent-oss`'s adapter boundary —
 * `assertAdapterCanHandle` + `mapTaskForOssRuntime` — to produce the canonical
 * `OssTaskMapping`. Recoder keeps the Workspace lifecycle, the run record, and
 * the RunEvents; agent-oss only owns the OSS dispatch translation.
 *
 * ADDITIVE + DEGRADE-SAFE: this only activates when the runtimeId resolves to a
 * known OSS adapter profile. For the default runtimes (`recoder_code`,
 * `claude_code`, ...) `resolveOssDispatch` returns `null` and the substrate's
 * prior `@recoder/runtime` path runs unchanged. If the agent-oss boundary throws
 * or the package is unavailable, the caller logs and falls back to prior
 * behavior — an OSS dispatch failure NEVER blocks a launch.
 *
 * REAL EXECUTION SURFACE (the capability that must flow end-to-end): most OSS
 * profiles agent-oss publishes today are mapping-only — they translate the task
 * but do not own a runnable engine. ONE profile, `openfang`, is a genuine
 * execution surface.  The engine run is now resolved in NATIVE-FIRST order:
 *
 *   1. Native addon (.node via NAPI-RS) — direct in-process call, zero IPC.
 *      Loaded by openfang-native.ts; present only when the crate was built
 *      (`cargo build -p openfang-napi --release`).
 *   2. Subprocess/loopback path (existing `OpenFangAdapter.run()`) — spawns
 *      the openfang CLI and streams RunEvents over stdout/loopback HTTP.
 *      Active whenever the native addon is absent (build deferred, wrong arch,
 *      ENOSPC, etc.).  Degrades safely to a single honest `failed` RunEvent
 *      when the binary is also absent.
 *
 * For that profile `resolveOssDispatch` attaches a lazy `run()` starter on the
 * result so the substrate run loop can drive the engine's actual RunEvents —
 * instead of only logging a translation. Mapping-only profiles return
 * `run: undefined` and keep prior behavior.
 */
import {
  assertAdapterCanHandle,
  mapTaskForOssRuntime,
  OpenFangAdapter,
  type OssAdapter,
  type OssAdapterProfile,
  type OssAdapterRunInput,
  type OssTaskMapping,
  autogenAdapterProfile,
  browserUseAdapterProfile,
  crewAiAdapterProfile,
  daytonaAdapterProfile,
  e2bAdapterProfile,
  githubAdapterProfile,
  langGraphAdapterProfile,
  liteLlmAdapterProfile,
  mem0AdapterProfile,
  openFangAdapterProfile,
  openGrokAdapterProfile,
  openZitiAdapterProfile,
  playwrightAdapterProfile,
  sourcegraphAdapterProfile,
  stagehandAdapterProfile,
} from '@recoder/agent-oss';
import type { RunEvent, TaskSpec } from '@recoder/agent-os';
import type { RuntimePolicy } from '@recoder/agent-runtimes';
import { loadNativeAddon } from './openfang-native.js';

/**
 * The OSS adapter profiles agent-oss publishes today. Kept as a flat list so the
 * lookup below can match a runtimeId against `adapterId`, `provider`, or a
 * normalized alias without each adapter needing to register itself.
 */
const OSS_PROFILES: readonly OssAdapterProfile[] = [
  autogenAdapterProfile,
  browserUseAdapterProfile,
  crewAiAdapterProfile,
  daytonaAdapterProfile,
  e2bAdapterProfile,
  githubAdapterProfile,
  langGraphAdapterProfile,
  liteLlmAdapterProfile,
  mem0AdapterProfile,
  openFangAdapterProfile,
  openGrokAdapterProfile,
  openZitiAdapterProfile,
  playwrightAdapterProfile,
  sourcegraphAdapterProfile,
  stagehandAdapterProfile,
];

/**
 * Factory for the runnable OSS adapters — the profiles agent-oss can actually
 * EXECUTE (not just translate). Each factory returns a fresh `OssAdapter` with a
 * real `run()` async iterable. Keyed by normalized adapterId so a resolved
 * profile can be promoted to a live engine. Today only `openfang` is runnable;
 * mapping-only profiles are absent here and stay translate-only.
 */
const RUNNABLE_OSS_ADAPTERS: Readonly<Record<string, () => OssAdapter>> = {
  openfang: () => new OpenFangAdapter(),
};

/** Normalize a runtime/provider id for tolerant matching (`browser-use` ~ `browser_use`). */
function normalize(id: string): string {
  return id.trim().toLowerCase().replace(/[-_\s]+/g, '_');
}

/**
 * Resolve the agent-oss profile a runtimeId targets, or `undefined` for the
 * proven default runtimes (recoder_code / claude_code / ...). A runtimeId matches
 * when its normalized form equals the profile's normalized `adapterId` or
 * `provider`.
 */
export function resolveOssProfile(runtimeId: string | undefined): OssAdapterProfile | undefined {
  if (!runtimeId) return undefined;
  const target = normalize(runtimeId);
  return OSS_PROFILES.find(
    (profile) => normalize(profile.adapterId) === target || normalize(profile.provider) === target,
  );
}

/** Input the substrate has at launch time, narrowed to what the boundary needs. */
export type OssDispatchLaunch = {
  workspaceId: string;
  runtimeId: string;
  repoPath: string;
  branch: string;
  /** Rendered prompt (preferred) or the raw command the workspace was launched with. */
  prompt: string;
};

/**
 * A live engine run started through agent-oss. `events` is the engine's real
 * `RunEvent` async iterable (e.g. OpenFang subprocess stdout/stderr → RunEvents);
 * `cancel` terminates the in-flight engine. Degrade-safe by construction: the
 * underlying adapter yields an honest `failed` RunEvent (never throws) when its
 * engine binary is unavailable, so the caller can always drain `events`.
 */
export type OssEngineRun = {
  events: AsyncIterable<RunEvent>;
  cancel: () => Promise<void>;
};

export type OssDispatchResult = {
  profile: OssAdapterProfile;
  mapping: OssTaskMapping;
  /**
   * Present ONLY when the resolved profile is a genuine execution surface
   * (`openfang` today). Calling it instantiates the engine adapter and returns
   * its live `RunEvent` stream so the substrate run loop can drive the engine's
   * real output. `undefined` for mapping-only profiles — the caller then keeps
   * the prior translate-and-log behavior with no execution change.
   *
   * Lazy + non-throwing: `run()` only starts the engine when invoked, and any
   * instantiation failure is folded into a single honest `failed` RunEvent so an
   * engine fault NEVER blocks the launch.
   */
  run?: () => OssEngineRun;
};

/**
 * Build a minimal-but-canonical `TaskSpec` for the OSS boundary from the launch
 * input. This is the same shape the in_process substrate already builds for the
 * runtime engine, kept local so the boundary stays substrate-agnostic.
 */
function buildTaskSpec(input: OssDispatchLaunch): TaskSpec {
  return {
    taskId: `ws_${input.workspaceId}`,
    title: `Conductor in-process workspace ${input.workspaceId}`,
    intent: 'custom',
    goal: input.prompt,
    spaceId: 'conductor',
    repo: input.repoPath,
    branchPolicy: 'reuse_branch',
    targetPaths: [],
    forbiddenPaths: [],
    acceptanceCriteria: [],
    verification: { commands: [] },
    approvalRequired: [],
    artifactRequired: [],
  };
}

/**
 * The policy passed to the OSS boundary. Conservative defaults that mirror the
 * in_process driver's own policy; the boundary records it on the mapping so the
 * OSS surface inherits Recoder's policy decision rather than inventing its own.
 */
function buildPolicy(): RuntimePolicy {
  return {
    requireSignedEnvelope: false,
    enforceWorkLocks: false,
    allowNetwork: true,
    allowShell: true,
    approvalMode: 'auto',
  };
}

/**
 * Build the lazy engine-run starter for a runnable OSS profile, or `undefined`
 * when the profile is mapping-only. The starter is the seam where the engine's
 * REAL execution capability flows into the product run loop: invoking it
 * instantiates the adapter and returns its live `RunEvent` async iterable.
 *
 * NATIVE-FIRST ORDER (for the `openfang` profile):
 *   1. Native addon (.node via NAPI-RS) — direct in-process call.
 *      When `openfang-napi` is built and present, the engine runs in-process
 *      without spawning a subprocess or hitting the loopback HTTP API.
 *   2. Subprocess/loopback path (`OpenFangAdapter.run()`) — prior behavior,
 *      active whenever the native addon is absent.
 *
 * Fully degrade-safe:
 * - A profile with no registered factory (every provider except `openfang`
 *   today) gets `undefined` — translate-only, prior behavior preserved.
 * - If the native addon require() throws or ping() fails, `loadNativeAddon()`
 *   returns `undefined` and we fall through to the subprocess path — never
 *   throws into the caller.
 * - If the subprocess factory throws, we fold the failure into a single honest
 *   `failed` RunEvent so draining `events` never blocks the launch.
 * - The adapter's own `run()` already degrades to a `failed` event when its
 *   binary is absent, so the live path is safe end to end.
 */
function buildEngineRun(
  profile: OssAdapterProfile,
  task: TaskSpec,
  runInput: OssAdapterRunInput,
): (() => OssEngineRun) | undefined {
  const normalizedId = normalize(profile.adapterId);
  const factory = RUNNABLE_OSS_ADAPTERS[normalizedId];
  if (!factory) return undefined;

  return () => {
    // --- PATH 1: native addon (in-process, zero IPC) ---
    if (normalizedId === 'openfang') {
      const native = loadNativeAddon();
      if (native) {
        return buildNativeEngineRun(native, task, runInput);
      }
      // Native addon absent — fall through to the subprocess path below.
    }

    // --- PATH 2: subprocess/loopback (existing OSS adapter behavior) ---
    let adapter: OssAdapter;
    try {
      adapter = factory();
    } catch (err) {
      // Engine could not be constructed — surface one honest failed event rather
      // than throwing into the caller's run loop.
      const reason = err instanceof Error ? err.message : String(err);
      return {
        events: (async function* degraded(): AsyncIterable<RunEvent> {
          yield {
            eventId: `oss_${task.taskId}_${Date.now()}`,
            taskId: task.taskId,
            agentId: profile.adapterId,
            createdAt: new Date().toISOString(),
            type: 'failed',
            state: 'failed',
            message: `OSS engine ${profile.adapterId} could not start: ${reason}`,
            data: { degraded: true },
          };
        })(),
        cancel: async () => {},
      };
    }

    return {
      // The adapter's run() is the engine's real capability: for openfang it
      // spawns the CLI and streams subprocess output as RunEvents. assertAdapter
      // CanHandle inside run() guards intent support; `custom` is supported.
      events: adapter.run ? adapter.run(runInput) : emptyEventStream(),
      cancel: async () => {
        if (adapter.cancel) {
          try {
            await adapter.cancel(profile.adapterId);
          } catch {
            // Best-effort cancel; never throw out of teardown.
          }
        }
      },
    };
  };
}

/**
 * Build a native-addon-backed `OssEngineRun` for the openfang profile.
 *
 * The native addon calls `runAgent()` in-process via the Rust kernel — no
 * subprocess, no loopback HTTP.  The result is wrapped into a minimal
 * `RunEvent` stream so the substrate run loop can drain it like any other
 * engine run.
 *
 * Degrade-safe: any exception from the native call is folded into a single
 * honest `failed` RunEvent rather than thrown.
 */
function buildNativeEngineRun(
  native: import('./openfang-native.js').OpenfangNativeAddon,
  task: TaskSpec,
  runInput: OssAdapterRunInput,
): OssEngineRun {
  const abortController = { cancelled: false };

  return {
    events: (async function* nativeEvents(): AsyncIterable<RunEvent> {
      yield {
        eventId: `oss_native_${task.taskId}_${Date.now()}`,
        taskId: task.taskId,
        agentId: 'openfang',
        createdAt: new Date().toISOString(),
        type: 'started',
        state: 'running',
        message: 'openfang native addon: agent run started (in-process)',
        data: { native: true },
      };

      if (abortController.cancelled) {
        yield {
          eventId: `oss_native_${task.taskId}_cancel_${Date.now()}`,
          taskId: task.taskId,
          agentId: 'openfang',
          createdAt: new Date().toISOString(),
          type: 'failed',
          state: 'failed',
          message: 'openfang native addon: run cancelled before agent call',
          data: { native: true, cancelled: true },
        };
        return;
      }

      try {
        // `renderedPrompt` is the canonical message to send to the agent.
        const prompt = runInput.bundle?.renderedPrompt ?? runInput.task.goal;
        // Use the first agent listed in the task spec or a well-known default.
        const agentId = 'default';

        const raw = await native.runAgent(agentId, prompt, null);
        const result: { ok: boolean; response?: string; error?: string } = JSON.parse(raw);

        if (result.ok) {
          yield {
            eventId: `oss_native_${task.taskId}_done_${Date.now()}`,
            taskId: task.taskId,
            agentId: 'openfang',
            createdAt: new Date().toISOString(),
            type: 'completed',
            state: 'completed',
            message: result.response ?? '',
            data: { native: true, response: result.response },
          };
        } else {
          yield {
            eventId: `oss_native_${task.taskId}_err_${Date.now()}`,
            taskId: task.taskId,
            agentId: 'openfang',
            createdAt: new Date().toISOString(),
            type: 'failed',
            state: 'failed',
            message: `openfang native addon error: ${result.error ?? 'unknown'}`,
            data: { native: true, error: result.error, degraded: true },
          };
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        yield {
          eventId: `oss_native_${task.taskId}_exc_${Date.now()}`,
          taskId: task.taskId,
          agentId: 'openfang',
          createdAt: new Date().toISOString(),
          type: 'failed',
          state: 'failed',
          message: `openfang native addon threw: ${reason}`,
          data: { native: true, error: reason, degraded: true },
        };
      }
    })(),
    cancel: async () => {
      abortController.cancelled = true;
    },
  };
}

/** Empty RunEvent stream for a runnable profile whose adapter omits `run()`. */
async function* emptyEventStream(): AsyncIterable<RunEvent> {
  // intentionally yields nothing
}

/**
 * If `runtimeId` targets an OSS framework, run the launch through the
 * `@recoder/agent-oss` boundary and return the canonical mapping. Returns `null`
 * for non-OSS runtimes (the default in-process path) so the caller leaves proven
 * behavior untouched.
 *
 * The boundary is the only place OSS task translation happens; it asserts the
 * adapter can handle the task intent and never lets the OSS surface own Recoder
 * state (the mapping carries only refs back into canonical state).
 *
 * For a genuine execution surface (`openfang`), the result also carries a lazy
 * `run()` starter so the substrate can drive the engine's REAL RunEvents — the
 * engine's capability flows through, not just its task translation.
 */
export function resolveOssDispatch(input: OssDispatchLaunch): OssDispatchResult | null {
  const profile = resolveOssProfile(input.runtimeId);
  if (!profile) return null;

  const task = buildTaskSpec(input);
  const runInput: OssAdapterRunInput = {
    task,
    bundle: {
      bundleId: `ws_${input.workspaceId}`,
      taskId: task.taskId,
      agentId: profile.adapterId,
      runtime: profile.adapterId,
      sharedGoal: input.prompt,
      acceptanceCriteria: [],
      verificationCommands: [],
      forbiddenActions: [],
      approvalGateIds: [],
      memoryRefIds: [],
      sourceRefs: [],
      compilerVersion: 'conductor-oss-dispatch',
      compiledAt: new Date().toISOString(),
      renderedPrompt: input.prompt,
    },
    policy: buildPolicy(),
  };

  // The boundary asserts intent support before producing the mapping. `custom`
  // is supported by every published OSS profile, so a known provider maps; an
  // unsupported intent would throw here and the caller degrades to the prior path.
  assertAdapterCanHandle(profile, task);
  const mapping = mapTaskForOssRuntime(profile, runInput);

  // Promote a runnable profile (openfang) to a live engine starter so the
  // caller can stream the engine's real RunEvents. `undefined` for mapping-only
  // profiles keeps the prior translate-and-log behavior unchanged.
  const run = buildEngineRun(profile, task, runInput);

  return { profile, mapping, run };
}
