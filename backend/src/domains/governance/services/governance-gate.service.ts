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
 *   - For `needs_approval`, an existing matching `approved` record is attached as
 *     `approvalId` (evidence the caller may use to proceed); the gate itself does
 *     not silently flip the effect.
 */
import type { Logger } from '../../../shared/logger.js';
import type { Principal } from '../../identity/types.js';
import type { GovernanceGate } from '../ports/gate.port.js';
import type { GovernanceKernelPort } from '../ports/kernel.port.js';
import type { ApprovalRepository } from '../ports/approval-repo.port.js';
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
} from '../types.js';

export interface GovernanceGateDeps {
  readonly kernel: GovernanceKernelPort;
  readonly audit: AuditChainService;
  readonly approvals?: ApprovalRepository;
  readonly logger?: Logger;
}

export class GovernanceGateService implements GovernanceGate {
  private readonly kernel: GovernanceKernelPort;
  private readonly audit: AuditChainService;
  private readonly approvals?: ApprovalRepository;
  private readonly log?: Logger;

  constructor(deps: GovernanceGateDeps) {
    this.kernel = deps.kernel;
    this.audit = deps.audit;
    this.approvals = deps.approvals;
    this.log = deps.logger;
  }

  async decide(action: GovernanceAction, principal: Principal, ctx: GateDecisionContext): Promise<GateVerdict> {
    const now = new Date().toISOString();
    const req = this.buildRequest(action, principal, ctx, now);

    // 1-2. Risk decision (ladder is fail-closed; never throws a policy outcome).
    const verdict = await this.kernel.decide(req);

    // 3. Attach an existing approval record (evidence) for a needs_approval gate.
    const approvalId = await this.resolveApprovalId(action, verdict, ctx);

    // 4. Seal into the durable Merkle chain. A failure to record an ALLOW fails
    //    closed (an un-audited allow cannot be trusted); a blocking verdict passes
    //    through with the audit failure logged.
    let auditHash: string | undefined;
    try {
      const record = await this.audit.append(this.toAuditEntry(action, principal, verdict, ctx));
      auditHash = record.entryHash;
    } catch (err) {
      this.log?.error({ err, action, actor: principal.userId }, 'governance audit seal failed');
      if (verdict.effect === 'allow') {
        return this.failClosed(req, principal, action, now, 'Audit chain unavailable — refusing to allow an un-recorded write.');
      }
    }

    return {
      verdictId: `gov_verdict_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      requestId: req.requestId ?? `gov_req_${Date.now()}`,
      effect: verdict.effect,
      tier: verdict.tier,
      reason: verdict.reason,
      degraded: verdict.degraded,
      engine: verdict.engine,
      auditHash: auditHash ?? verdict.auditHash,
      approvalId,
      createdAt: now,
    };
  }

  async enforceTool(
    toolName: string,
    input: string,
    principal: Principal,
    ctx?: GateDecisionContext,
  ): Promise<ToolEnforcement> {
    const req = ctx
      ? this.buildRequest('tool.call', principal, ctx, new Date().toISOString())
      : { actorId: principal.userId, action: 'tool.call', target: { toolName } };
    return this.kernel.enforceTool(toolName, input, req);
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

  /** Look up an existing `approved` record that would clear a needs_approval gate. */
  private async resolveApprovalId(
    action: GovernanceAction,
    verdict: KernelVerdict,
    ctx: GateDecisionContext,
  ): Promise<string | undefined> {
    if (verdict.effect !== 'needs_approval') return verdict.approvalGateId;
    if (!this.approvals || !ctx.taskId) return verdict.approvalGateId;
    try {
      const approved = await this.approvals.hasApproval(ctx.taskId, action);
      if (!approved) return verdict.approvalGateId;
      const list = await this.approvals.list({ taskId: ctx.taskId, status: 'approved', limit: 1 });
      return list[0]?.id ?? verdict.approvalGateId;
    } catch (err) {
      this.log?.warn({ err, action, taskId: ctx.taskId }, 'governance approval lookup failed');
      return verdict.approvalGateId;
    }
  }

  private toAuditEntry(
    action: GovernanceAction,
    principal: Principal,
    verdict: KernelVerdict,
    ctx: GateDecisionContext,
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
        // Sanitized metadata only — never secret values.
        metadata: ctx.metadata ?? {},
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
