/**
 * Conductor PAL plan seam — the in-process fusion of @recoder/pal (the planner /
 * agent-team routing layer) into the REAL workspace-create path.
 *
 * pal is a pure, IO-free planning layer: given a `TaskSpec` (the canonical
 * Recoder control-plane task contract) it returns a `PALPlan` — the recommended
 * runtime team (primary + reviewer), browser-verification need, sandbox tier,
 * skills, MCP tool grants, inferred approval-gate ids, and a risk level.
 *
 * Two surfaces live here:
 *
 *   1. `planConductorRun` / `effectiveRuntimeId` — vocabulary translation between
 *      pal's enums and the Conductor's runtime + substrate ids. Pure, advisory.
 *
 *   2. `applyPalDefaults` — the create-path defaulter. When a workspace is
 *      created WITHOUT an explicit `runtimeId`/`substrate`, the conductor resolves
 *      the task's canonical `TaskSpec`, runs pal once, and DEFAULTS the runtime
 *      team + substrate + tool-grants/skills from the resulting `PALPlan` while
 *      ANNOTATING the record with the plan (incl. risk). A caller-provided
 *      `runtimeId`/`substrate` ALWAYS wins (no behavior change when given).
 *
 * DECISION D1: `PALPlan.risk` ANNOTATES the run only (persisted on the workspace
 * record so the cockpit can show it); it MUST NOT drive governance routing —
 * governance keeps its own independent decision.
 *
 * DEGRADE-SAFE: every entry point that touches pal is wrapped so a missing/throwing
 * planner falls back to the prior default routing and NEVER blocks a launch.
 *
 * The only mapping work here is vocabulary translation between pal's enums and the
 * Conductor's own ids:
 *   - pal `RuntimeChoice`  → Conductor `ConductorRuntimeId` (the 8 headless CLIs).
 *   - pal `SandboxChoice`  → agent-os `WorkspaceSubstrate` (tmux_worktree/daytona/
 *     in_process), i.e. the substrates this backend actually registers.
 *
 * Translation is honest: where pal recommends a runtime the Conductor cannot
 * launch headless (`browser_agent`) the mapping is reported as unsupported rather
 * than silently coerced, and the caller is told the fallback that WILL run.
 */
import { planTask, type PALPlan } from '@recoder/pal';
import type { TaskSpec, WorkspaceSubstrate } from '@recoder/agent-os';
import { isConductorRuntimeId, type ConductorRuntimeId } from './runtime-commands.js';

/**
 * pal's runtime ids overlap the Conductor's almost exactly; `browser_agent` is the
 * one pal runtime that is not a headless coding CLI the Conductor launches into a
 * tmux/worktree session. We surface it as unsupported (with a tmux fallback) so the
 * recommendation never lies about what would actually run.
 */
function mapRuntime(choice: PALPlan['primaryRuntime']): {
  runtimeId: ConductorRuntimeId | null;
  supported: boolean;
} {
  if (isConductorRuntimeId(choice)) {
    return { runtimeId: choice, supported: true };
  }
  // e.g. 'browser_agent' — not a headless conductor CLI.
  return { runtimeId: null, supported: false };
}

/**
 * Map pal's sandbox tier onto the substrates this backend registers
 * (substrate-tmux / substrate-daytona / substrate-in-process). pal's `e2b` /
 * `local_container` / `none` collapse onto the local tmux worktree substrate
 * (the proven default); `daytona` maps to the registered remote sandbox.
 */
function mapSubstrate(choice: PALPlan['sandbox']): WorkspaceSubstrate {
  if (choice === 'daytona') return 'daytona';
  // 'e2b' | 'local_container' | 'none' → the local default execution substrate.
  return 'tmux_worktree';
}

/** A Conductor-vocabulary recommendation derived from a pal `PALPlan`. */
export type ConductorPlan = {
  taskId: string;
  /** The recommended headless CLI to launch, or null when pal recommends a non-CLI runtime. */
  runtimeId: ConductorRuntimeId | null;
  /** Whether the Conductor can launch the recommended runtime headless. */
  runtimeSupported: boolean;
  /** The runtime the Conductor will actually fall back to if the recommended one is unsupported. */
  fallbackRuntimeId: ConductorRuntimeId;
  /** Recommended reviewer runtime (mapped), when pal proposes a reviewer. */
  reviewerRuntimeId: ConductorRuntimeId | null;
  /** The registered substrate the recommended sandbox tier maps onto. */
  substrate: WorkspaceSubstrate;
  /** Whether a browser-verification pass is recommended (pal verifier or browser checks). */
  browserVerification: boolean;
  skills: string[];
  mcpTools: string[];
  approvalGateIds: string[];
  risk: PALPlan['risk'];
  /** The raw pal plan, unmodified, for callers that want the source-of-truth fields. */
  pal: PALPlan;
};

/** The Conductor's safe default runtime when a recommendation cannot be launched headless. */
const FALLBACK_RUNTIME: ConductorRuntimeId = 'claude_code';

/**
 * Run pal's `planTask` over a real `TaskSpec` and translate the result into the
 * Conductor's runtime + substrate vocabulary. Pure: no IO, no launch — the caller
 * decides whether to act on the recommendation.
 */
export function planConductorRun(task: TaskSpec, now?: string): ConductorPlan {
  const pal: PALPlan = planTask(task, now);
  const primary = mapRuntime(pal.primaryRuntime);
  const reviewer = pal.reviewerRuntime ? mapRuntime(pal.reviewerRuntime) : { runtimeId: null, supported: false };

  return {
    taskId: pal.taskId,
    runtimeId: primary.runtimeId,
    runtimeSupported: primary.supported,
    fallbackRuntimeId: FALLBACK_RUNTIME,
    reviewerRuntimeId: reviewer.runtimeId,
    substrate: mapSubstrate(pal.sandbox),
    browserVerification: pal.browserVerification,
    skills: pal.skills,
    mcpTools: pal.mcpTools,
    approvalGateIds: pal.approvalGateIds,
    risk: pal.risk,
    pal,
  };
}

/**
 * The runtime id a caller should actually launch given a recommendation: the
 * recommended one when the Conductor supports it headless, else the safe fallback.
 * This is what the `POST /workspaces/plan` route surfaces as `effectiveRuntimeId`.
 */
export function effectiveRuntimeId(plan: ConductorPlan): ConductorRuntimeId {
  return plan.runtimeSupported && plan.runtimeId ? plan.runtimeId : plan.fallbackRuntimeId;
}

/**
 * The PALPlan annotation persisted onto the workspace record's metadata when the
 * create path defaulted any field from pal. It is descriptive only — the cockpit
 * reads it to show the recommended team + risk; it never re-drives execution.
 */
export type PalPlanAnnotation = {
  /** The runtime the create path actually launched (defaulted from pal). */
  runtimeId: ConductorRuntimeId;
  /** The substrate the create path actually selected (defaulted from pal). */
  substrate: WorkspaceSubstrate;
  /** Recommended reviewer runtime, when pal proposed one. */
  reviewerRuntimeId: ConductorRuntimeId | null;
  browserVerification: boolean;
  skills: string[];
  mcpTools: string[];
  approvalGateIds: string[];
  /** D1: annotation-only risk tier — NOT a governance input. */
  risk: PALPlan['risk'];
  generatedAt: string;
};

/** The defaulting result the create path applies before delegating to the engine. */
export type PalDefaults = {
  /** The runtime to launch (pal-recommended when supported, else fallback). */
  runtimeId: ConductorRuntimeId;
  /** The substrate to launch on (pal-recommended sandbox tier mapped). */
  substrate: WorkspaceSubstrate;
  /** The plan annotation to persist on the workspace record (incl. risk). */
  annotation: PalPlanAnnotation;
};

/**
 * Compute the PAL-derived defaults (runtime + substrate + annotation) for a task.
 *
 * Pure over a resolved `TaskSpec`: callers (workspace-service create) decide WHEN
 * to use it — only when no explicit runtimeId/substrate was provided. The launched
 * `runtimeId` is the pal recommendation when the Conductor can run it headless,
 * else the safe fallback (`claude_code`), so the workspace always launches on a
 * real CLI. The annotation captures the full pal team + risk for the cockpit.
 *
 * Returns `null` when pal is unavailable or throws — the caller then keeps its
 * prior default routing. NEVER throws.
 */
export function computePalDefaults(task: TaskSpec, now?: string): PalDefaults | null {
  try {
    const plan = planConductorRun(task, now);
    const runtimeId = effectiveRuntimeId(plan);
    return {
      runtimeId,
      substrate: plan.substrate,
      annotation: {
        runtimeId,
        substrate: plan.substrate,
        reviewerRuntimeId: plan.reviewerRuntimeId,
        browserVerification: plan.browserVerification,
        skills: plan.skills,
        mcpTools: plan.mcpTools,
        approvalGateIds: plan.approvalGateIds,
        risk: plan.risk,
        generatedAt: plan.pal.generatedAt,
      },
    };
  } catch {
    return null;
  }
}
