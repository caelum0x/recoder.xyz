/**
 * `GovernanceGateService` — the concrete WRITE seam (`decide → risk → audit`).
 *
 * Ported from the reuse target `conductor/governance-gate.ts` (the delivery
 * gate), widened from PR/merge to EVERY governed action behind the frozen
 * `GovernanceGate` port. Pipeline:
 *
 *   1. Build a `KernelRequest` from `(action, principal, ctx)`.
 *   2. `kernel.decide(req)` — the napi→daemon→ts ladder (fail-closed synthetic
 *      deny on total kernel failure; never a fake allow).
 *   3. Seal the decision into the durable Merkle audit chain.
 *   4. Return an immutable `GateVerdict`.
 *
 * FAIL-CLOSED POSTURE:
 *   - `kernel.decide` never throws a policy outcome (the ladder returns verdicts);
 *     an infrastructure fault yields `engine: 'synthetic'` deny.
 *   - If sealing an `allow` into the tamper-evident chain FAILS, the allow is
 *     downgraded to a synthetic deny — an un-recorded allow would break the audit
 *     guarantee, so we refuse to claim success. `deny`/`needs_approval` verdicts
 *     pass through even if audit fails (they already block); the audit failure is
 *     logged. (The integration step may relax this to degrade-to-log if desired.)
 *   - For `needs_approval`, a REAL `approved` record for the same task+action
 *     CLEARS the gate: the verdict is returned as `allow` carrying that record's
 *     id as `approvalId` and a `cleared by approval <id>` reason, and the
 *     clearance is sealed into the durable audit chain. Everything else stays
 *     fail-closed: no repo / no taskId / no matching approved record / a lookup
 *     fault all leave the verdict blocking, and the kernel's bare
 *     `approvalGateId` NEVER clears anything.
 */
import type { Logger } from '../../../shared/logger.js';
import type { Principal } from '../../identity/types.js';
import type { GovernanceGate } from '../ports/gate.port.js';
import type { GovernanceKernelPort } from '../ports/kernel.port.js';
import type { ApprovalRepository } from '../ports/approval-repo.port.js';
import type { ConsensusReview, ConsensusReviewPort } from '../ports/consensus.port.js';
import type {
  ApprovalStorePort,
  ApprovalSubmitInput,
  ApprovalSubmitResult,
  ApprovalResolveResult,
  PendingApproval,
  ReloadPoliciesResult,
} from '../ports/approval-store.port.js';
import type { AuditChainService } from './audit-chain.service.js';
import {
  type AuditEntryInput,
  type AuditRecord,
  type AuditVerification,
  type GateDecisionContext,
  type GateVerdict,
  type GovernanceAction,
  type KernelRequest,
  type KernelVerdict,
  type RoutingHint,
  type ToolEnforcement,
  riskTierRank,
} from '../types.js';

export interface GovernanceGateDeps {
  readonly kernel: GovernanceKernelPort;
  readonly audit: AuditChainService;
  readonly approvals?: ApprovalRepository;
  /**
   * The Rust kernel's own in-proc `ApprovalManager` store (submit/resolve/list/
   * count + reloadPolicies). When present + `available`, it is the PRIMARY store
   * the gate uses to clear a `needs_approval` verdict (the SAME kernel that ran
   * `decide()` saw the approval) and to hot-swap policy. Absent / unavailable →
   * the gate degrades truthfully to the durable {@link ApprovalRepository}.
   */
  readonly approvalStore?: ApprovalStorePort;
  /**
   * The adversarial multi-model CONSENSUS brain (pal). When wired + `available`,
   * a HIGH-RISK write the kernel is about to `allow` is put to a cross-model
   * adversarial review BEFORE the allow is finalized — a credible objection
   * downgrades it to `needs_approval`. Absent/unavailable ⇒ the kernel verdict
   * stands (this safety check NEVER blocks a run on its own fault). Injected late
   * via {@link GovernanceGateService.setConsensusReview} because the pal engine is
   * composed AFTER governance at bootstrap.
   */
  readonly consensus?: ConsensusReviewPort;
  readonly logger?: Logger;
}

export class GovernanceGateService implements GovernanceGate {
  private readonly kernel: GovernanceKernelPort;
  private readonly audit: AuditChainService;
  private readonly approvals?: ApprovalRepository;
  private readonly approvalStore?: ApprovalStorePort;
  private consensus?: ConsensusReviewPort;
  private readonly log?: Logger;

  constructor(deps: GovernanceGateDeps) {
    this.kernel = deps.kernel;
    this.audit = deps.audit;
    this.approvals = deps.approvals;
    this.approvalStore = deps.approvalStore;
    this.consensus = deps.consensus;
    this.log = deps.logger;
  }

  /**
   * Inject the adversarial multi-model consensus brain (pal). Called by the
   * composer AFTER the engines module is built (governance is composed first, so
   * the pal client is not available at construction). Idempotent last-writer-wins;
   * absent ⇒ the gate never runs a consensus review (kernel verdict is final).
   */
  setConsensusReview(consensus: ConsensusReviewPort): void {
    this.consensus = consensus;
  }

  async decide(action: GovernanceAction, principal: Principal, ctx: GateDecisionContext): Promise<GateVerdict> {
    const now = new Date().toISOString();
    const req = this.buildRequest(action, principal, ctx, now);

    // 1-2. Risk decision (ladder is fail-closed; never throws a policy outcome).
    const kernelVerdict = await this.kernel.decide(req);

    // 3. Approval clearance: a `needs_approval` verdict backed by a REAL
    //    `approved` record for this task+action is cleared to `allow` — the
    //    recorded human decision IS the authorization. The clearance is sealed
    //    into the audit chain below (step 4). Fail-closed everywhere else: the
    //    kernel's bare `approvalGateId` never clears, a lookup fault never clears.
    const clearedByApprovalId = await this.resolveApprovalClearance(action, kernelVerdict, ctx);
    const verdict: KernelVerdict = clearedByApprovalId
      ? {
          ...kernelVerdict,
          effect: 'allow',
          reason: `cleared by approval ${clearedByApprovalId} — ${kernelVerdict.reason}`,
        }
      : kernelVerdict;
    const approvalId = clearedByApprovalId ?? kernelVerdict.approvalGateId;

    // 3b. HIGH-RISK adversarial consensus (pal). Only when the kernel is about to
    //     grant a HIGH/critical `allow` that a human has NOT already cleared, put
    //     the write to a cross-model adversarial review BEFORE finalizing. A
    //     credible `block` downgrades the allow to `needs_approval` (sealed below
    //     as evidence); abstain / unavailable / timeout / throw all leave the
    //     kernel allow standing — this safety check NEVER blocks on its own fault
    //     and NEVER hangs the gate open (the facet bounds the call).
    const effective = await this.applyConsensusReview(action, principal, ctx, verdict, clearedByApprovalId);

    // 4. Seal into the durable Merkle chain. A failure to record an ALLOW fails
    //    closed (an un-audited allow cannot be trusted — including an allow that
    //    was cleared by an approval); a blocking verdict passes through with the
    //    audit failure logged.
    let auditHash: string | undefined;
    try {
      const record = await this.audit.append(
        this.toAuditEntry(action, principal, effective, ctx, clearedByApprovalId),
      );
      auditHash = record.entryHash;
    } catch (err) {
      this.log?.error({ err, action, actor: principal.userId }, 'governance audit seal failed');
      if (effective.effect === 'allow') {
        return this.failClosed(req, principal, action, now, 'Audit chain unavailable — refusing to allow an un-recorded write.');
      }
    }

    return {
      verdictId: `gov_verdict_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      requestId: req.requestId ?? `gov_req_${Date.now()}`,
      effect: effective.effect,
      tier: effective.tier,
      reason: effective.reason,
      degraded: effective.degraded,
      engine: effective.engine,
      auditHash: auditHash ?? effective.auditHash,
      approvalId,
      createdAt: now,
    };
  }

  /**
   * Apply the adversarial multi-model consensus review to a HIGH-RISK allow the
   * kernel is about to grant. Deny-biased + degrade-safe: consulted ONLY when the
   * verdict is an `allow` of tier `high`+ that a human has NOT already cleared and
   * the consensus brain is wired + `available`. An explicit `block` downgrades the
   * allow to `needs_approval` (never a silent deny); every other recommendation —
   * and any thrown fault across the seam — leaves the kernel allow standing. The
   * review is bounded inside the facet, so a slow/dead sidecar can only DELAY (by
   * the facet's timeout) a high-risk allow, never block it and never hang the gate.
   */
  private async applyConsensusReview(
    action: GovernanceAction,
    principal: Principal,
    ctx: GateDecisionContext,
    verdict: KernelVerdict,
    clearedByApprovalId: string | undefined,
  ): Promise<KernelVerdict> {
    if (
      verdict.effect !== 'allow' ||
      clearedByApprovalId ||
      !this.consensus?.available ||
      riskTierRank(verdict.tier) < riskTierRank('high')
    ) {
      return verdict;
    }
    try {
      const review = await this.consensus.review({
        action,
        riskTier: verdict.tier,
        actorId: principal.userId,
        taskId: ctx.taskId,
        runId: ctx.runId,
        target: ctx.target,
        kernelReason: verdict.reason,
        autonomous: ctx.autonomous ?? false,
      });
      if (review.recommendation === 'block') {
        return {
          ...verdict,
          effect: 'needs_approval',
          reason: `consensus block: ${review.reason} — ${verdict.reason}`,
        };
      }
    } catch (err) {
      this.log?.warn(
        { err, action, actor: principal.userId },
        'governance consensus review threw — kernel allow stands',
      );
    }
    return verdict;
  }

  /**
   * The PER-TOOL teeth: enforce a single tool invocation against the kernel's
   * fine-grained forbidden-path / secret-path / risk classifier BEFORE a running
   * agent's tool executes. Unlike {@link decide} (coarse workspace-op risk), this
   * is the check that catches the agent's real `rm -rf` / secret read / forbidden
   * write. Deny-biased and fail-closed:
   *   - the kernel port is deny-biased on fault, but if it still throws the
   *     enforcement is treated as a synthetic DENY (never a fabricated allow);
   *   - the outcome is SEALED into the same durable Merkle chain `decide` writes
   *     to. An `allowed` that cannot be sealed is downgraded to a synthetic deny
   *     (an un-audited allow cannot be trusted); a `denied` passes through even if
   *     the seal fails (it already blocks) with the failure logged.
   */
  async enforceTool(
    toolName: string,
    input: string,
    principal: Principal,
    ctx?: GateDecisionContext,
  ): Promise<ToolEnforcement> {
    const req = ctx
      ? this.buildRequest('tool.call', principal, ctx, new Date().toISOString())
      : { actorId: principal.userId, action: 'tool.call', target: { toolName } };

    let result: ToolEnforcement;
    try {
      result = await this.kernel.enforceTool(toolName, input, req);
    } catch (err) {
      // The port is deny-biased on fault; a thrown seam still fails CLOSED.
      this.log?.error({ err, toolName, actor: principal.userId }, 'governance enforceTool threw — failing closed (deny)');
      result = {
        outcome: 'denied',
        reason: 'Governance kernel fault during tool enforcement — failing closed (deny).',
        degraded: true,
        engine: 'synthetic',
      };
    }

    // Seal the enforcement decision into the durable audit chain.
    try {
      await this.audit.append(this.toToolAuditEntry(toolName, input, principal, result, ctx));
    } catch (sealErr) {
      this.log?.error({ err: sealErr, toolName, actor: principal.userId }, 'governance tool-enforcement audit seal failed');
      if (result.outcome === 'allowed') {
        // An un-recorded allow cannot be trusted — refuse it (fail-closed).
        return {
          outcome: 'denied',
          reason: 'Audit chain unavailable — refusing to allow an un-recorded tool call.',
          degraded: true,
          engine: 'synthetic',
        };
      }
      // A denied verdict already blocks; pass it through with the seal failure logged.
    }

    return result;
  }

  async route(action: GovernanceAction, principal: Principal, ctx: GateDecisionContext): Promise<RoutingHint> {
    return this.kernel.route(this.buildRequest(action, principal, ctx, new Date().toISOString()));
  }

  async recordAudit(entry: AuditEntryInput): Promise<AuditRecord> {
    return this.audit.append(entry);
  }

  async verifyAudit(): Promise<AuditVerification> {
    return this.audit.verify();
  }

  // --- internals -------------------------------------------------------------

  private buildRequest(
    action: GovernanceAction,
    principal: Principal,
    ctx: GateDecisionContext,
    now: string,
  ): KernelRequest {
    return {
      requestId: `gov_req_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      actorId: principal.userId,
      taskId: ctx.taskId,
      action,
      target: ctx.target,
      workLocks: ctx.workLocks,
      context: ctx,
      now,
    };
  }

  /**
   * Find the REAL `approved` record that clears a `needs_approval` verdict for
   * this task+action. Returns its id, or `undefined` when nothing clears —
   * fail-closed: no repo / no taskId / no matching approved record / a lookup
   * fault all leave the verdict blocking. The kernel's bare `approvalGateId`
   * NEVER clears anything (it is only an evidence pointer).
   */
  private async resolveApprovalClearance(
    action: GovernanceAction,
    verdict: KernelVerdict,
    ctx: GateDecisionContext,
  ): Promise<string | undefined> {
    if (verdict.effect !== 'needs_approval') return undefined;
    if (!ctx.taskId) return undefined;

    // PRIMARY: the Rust kernel's own ApprovalManager store — the SAME kernel that
    // ran `decide()` saw the approval, so its grant is the authoritative clearance.
    if (this.approvalStore?.available) {
      try {
        const granted = await this.approvalStore.findApproval(ctx.taskId, action);
        if (granted) return granted.requestId;
      } catch (err) {
        this.log?.warn(
          { err, action, taskId: ctx.taskId },
          'governance kernel approval store lookup failed — falling back to the durable repo',
        );
      }
    }

    // FALLBACK (degrade-truthful): the durable Postgres approval repository (the
    // "shadow store"). Used when the native kernel store is absent/unavailable.
    if (!this.approvals) return undefined;
    try {
      const approved = await this.approvals.hasApproval(ctx.taskId, action);
      if (!approved) return undefined;
      const records = await this.approvals.list({ taskId: ctx.taskId, status: 'approved' });
      // Only a record for the SAME action clears; without its id there is no
      // auditable evidence, so the verdict stays blocking.
      return records.find((r) => r.action === action)?.id;
    } catch (err) {
      this.log?.warn(
        { err, action, taskId: ctx.taskId },
        'governance approval lookup failed — leaving needs_approval in place',
      );
      return undefined;
    }
  }

  // --- kernel-backed approval store passthrough (submit/resolve/list/count) ----
  // These drive the Rust kernel's own ApprovalManager. Degrade-truthful: when the
  // native store is absent every op returns a truthful "unavailable" result — the
  // gate never fabricates an approval.

  /** Submit an approval request into the kernel's own approval gate. */
  async submitApproval(input: ApprovalSubmitInput): Promise<ApprovalSubmitResult> {
    if (!this.approvalStore) {
      return { outcome: 'denied', requestId: input.id, stored: false, reason: 'kernel approval store not wired' };
    }
    return this.approvalStore.submit(input);
  }

  /** Resolve a pending approval on the kernel gate with a human decision. */
  async resolveApproval(
    requestId: string,
    decision: 'approved' | 'denied',
    decidedBy: string,
  ): Promise<ApprovalResolveResult> {
    if (!this.approvalStore) {
      return { requestId, decision, stored: false, reason: 'kernel approval store not wired' };
    }
    return this.approvalStore.resolve(requestId, decision, decidedBy);
  }

  /** The kernel's currently pending approval requests (empty when unavailable). */
  async listPendingApprovals(): Promise<readonly PendingApproval[]> {
    if (!this.approvalStore) return [];
    return this.approvalStore.listPending();
  }

  /** Count of pending approvals on the kernel gate (0 when unavailable). */
  async pendingApprovalCount(): Promise<number> {
    if (!this.approvalStore) return 0;
    return this.approvalStore.count();
  }

  /**
   * Hot-swap the kernel's live policy bundle. Invoked from the agent-os
   * policy-update hook so an edited forbidden/secret-path or approval policy takes
   * effect for subsequent `decide()`/`enforceTool` calls without a restart. The
   * kernel is fail-closed: a rejected config leaves the OLD policy live.
   * Degrade-truthful: no native store → `{ reloaded:false }` (policy is static).
   */
  async reloadPolicies(configJson: string): Promise<ReloadPoliciesResult> {
    if (!this.approvalStore) {
      return { reloaded: false, reason: 'kernel approval store not wired (policy is static)' };
    }
    return this.approvalStore.reloadPolicies(configJson);
  }

  private toAuditEntry(
    action: GovernanceAction,
    principal: Principal,
    verdict: KernelVerdict,
    ctx: GateDecisionContext,
    clearedByApprovalId?: string,
  ): AuditEntryInput {
    return {
      actorId: principal.userId,
      action,
      resource: resourceOf(ctx),
      effect: verdict.effect,
      riskTier: verdict.tier,
      degraded: verdict.degraded,
      payload: {
        engine: verdict.engine,
        reason: verdict.reason,
        principalKind: principal.kind,
        taskId: ctx.taskId,
        runId: ctx.runId,
        target: ctx.target,
        autonomous: ctx.autonomous ?? false,
        // Evidence that a needs_approval verdict was cleared by a human decision.
        ...(clearedByApprovalId ? { clearedByApprovalId } : {}),
        // Sanitized metadata only — never secret values.
        metadata: ctx.metadata ?? {},
      },
    };
  }

  /**
   * Build the audit row for a per-tool enforcement decision. Secret-free: the
   * tool NAME is recorded (never the raw input, which may embed a secret value).
   */
  private toToolAuditEntry(
    toolName: string,
    input: string,
    principal: Principal,
    result: ToolEnforcement,
    ctx?: GateDecisionContext,
  ): AuditEntryInput {
    return {
      actorId: principal.userId,
      action: 'tool.call',
      resource: toolName,
      effect: result.outcome === 'allowed' ? 'allow' : 'deny',
      // Enforcement is a hard allow/deny gate; a block is treated as high-risk.
      riskTier: result.outcome === 'allowed' ? 'low' : 'high',
      degraded: result.degraded,
      payload: {
        engine: result.engine,
        reason: result.reason,
        toolName,
        principalKind: principal.kind,
        taskId: ctx?.taskId,
        runId: ctx?.runId,
        // Length only — NEVER the raw tool input (it may carry a secret value).
        inputLength: input.length,
      },
    };
  }

  /** Build a fail-closed synthetic deny (never a fake allow). */
  private failClosed(
    req: KernelRequest,
    _principal: Principal,
    _action: GovernanceAction,
    now: string,
    reason: string,
  ): GateVerdict {
    return {
      verdictId: `gov_verdict_failclosed_${Date.now()}`,
      requestId: req.requestId ?? `gov_req_${Date.now()}`,
      effect: 'deny',
      tier: 'critical',
      reason,
      degraded: true,
      engine: 'synthetic',
      createdAt: now,
    };
  }
}

/** Project the decision context onto a single resource string for the audit row. */
function resourceOf(ctx: GateDecisionContext): string {
  return ctx.target.path ?? ctx.target.command ?? ctx.target.toolName ?? ctx.target.environment ?? '(none)';
}
