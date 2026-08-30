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
 *  3. WORKSPACE — resolve the UNTRUSTED, caller-supplied `workspace` to a KNOWN,
 *     OWNED worktree and its REAL server-side checkout path (the injected
 *     {@link SkillWorkspaceResolver}). A traversal / absolute-outside / unknown /
 *     non-owned value ⇒ refuse BEFORE policy and BEFORE the executor (the raw client
 *     string is NEVER trusted as a filesystem path). Unwired ⇒ refuse truthfully
 *     rather than fall back to trusting the raw path. Downstream, ONLY the resolved
 *     trusted path is used — for both the policy input and the executor context.
 *  4. POLICY   — build the canonical capability-typed {@link PolicyInput} (over the
 *     resolved path) and run `evaluatePolicy` FIRST, ALWAYS, before any execution:
 *       - `deny`          ⇒ refuse (no execute);
 *       - `needs_approval`⇒ open an approval request and return
 *         `{ status:'needs_approval', requestId }` (NO execute);
 *       - `allow`         ⇒ proceed to execution.
 *  5. EXECUTE  — hand the injected executor ONLY the typed params + granted
 *     capabilities + the RESOLVED workspace (no ambient env / inherited secrets). An
 *     unwired executor ⇒ `SERVICE_UNAVAILABLE` (thrown), never a faked success.
 *
 * Every refusal carries the REAL reason; a `needs_approval` NEVER executes; policy
 * is consulted BEFORE execution on every path.
 */
import { randomUUID } from 'node:crypto';
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';
import type { PolicyDecision } from '@recoder/agent-os';
import type { PolicyInput } from '@recoder/agent-policy';
import type { WorkspacePolicyProfile } from '@recoder/agent-os';
import { buildSkillPolicyInput, qualifiedSkillToolName } from './skill-actor.js';
import { validateSkillParams } from './skill-params.js';
import type { SkillRegistry } from './skill-registry.js';
import type { SkillWorkspaceResolver } from './skill-workspace-resolver.js';
import type { SkillActionExecutor, SkillActionOutcome } from './skill.types.js';
import {
  sealSkillInvocationEvidence,
  verifySkillInvocationEvidence,
  type SkillInvocationEvidenceOutcome,
  type SkillInvocationEvidenceStore,
  type SkillInvocationEvidenceView,
  type SkillInvocationPhase,
  type SkillPolicyEvidence,
} from './skill-invocation-evidence.js';

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
    readonly target: string;
  }): Promise<{ readonly id: string }>;
}

export interface SkillActionServiceDeps {
  readonly registry: SkillRegistry;
  readonly evaluatePolicy: SkillPolicyEvaluator;
  readonly approval: SkillApprovalPort;
  /**
   * SECURITY — the workspace-resolution seam. Maps the caller-supplied `workspace`
   * (UNTRUSTED model/client output) to a KNOWN, OWNED worktree and returns its REAL
   * server-side checkout path, or REFUSES. The raw client string is NEVER trusted as
   * a filesystem path, so a traversal / absolute-outside / unknown / non-owned value
   * is refused BEFORE policy and BEFORE the executor. Absent (unwired) ⇒ every invoke
   * refuses truthfully rather than fall back to trusting the raw path.
   */
  readonly resolveWorkspace?: SkillWorkspaceResolver;
  /** Absent ⇒ every ALLOW-ed invoke refuses `SERVICE_UNAVAILABLE` (never faked). */
  readonly executor?: SkillActionExecutor;
  readonly logger: Logger;
  /** Optional decision clock (ISO-8601); defaults to wall clock. */
  readonly now?: () => string;
  /** Durable append/update store for exact invocation evidence. */
  readonly evidenceStore?: SkillInvocationEvidenceStore;
  /** Injectable id source; defaults to a UUID. */
  readonly newEvidenceId?: () => string;
  /** Resolve the durable policy constitution for the canonical workspace id. */
  readonly policyProfileForWorkspace?: (workspaceId: string) => Promise<WorkspacePolicyProfile>;
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
  private readonly resolveWorkspace?: SkillWorkspaceResolver;
  private readonly executor?: SkillActionExecutor;
  private readonly log: Logger;
  private readonly now: () => string;
  private readonly evidenceStore?: SkillInvocationEvidenceStore;
  private readonly newEvidenceId: () => string;
  private readonly policyProfileForWorkspace?: (workspaceId: string) => Promise<WorkspacePolicyProfile>;

  constructor(deps: SkillActionServiceDeps) {
    this.registry = deps.registry;
    this.evaluate = deps.evaluatePolicy;
    this.approval = deps.approval;
    if (deps.resolveWorkspace) this.resolveWorkspace = deps.resolveWorkspace;
    if (deps.executor) this.executor = deps.executor;
    this.log = deps.logger;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.evidenceStore = deps.evidenceStore;
    this.newEvidenceId = deps.newEvidenceId ?? randomUUID;
    this.policyProfileForWorkspace = deps.policyProfileForWorkspace;
  }

  async evidenceForWorkspace(workspaceId: string, limit = 50): Promise<SkillInvocationEvidenceView> {
    if (!this.evidenceStore) {
      throw createError(ErrorCode.SERVICE_UNAVAILABLE, 'skill: invocation evidence is not configured');
    }
    const target = workspaceId.trim();
    if (!target) throw createError(ErrorCode.VALIDATION_ERROR, 'workspace id is required');
    const page = await this.evidenceStore.listByWorkspace(target, limit);
    return {
      durable: this.evidenceStore.isDurable(),
      total: page.total,
      invocations: page.invocations.map(record => ({
        ...record,
        integrity: verifySkillInvocationEvidence(record) ? 'verified' as const : 'invalid' as const,
      })),
    };
  }

  async invoke(input: InvokeSkillActionInput): Promise<InvokeSkillActionResult> {
    const skillId = typeof input.skillId === 'string' ? input.skillId.trim() : '';
    const actionId = typeof input.actionId === 'string' ? input.actionId.trim() : '';
    const actorId = typeof input.actorId === 'string' ? input.actorId.trim() : '';
    const workspace = typeof input.workspace === 'string' ? input.workspace.trim() : '';
    const evidenceId = this.newEvidenceId();
    const startedAt = this.now();
    let trustedWorkspace: string | undefined;
    let skillVersion: string | undefined;
    let publisherKeyId: string | undefined;
    let capabilities: readonly string[] = [];
    const persist = async (
      phase: SkillInvocationPhase,
      policy: SkillPolicyEvidence,
      outcome: SkillInvocationEvidenceOutcome,
    ): Promise<void> => {
      if (!this.evidenceStore) return;
      const terminal = outcome.status !== 'executing';
      const completedAt = terminal ? this.now() : undefined;
      const startMs = Date.parse(startedAt);
      const completedMs = completedAt ? Date.parse(completedAt) : Number.NaN;
      await this.evidenceStore.put(sealSkillInvocationEvidence({
        id: evidenceId,
        startedAt,
        ...(completedAt ? { completedAt } : {}),
        ...(Number.isFinite(startMs) && Number.isFinite(completedMs)
          ? { durationMs: Math.max(0, completedMs - startMs) }
          : {}),
        actorId,
        target: { workspaceId: workspace, ...(trustedWorkspace ? { worktree: trustedWorkspace } : {}) },
        skill: {
          id: skillId,
          actionId,
          ...(skillVersion ? { version: skillVersion } : {}),
          ...(publisherKeyId ? { publisherKeyId } : {}),
          capabilities: [...capabilities],
        },
        params: input.params,
        phase,
        policy,
        outcome,
      }));
    };
    const refuseWithEvidence = async (
      phase: SkillInvocationPhase,
      reason: string,
      policy: SkillPolicyEvidence = { effect: 'not_evaluated' },
    ): Promise<InvokeSkillActionResult> => {
      await persist(phase, policy, { status: 'refused', reason });
      return refuse(reason);
    };

    if (!skillId || !actionId) {
      return refuseWithEvidence('request', 'skillId and actionId are required');
    }
    if (!actorId) {
      return refuseWithEvidence('request', 'an authenticated actor identity is required');
    }
    if (!workspace) {
      return refuseWithEvidence('request', 'a target workspace is required');
    }

    // 1) RESOLVE from the VERIFIED registry — unknown/unsigned/unpinned ⇒ refuse.
    const resolved = this.registry.resolveAction(skillId, actionId);
    if (!resolved) {
      return refuseWithEvidence('resolution', `unknown or unverified skill action: ${skillId}/${actionId}`);
    }
    const { action, manifest } = resolved;
    skillVersion = manifest.version;
    publisherKeyId = manifest.publisherKeyId;
    capabilities = action.requiredCapabilities;

    // 2) VALIDATE params against the typed schema (no free-argv) — refuse BEFORE policy.
    const validation = validateSkillParams(action.paramsSchema, input.params);
    if (!validation.ok) {
      return refuseWithEvidence('validation', `invalid params: ${validation.reason}`);
    }

    // 3) WORKSPACE (SECURITY) — resolve the UNTRUSTED, caller-supplied `workspace` to a
    // KNOWN, OWNED worktree and its REAL server-side checkout path, or REFUSE. This is
    // a gate BEFORE policy and BEFORE the executor: a traversal / absolute-outside /
    // unknown / non-owned value is refused here (never executed, never policy-allowed).
    // Unwired ⇒ refuse truthfully rather than fall back to trusting the raw path.
    if (!this.resolveWorkspace) {
      this.log.warn({ skillId, actionId, actorId }, 'skill invoke refused: workspace resolution not configured');
      return refuseWithEvidence('workspace', 'workspace resolution is not configured on this deployment');
    }
    const resolvedWorkspace = await this.resolveWorkspace.resolve({ workspace, actorId });
    if (!resolvedWorkspace.ok) {
      this.log.warn(
        { skillId, actionId, actorId, reason: resolvedWorkspace.reason },
        'skill invoke refused: workspace not resolvable to an owned worktree',
      );
      return refuseWithEvidence(
        'workspace',
        resolvedWorkspace.reason || 'workspace could not be resolved to an owned worktree',
      );
    }
    // The ONLY path that flows downstream — the trusted, server-side checkout path.
    trustedWorkspace = resolvedWorkspace.path;

    // 4) POLICY — build the canonical capability-typed input (over the RESOLVED,
    // trusted path — never the raw client string) and evaluate FIRST.
    let profile: WorkspacePolicyProfile | undefined;
    if (this.policyProfileForWorkspace) {
      try {
        profile = await this.policyProfileForWorkspace(workspace);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await persist('policy', { effect: 'not_evaluated' }, { status: 'failed', reason });
        throw error;
      }
    }
    const policyInput = buildSkillPolicyInput({
      actorId,
      skillId,
      action,
      workspace: trustedWorkspace,
      now: this.now(),
      ...(profile ? { profile } : {}),
    });
    const decision = this.evaluate(policyInput);
    const profileRevision = profile?.revision ?? 0;

    if (decision.effect === 'deny') {
      this.log.warn({ skillId, actionId, actorId, reason: decision.reason }, 'skill invoke denied by policy');
      const reason = decision.reason || 'denied by policy';
      return refuseWithEvidence('policy', reason, { effect: 'deny', profileRevision, ...(decision.reason ? { reason: decision.reason } : {}) });
    }

    if (decision.effect === 'needs_approval') {
      let record;
      try {
        record = await this.approval.request({
          action: qualifiedSkillToolName(skillId, actionId),
          riskTier: 'high',
          requestedBy: actorId,
          reason: decision.reason ?? null,
          taskId: input.taskId ?? null,
          target: trustedWorkspace,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await persist('approval', { effect: 'needs_approval', profileRevision, ...(decision.reason ? { reason: decision.reason } : {}) }, { status: 'failed', reason });
        throw error;
      }
      this.log.info({ skillId, actionId, actorId, requestId: record.id }, 'skill invoke gated: approval requested');
      const reason = decision.reason || 'approval required';
      await persist(
        'approval',
        { effect: 'needs_approval', profileRevision, ...(decision.reason ? { reason: decision.reason } : {}) },
        { status: 'needs_approval', requestId: record.id, reason },
      );
      return { status: 'needs_approval', requestId: record.id, reason };
    }

    // 5) ALLOW — and ONLY allow. A security-critical execution path must never be
    // reached by exclusion: any effect that is not an explicit 'allow' refuses.
    if (decision.effect !== 'allow') {
      const reason = decision.reason || `refused by policy (${decision.effect})`;
      return refuseWithEvidence('policy', reason);
    }

    // Execute over the capability-scoped context (NO ambient env/secrets), in the
    // RESOLVED trusted worktree — never the raw client-supplied workspace string.
    if (!this.executor) {
      const reason = 'skill: no action executor is configured on this deployment';
      await persist('execution', { effect: 'allow', profileRevision, ...(decision.reason ? { reason: decision.reason } : {}) }, { status: 'failed', reason });
      throw createError(
        ErrorCode.SERVICE_UNAVAILABLE,
        reason,
      );
    }
    const policyEvidence: SkillPolicyEvidence = {
      effect: 'allow',
      profileRevision,
      ...(decision.reason ? { reason: decision.reason } : {}),
    };
    await persist('execution', policyEvidence, { status: 'executing' });
    let result: SkillActionOutcome;
    try {
      result = await this.executor.execute({
        skillId,
        actionId,
        // A fresh, typed copy — exactly the validated params, nothing ambient.
        params: { ...validation.value },
        capabilities: [...action.requiredCapabilities],
        workspace: trustedWorkspace,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await persist('execution', policyEvidence, { status: 'failed', reason });
      throw error;
    }
    this.log.info({ skillId, actionId, actorId, ok: result.ok }, 'skill action executed');
    await persist('execution', policyEvidence, { status: 'executed', result });
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
