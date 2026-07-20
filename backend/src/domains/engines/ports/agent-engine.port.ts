/**
 * `AgentEngineService` — the cohesive openfang agent-engine facet the ENGINES
 * domain owns (docs/modules/agent-engine.md: "this facet lives inside
 * `backend/src/domains/engines/`, not a standalone `agent-engine` domain"). It
 * fuses the whole native openfang kernel surface behind ONE typed interface
 * composed over TWO engines-internal seams:
 *
 *   - PURE JSON verbs (health · listAgents · hands · publishEvent · workflow ·
 *     verifyManifest · memory · …) compose over the frozen `EngineClientPort`
 *     transport (`OpenfangNapiAdapter`) via `engine.invoke({op, input})`;
 *   - the TWO STREAMING verbs (`run`/`continueRun`) compose over the sibling
 *     `launchOpenfangRun` FUNCTION seam so a PER-CALL {@link OpenfangRunEventSink}
 *     can be threaded — the frozen `invoke` contract has no sink slot, and
 *     routing a turn through `invoke` would silently drop the per-turn buffer
 *     sink (breaking `capture()` + token metering). The shared provenance gate
 *     (built from the injected governance kernel) rides `deps.governance`.
 *
 * DEGRADE LAW (enforced per verb): a null/absent transport (`.node` unbuilt) or a
 * failed kernel boot degrades TRUTHFULLY — reads return `[]`/`null`, writes return
 * `false`/`{ok:false}`, streaming verbs return `{ available:false, reason }`; every
 * branch logs a reason. NOTHING throws across the facet; nothing is fabricated (no
 * faked tokens, no faked run).
 */
import type {
  OpenfangManifestProvenance,
  OpenfangRunEventSink,
} from '../openfang-runtime.js';

export type { OpenfangRunEventSink, OpenfangManifestProvenance };

/** Truthful facet liveness (probed through the napi transport health, never faked). */
export interface AgentEngineHealth {
  /** `.node` loaded AND kernel boot ok. */
  readonly available: boolean;
  /** `.node` dlopen'd + `ping()` succeeded (pre-boot). */
  readonly addonLoaded: boolean;
  readonly reason?: string;
  /** `native_version.version`, when the addon exposes one. */
  readonly version?: string;
  /** `native_version.build_mode` ('full' vs historical 'stub'). */
  readonly buildMode?: string;
}

/** One in-process agent turn → honest RunEvents. Mirrors `OpenfangLaunchResult`. */
export type AgentTurnResult =
  /** Engine absent / kernel boot failed — truthful degrade, no events emitted. */
  | { available: false; reason: string }
  /** Turn completed; `response` is the agent's answer for this turn. */
  | {
      available: true;
      ok: true;
      agentId: string;
      response: string;
      iterations?: number;
      inputTokens?: number;
      outputTokens?: number;
    }
  /** Engine present but the spawn/run failed — a `failed` RunEvent was emitted. */
  | { available: true; ok: false; error: string };

/** Input to one in-process agent turn (the conductor worktree stays the caller's concern). */
export interface AgentTurnInput {
  readonly workspaceId: string;
  readonly taskId: string;
  readonly runId: string;
  readonly prompt: string;
  readonly agentName?: string;
  readonly worktreePath?: string;
  /** Signed manifest envelope; verified + gated (provenance) before a fresh spawn. */
  readonly signedManifestJson?: string;
}

/** Composed hand introspection (defs ⋈ live instances) — the existing composite view. */
export interface HandsView {
  readonly hands: readonly unknown[];
  readonly active: readonly unknown[];
}

/** Result of registering a native openfang workflow (re-homes `openfang-workflow.ts`). */
export type WorkflowRegisterResult =
  | { available: false; reason: string }
  | { available: true; ok: true; workflowId: string }
  | { available: true; ok: false; error: string };

/** Result of running a registered native openfang workflow. */
export type WorkflowRunResult =
  | { available: false; reason: string }
  | { available: true; ok: true; runId: string; output: string }
  | { available: true; ok: false; error: string };

/** The cohesive agent-engine facet (see file header for the degrade law). */
export interface AgentEngineService {
  // -- liveness (pure verb: composes over engine health + nativeVersion) -------
  health(): Promise<AgentEngineHealth>;

  // -- run (path b: the load-bearing product flow, over the function seam) -----
  /**
   * Run ONE in-process agent turn against a caller-provided worktree, emitting
   * honest started/log/completed RunEvents to the PER-CALL `sink`. Composes over
   * the `launchOpenfangRun` FUNCTION (not `engine.invoke`) so this sink is threaded
   * into `deps.sink`; the shared provenance gate rides `deps.governance`, consulted
   * BEFORE a fresh spawn. The token-bearing terminal event forwarded to `sink` is
   * what conductor meters. Never throws — `{ available:false }` when the engine is
   * absent/boot-failed.
   */
  run(input: AgentTurnInput, sink: OpenfangRunEventSink): Promise<AgentTurnResult>;
  /** Follow-up turn — reuse-by-name so the kernel session continues (steer/chat). */
  continueRun(input: AgentTurnInput, sink: OpenfangRunEventSink): Promise<AgentTurnResult>;

  // -- introspection (reads; [] / null when down) — all over engine.invoke -----
  listAgents(): Promise<readonly unknown[]>;
  agentRunStatus(agentId: string): Promise<unknown | null>;
  listModels(): Promise<readonly unknown[]>;
  listSkills(): Promise<readonly string[]>;
  usageSummary(agentId?: string): Promise<unknown | null>;

  // -- hands (background workers) — lifecycle driven, over engine.invoke -------
  hands(): Promise<HandsView>;
  activateHand(handId: string): Promise<{ ok: boolean; instanceId?: string; reason?: string }>;
  pauseHand(instanceId: string): Promise<boolean>;
  resumeHand(instanceId: string): Promise<boolean>;
  deactivateHand(instanceId: string): Promise<boolean>;

  // -- event bus ↔ triggers (bidirectional bridge seam) — over engine.invoke ---
  publishEvent(
    event: Record<string, unknown>,
  ): Promise<readonly { agentId: string; message: string }[]>;
  registerTrigger(input: {
    agentId: string;
    pattern: unknown;
    promptTemplate: string;
    maxFires: number;
  }): Promise<{ ok: boolean; triggerId?: string; reason?: string }>;
  listTriggers(agentId?: string): Promise<readonly unknown[]>;
  setTriggerEnabled(triggerId: string, enabled: boolean): Promise<boolean>;

  // -- native workflow engine (re-homes openfang-workflow.ts) — engine.invoke --
  registerWorkflow(workflowJson: string): Promise<WorkflowRegisterResult>;
  runWorkflow(workflowId: string, input: string): Promise<WorkflowRunResult>;

  // -- manifest provenance (verifySignedManifest op) — over engine.invoke ------
  verifyManifest(signedManifestJson: string): Promise<OpenfangManifestProvenance>;

  // -- openfang per-agent KV (NOT Recoder memory-of-record) — engine.invoke ----
  memoryGet(agentId: string, key: string): Promise<unknown | null>;
  memorySet(agentId: string, key: string, value: unknown): Promise<boolean>;
  memoryDelete(agentId: string, key: string): Promise<boolean>;
  memoryList(agentId: string): Promise<readonly { key: string; value: unknown }[]>;
}
