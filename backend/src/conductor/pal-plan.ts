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
 *   3. `palToolRules` — the per-run permission contribution. The plan's GRANTED
 *      MCP tools (`PALPlan.mcpTools`) are translated into the EXACT agent-mcp
 *      tool-rule shape (`AgentProfile.permissions.toolRules`) the per-run
 *      permission stage (`canCallMcpTool`) consults. The run loop applies these
 *      onto the launched actor profile, so the plan's grants actually GOVERN which
 *      tools the run may call — HIGH-risk grants (scored by agent-mcp's own
 *      `estimateMcpToolRisk`) stay allowed but require approval. This is the real
 *      flow of `toolGrants` into the run, not a decorative annotation.
 *
 *   4. `palGovernanceAnnotation` — the D1 risk evidence for the governance gate:
 *      pal's risk tier + the granted-tool risk breakdown, surfaced as DESCRIPTIVE
 *      evidence the gate (and cockpit) can show.
 *
 * DECISION D1: `PALPlan.risk` ANNOTATES the run only (persisted on the workspace
 * record, and exposed to governance as descriptive evidence via
 * `palGovernanceAnnotation`); it MUST NOT drive governance routing — governance
 * keeps its own independent decision.
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
import { estimateMcpToolRisk } from '@recoder/agent-mcp';
import type { AgentPermissionPolicy, TaskSpec, WorkspaceSubstrate } from '@recoder/agent-os';
import { isConductorRuntimeId, type ConductorRuntimeId } from './runtime-commands.js';

/**
 * A per-run agent-mcp tool rule, in the EXACT shape the agent-mcp permission stage
 * (`canCallMcpTool`) consults via `AgentProfile.permissions.toolRules`. This is the
 * concrete contract the run loop applies onto the launched actor profile so the
 * PALPlan's `mcpTools` grants actually GOVERN which tools the run may call.
 */
export type PalToolRule = AgentPermissionPolicy['toolRules'][number];

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

/**
 * Translate the PALPlan's GRANTED MCP tools into the per-run agent-mcp permission
 * rules the run loop applies onto the launched actor profile.
 *
 * This is the REAL flow of `toolGrants` into the per-run permission set: the
 * agent-mcp permission stage (`canCallMcpTool`) decides each tool call against
 * `actor.permissions.toolRules`. By emitting one `allow` rule per pal-granted tool
 * we make the plan's grants the operative allowlist for the run. Each granted tool
 * is risk-scored with agent-mcp's own `estimateMcpToolRisk`; HIGH-risk grants (e.g.
 * `*.deploy`, anything matching the secret/billing/push/merge family) are allowed
 * but marked `requiresApproval` so a sensitive grant still funnels through approval
 * rather than running unchecked. Skills are NOT tools — they are carried on the
 * annotation for the runtime to load, not turned into permission rules.
 *
 * Pure + total: never throws, returns `[]` for an empty/garbage grant list so an
 * empty result simply means "no plan-derived grants" (the run keeps its base
 * profile) — it never blocks a launch.
 */
export function palToolRules(mcpTools: readonly string[]): PalToolRule[] {
  if (!Array.isArray(mcpTools)) return [];
  const seen = new Set<string>();
  const rules: PalToolRule[] = [];
  for (const toolName of mcpTools) {
    if (typeof toolName !== 'string' || toolName.length === 0 || seen.has(toolName)) continue;
    seen.add(toolName);
    const risk = estimateMcpToolRisk(toolName);
    rules.push({
      toolName,
      effect: 'allow',
      reason: `Granted by @recoder/pal plan (mcp risk: ${risk}).`,
      // High-risk grants stay allowed but must clear approval before the call runs.
      ...(risk === 'high' ? { requiresApproval: true } : {}),
    });
  }
  return rules;
}

/**
 * DECISION D1 governance annotation: the risk tier + the granted-tool risk
 * breakdown, surfaced to the governance gate as DESCRIPTIVE evidence only. It is
 * NOT a routing input — governance keeps its own independent decision; this lets
 * the gate (and the cockpit) SHOW pal's risk read and the highest-risk grant
 * without coupling the governance decision to the planner.
 */
export type PalGovernanceAnnotation = {
  /** pal's task risk tier (annotation only — never a governance routing input). */
  risk: PALPlan['risk'];
  /** The highest agent-mcp tool-risk among the granted tools ('low' when none). */
  highestToolRisk: 'low' | 'medium' | 'high';
  /** The granted tools that scored HIGH risk (e.g. deploy/secret/push family). */
  highRiskTools: string[];
};

const TOOL_RISK_ORDER = { low: 0, medium: 1, high: 2 } as const;

/**
 * Derive the D1 governance annotation from the granted tools + plan risk. Pure +
 * total: degrades to `{ risk, highestToolRisk: 'low', highRiskTools: [] }` for an
 * empty grant list. Descriptive only (D1) — it annotates, it does not route.
 */
export function palGovernanceAnnotation(
  risk: PALPlan['risk'],
  mcpTools: readonly string[],
): PalGovernanceAnnotation {
  const tools = Array.isArray(mcpTools) ? mcpTools.filter((t): t is string => typeof t === 'string' && t.length > 0) : [];
  let highest: 'low' | 'medium' | 'high' = 'low';
  const highRiskTools: string[] = [];
  for (const toolName of tools) {
    const toolRisk = estimateMcpToolRisk(toolName);
    if (TOOL_RISK_ORDER[toolRisk] > TOOL_RISK_ORDER[highest]) highest = toolRisk;
    if (toolRisk === 'high' && !highRiskTools.includes(toolName)) highRiskTools.push(toolName);
  }
  return { risk, highestToolRisk: highest, highRiskTools };
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
  /**
   * The plan's granted tools translated into agent-mcp permission rules — the
   * per-run allowlist the run loop applies onto the launched actor profile so
   * `canCallMcpTool` enforces the plan's grants (HIGH-risk grants require approval).
   */
  toolRules: PalToolRule[];
  approvalGateIds: string[];
  risk: PALPlan['risk'];
  /** D1 governance annotation (risk + granted-tool risk breakdown) — descriptive only. */
  governance: PalGovernanceAnnotation;
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
    toolRules: palToolRules(pal.mcpTools),
    approvalGateIds: pal.approvalGateIds,
    risk: pal.risk,
    governance: palGovernanceAnnotation(pal.risk, pal.mcpTools),
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
  /**
   * The per-run agent-mcp tool rules derived from the plan's grants. Persisted on
   * the workspace record so the run loop can apply them onto the launched actor's
   * `permissions.toolRules` (the agent-mcp permission stage enforces them) — this
   * is how the plan's `toolGrants` actually govern the run, not just decorate it.
   */
  toolRules: PalToolRule[];
  approvalGateIds: string[];
  /** D1: annotation-only risk tier — NOT a governance input. */
  risk: PALPlan['risk'];
  /** D1 governance annotation (risk + granted-tool risk breakdown) — descriptive only. */
  governance: PalGovernanceAnnotation;
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
        toolRules: plan.toolRules,
        approvalGateIds: plan.approvalGateIds,
        risk: plan.risk,
        governance: plan.governance,
        generatedAt: plan.pal.generatedAt,
      },
    };
  } catch {
    return null;
  }
}
