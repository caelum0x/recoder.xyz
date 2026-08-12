/**
 * `SkillActionService` — the GOVERNED invoke path for the skill model. It is the
 * single place a skill action can run, and it enforces the security invariants IN
 * ORDER, refusing (never executing) at the first failure:
 *
 *  1. RESOLVE  — the (skill, action) must exist in the VERIFIED registry. An
 *     unknown / unsigned / unpinned / unknown-publisher skill never resolves ⇒
 *     `{ refused: true, reason }`. A caller CANNOT bypass this by "claiming allow":
 *     execution flows only from a resolved, verified action.
 *  2. VALIDATE — the params must satisfy the action's typed schema (no free-argv).
 *     Any mismatch ⇒ refuse BEFORE policy is even consulted.
 *  3. POLICY   — build the canonical capability-typed {@link PolicyInput} and run
 *     `evaluatePolicy` FIRST, ALWAYS, before any execution:
 *       - `deny`          ⇒ refuse (no execute);
 *       - `needs_approval`⇒ open an approval request and return
 *         `{ status:'needs_approval', requestId }` (NO execute);
 *       - `allow`         ⇒ proceed to execution.
 *  4. EXECUTE  — hand the injected executor ONLY the typed params + granted
 *     capabilities + workspace (no ambient env / inherited secrets). An unwired
 *     executor ⇒ `SERVICE_UNAVAILABLE` (thrown), never a faked success.
 *
 * Every refusal carries the REAL reason; a `needs_approval` NEVER executes; policy
 * is consulted BEFORE execution on every path.
 */
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';
import type { PolicyDecision } from '@recoder/agent-os';
import type { PolicyInput } from '@recoder/agent-policy';
import { buildSkillPolicyInput, qualifiedSkillToolName } from './skill-actor.js';
import { validateSkillParams } from './skill-params.js';
import type { SkillRegistry } from './skill-registry.js';
import type { SkillActionExecutor, SkillActionOutcome } from './skill.types.js';

/** The pure policy-evaluation seam (bound to `@recoder/agent-policy`'s `evaluatePolicy`). */
export type SkillPolicyEvaluator = (input: PolicyInput) => PolicyDecision;

/**
 * The narrow approval seam — structurally satisfied by the governance
 * `ApprovalService.request` (which returns a record carrying an `id`). Kept local
 * so the skill model does not hard-couple to the governance domain.
 */
export interface SkillApprovalPort {
  request(params: {
    readonly action: string;
    readonly riskTier: 'low' | 'medium' | 'high' | 'critical';
    readonly requestedBy: string;
    readonly reason?: string | null;
    readonly taskId?: string | null;
  }): Promise<{ readonly id: string }>;
}

export interface SkillActionServiceDeps {
  readonly registry: SkillRegistry;
  readonly evaluatePolicy: SkillPolicyEvaluator;
  readonly approval: SkillApprovalPort;
  /** Absent ⇒ every ALLOW-ed invoke refuses `SERVICE_UNAVAILABLE` (never faked). */
  readonly executor?: SkillActionExecutor;
  readonly logger: Logger;
  /** Optional decision clock (ISO-8601); defaults to wall clock. */
  readonly now?: () => string;
}

/** The tenant + target of an invocation (identity is resolved at the tool boundary). */
export interface InvokeSkillActionInput {
  readonly skillId: string;
  readonly actionId: string;
  readonly params: unknown;
  /** The host-authorized subject id (never free-form model output). */
  readonly actorId: string;
  /** The worktree the action runs in. */
  readonly workspace: string;
  /** Optional task id to bind an approval to. */
  readonly taskId?: string | null;
}

/** The truthful outcome of an invocation — refuse / needs_approval / executed. */
export type InvokeSkillActionResult =
  | { readonly status: 'refused'; readonly refused: true; readonly reason: string }
  | { readonly status: 'needs_approval'; readonly requestId: string; readonly reason: string }
  | { readonly status: 'executed'; readonly result: SkillActionOutcome };

export class SkillActionService {
  private readonly registry: SkillRegistry;
  private readonly evaluate: SkillPolicyEvaluator;
  private readonly approval: SkillApprovalPort;
  private readonly executor?: SkillActionExecutor;
  private readonly log: Logger;
  private readonly now: () => string;

  constructor(deps: SkillActionServiceDeps) {
    this.registry = deps.registry;
    this.evaluate = deps.evaluatePolicy;
    this.approval = deps.approval;
    if (deps.executor) this.executor = deps.executor;
    this.log = deps.logger;
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  async invoke(input: InvokeSkillActionInput): Promise<InvokeSkillActionResult> {
    const skillId = typeof input.skillId === 'string' ? input.skillId.trim() : '';
    const actionId = typeof input.actionId === 'string' ? input.actionId.trim() : '';
    const actorId = typeof input.actorId === 'string' ? input.actorId.trim() : '';
    const workspace = typeof input.workspace === 'string' ? input.workspace.trim() : '';

    if (!skillId || !actionId) {
      return refuse('skillId and actionId are required');
    }
    if (!actorId) {
      return refuse('an authenticated actor identity is required');
    }
    if (!workspace) {
      return refuse('a target workspace is required');
    }

    // 1) RESOLVE from the VERIFIED registry — unknown/unsigned/unpinned ⇒ refuse.
    const resolved = this.registry.resolveAction(skillId, actionId);
    if (!resolved) {
      return refuse(`unknown or unverified skill action: ${skillId}/${actionId}`);
    }
    const { action } = resolved;

    // 2) VALIDATE params against the typed schema (no free-argv) — refuse BEFORE policy.
    const validation = validateSkillParams(action.paramsSchema, input.params);
    if (!validation.ok) {
      return refuse(`invalid params: ${validation.reason}`);
    }

    // 3) POLICY — build the canonical capability-typed input and evaluate FIRST.
    const policyInput = buildSkillPolicyInput({
      actorId,
      skillId,
      action,
      workspace,
      now: this.now(),
    });
    const decision = this.evaluate(policyInput);

    if (decision.effect === 'deny') {
      this.log.warn({ skillId, actionId, actorId, reason: decision.reason }, 'skill invoke denied by policy');
      return refuse(decision.reason || 'denied by policy');
    }

    if (decision.effect === 'needs_approval') {
      const record = await this.approval.request({
        action: qualifiedSkillToolName(skillId, actionId),
        riskTier: 'high',
        requestedBy: actorId,
        reason: decision.reason ?? null,
        taskId: input.taskId ?? null,
      });
      this.log.info({ skillId, actionId, actorId, requestId: record.id }, 'skill invoke gated: approval requested');
      return { status: 'needs_approval', requestId: record.id, reason: decision.reason || 'approval required' };
    }

    // 4) ALLOW — execute over the capability-scoped context (NO ambient env/secrets).
    if (!this.executor) {
      throw createError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'skill: no action executor is configured on this deployment',
      );
    }
    const result = await this.executor.execute({
      skillId,
      actionId,
      // A fresh, typed copy — exactly the validated params, nothing ambient.
      params: { ...validation.value },
      capabilities: [...action.requiredCapabilities],
      workspace,
    });
    this.log.info({ skillId, actionId, actorId, ok: result.ok }, 'skill action executed');
    return { status: 'executed', result };
  }
}

function refuse(reason: string): InvokeSkillActionResult {
  return { status: 'refused', refused: true, reason };
}

/** Build the skill action service over its seams. */
export function createSkillActionService(deps: SkillActionServiceDeps): SkillActionService {
  return new SkillActionService(deps);
}
