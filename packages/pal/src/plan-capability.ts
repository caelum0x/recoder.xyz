import type { TaskIntent, TaskSpec, VerificationPlan } from '@recoder/agent-os';
import type { RuntimeChoice } from './agent-team';
import { planTask, type PALPlan } from './planner';
import type { RiskLevel, SandboxChoice } from './routing-policy';

/**
 * `computePalPlanDecision` — the in-proc PAL planning capability (RECODER-ENGINES
 * E11). It REUSES the pure decision logic in `planTask` (runtime team, sandbox,
 * skills, tool grants, risk, approval gates) and projects it onto the compact
 * governance decision the MCP `pal.plan` tool returns.
 *
 * DEGRADE-SAFE BY CONSTRUCTION: this never throws. When the task spec is missing,
 * malformed, or the planner errors, it returns a TRUTHFUL `degraded_default`
 * status carrying the most-restrictive, deny-biased decision below — it never
 * fabricates a permissive grant. The only external dependency (the clock) is
 * injectable via `options.now`.
 */

export type PalPlanStatus = 'planned' | 'degraded_default';

export type PalPlanDecision = {
  /** Chosen primary runtime for the task. */
  runtimeId: RuntimeChoice;
  /** Execution substrate / sandbox isolation. */
  substrate: SandboxChoice;
  /** MCP tool grants the runtime is allowed to call. */
  toolGrants: string[];
  /** Estimated risk level. */
  risk: RiskLevel;
  /** Whether a human/governance approval gate is required before acting. */
  approvalRequired: boolean;
};

export type PalPlanResult = {
  status: PalPlanStatus;
  decision: PalPlanDecision;
  /** Present on `degraded_default`: why the conservative path was taken. */
  reason?: string;
  /** Present on `planned`: the full PAL plan for richer clients. */
  plan?: PALPlan;
};

export type PalPlanOptions = {
  /** Injectable clock. Defaults to `new Date().toISOString()`. */
  now?: () => string;
};

/**
 * Most-restrictive, deny-biased fallback. Least privilege on every axis:
 * strongest sandbox isolation (`daytona`), zero tool grants, worst-case risk,
 * and a mandatory approval gate. Returned whenever inputs are untrustworthy.
 */
export const CONSERVATIVE_DEFAULT_DECISION: Readonly<PalPlanDecision> = Object.freeze({
  runtimeId: 'claude_code',
  substrate: 'daytona',
  toolGrants: [],
  risk: 'high',
  approvalRequired: true,
});

export function computePalPlanDecision(
  taskSpec: unknown,
  options: PalPlanOptions = {},
): PalPlanResult {
  const now = safeNow(options.now);

  const normalized = normalizeTaskSpec(taskSpec);
  if (!normalized) {
    return {
      status: 'degraded_default',
      decision: cloneDefault(),
      reason: describeInvalid(taskSpec),
    };
  }

  try {
    const plan = planTask(normalized, now);
    return {
      status: 'planned',
      decision: {
        runtimeId: plan.primaryRuntime,
        substrate: plan.sandbox,
        toolGrants: plan.mcpTools,
        risk: plan.risk,
        // DENY-BIAS: a high-risk task always requires approval, even if the pure
        // planner inferred no explicit gate. Never relax below what pal computed.
        approvalRequired: plan.approvalGateIds.length > 0 || plan.risk === 'high',
      },
      plan,
    };
  } catch (error) {
    return {
      status: 'degraded_default',
      decision: cloneDefault(),
      reason: `planner_error: ${errorMessage(error)}`,
    };
  }
}

const KNOWN_INTENTS: readonly TaskIntent[] = [
  'bugfix',
  'feature_delivery',
  'platform_hardening',
  'refactor',
  'code_review',
  'test_generation',
  'verification',
  'documentation',
  'research',
  'release',
  'incident_response',
  'migration',
  'handoff',
  'custom',
];

/**
 * Coerce untrusted input into a well-formed `TaskSpec` the pure planner can
 * consume. Returns `null` when the input carries no usable task identity — the
 * signal to fall back to the conservative default.
 */
function normalizeTaskSpec(input: unknown): TaskSpec | null {
  if (!isRecord(input)) {
    return null;
  }
  const taskId = asNonEmptyString(input['taskId']);
  if (!taskId) {
    return null;
  }

  const spec: TaskSpec = {
    taskId,
    title: asString(input['title']),
    intent: asIntent(input['intent']),
    goal: asString(input['goal']),
    spaceId: asString(input['spaceId']),
    targetPaths: asStringArray(input['targetPaths']),
    forbiddenPaths: asStringArray(input['forbiddenPaths']),
    acceptanceCriteria: asStringArray(input['acceptanceCriteria']),
    verification: asVerification(input['verification']),
    approvalRequired: asStringArray(input['approvalRequired']),
    artifactRequired: asStringArray(input['artifactRequired']),
  };

  const repo = asNonEmptyString(input['repo']);
  if (repo) {
    spec.repo = repo;
  }
  const metadata = input['metadata'];
  if (isRecord(metadata)) {
    spec.metadata = metadata;
  }

  return spec;
}

function asVerification(input: unknown): VerificationPlan {
  if (!isRecord(input)) {
    return { commands: [] };
  }
  const verification: VerificationPlan = { commands: asStringArray(input['commands']) };
  if (input['browserChecks'] !== undefined) {
    verification.browserChecks = asStringArray(input['browserChecks']);
  }
  if (input['evidenceRequired'] !== undefined) {
    verification.evidenceRequired = asStringArray(input['evidenceRequired']);
  }
  return verification;
}

function asIntent(input: unknown): TaskIntent {
  return typeof input === 'string' && (KNOWN_INTENTS as readonly string[]).includes(input)
    ? (input as TaskIntent)
    : 'custom';
}

function describeInvalid(input: unknown): string {
  if (!isRecord(input)) {
    return 'invalid_task_spec: expected an object';
  }
  return 'missing_task_identity: taskId is required';
}

function cloneDefault(): PalPlanDecision {
  return { ...CONSERVATIVE_DEFAULT_DECISION, toolGrants: [] };
}

function safeNow(now: (() => string) | undefined): string {
  try {
    return now?.() ?? new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
