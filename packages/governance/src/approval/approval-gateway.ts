import type { Approval } from '@recoder/agent-os';
import { ApprovalService, decideApproval } from '@recoder/agent-os';
import type { RiskTier } from '../domain/risk-tier';
import { ApprovalNotFoundError, ApprovalAlreadyResolvedError } from '../errors';

/**
 * approval-gateway — the runtime blocking mechanism around agent-os approvals.
 * Canonical approval STATE lives in agent-os `Approval`/`ApprovalService`; this
 * gateway is the in-process "await a human decision" primitive that the
 * blueprint mirrors from the Rust ApprovalManager's oneshot-channel gate.
 *
 * It is fail-closed: if the timeout elapses with no decision, the pending
 * approval resolves to `rejected` (a deny), never `approved`.
 */

export type ApprovalDecisionResult = {
  readonly approval: Approval;
  readonly decision: 'approved' | 'rejected';
  /** True when the rejection came from a timeout rather than a human. */
  readonly timedOut: boolean;
};

type Pending = {
  approval: Approval;
  tier: RiskTier;
  resolve: (result: ApprovalDecisionResult) => void;
  timer?: ReturnType<typeof setTimeout>;
};

export class ApprovalGateway {
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly service: ApprovalService = new ApprovalService()) {}

  /**
   * Create a pending approval and return a promise that resolves when a human
   * (or the timeout) decides it. `timeoutMs <= 0` means no timeout (wait
   * indefinitely) — used for tiers configured without a timeout.
   */
  request(input: {
    taskId: string;
    runId?: string;
    reason: string;
    requestedBy: string;
    tier: RiskTier;
    requiredAt?: Approval['requiredAt'];
    target?: Approval['target'];
    timeoutMs: number;
    metadata?: Record<string, unknown>;
  }): { approval: Approval; awaited: Promise<ApprovalDecisionResult> } {
    const approval = this.service.request({
      taskId: input.taskId,
      runId: input.runId,
      reason: input.reason,
      requestedBy: input.requestedBy,
      requiredAt: input.requiredAt,
      target: input.target,
      metadata: { ...(input.metadata ?? {}), riskTier: input.tier },
    });

    const awaited = new Promise<ApprovalDecisionResult>((resolve) => {
      const entry: Pending = { approval, tier: input.tier, resolve };
      if (input.timeoutMs > 0) {
        entry.timer = setTimeout(() => {
          this.failClosed(approval.approvalId);
        }, input.timeoutMs);
        // Do not keep the event loop alive solely for an approval timer.
        if (typeof entry.timer.unref === 'function') entry.timer.unref();
      }
      this.pending.set(approval.approvalId, entry);
    });

    return { approval, awaited };
  }

  /** Resolve a pending approval with a human decision. */
  resolve(
    approvalId: string,
    decision: 'approved' | 'rejected',
    decidedBy: string,
    reason?: string,
  ): ApprovalDecisionResult {
    const entry = this.pending.get(approvalId);
    if (!entry) {
      throw new ApprovalNotFoundError(`No pending approval ${approvalId}`, { approvalId });
    }
    if (entry.approval.status !== 'pending' && entry.approval.status !== 'escalated') {
      throw new ApprovalAlreadyResolvedError(`Approval ${approvalId} already resolved`, {
        approvalId,
        status: entry.approval.status,
      });
    }

    const decided = decideApproval(entry.approval, decision, { decidedBy, decisionReason: reason });
    this.clear(approvalId);
    const result: ApprovalDecisionResult = { approval: decided, decision, timedOut: false };
    entry.resolve(result);
    return result;
  }

  /** Timeout path: resolve to rejected (deny). */
  private failClosed(approvalId: string): void {
    const entry = this.pending.get(approvalId);
    if (!entry) return;
    const decided = decideApproval(entry.approval, 'rejected', {
      decidedBy: 'system:governance',
      decisionReason: 'Approval timed out without a human decision (fail-closed deny).',
    });
    this.clear(approvalId);
    entry.resolve({ approval: decided, decision: 'rejected', timedOut: true });
  }

  /** Number of currently pending approvals. */
  pendingCount(): number {
    return this.pending.size;
  }

  isPending(approvalId: string): boolean {
    return this.pending.has(approvalId);
  }

  private clear(approvalId: string): void {
    const entry = this.pending.get(approvalId);
    if (entry?.timer) clearTimeout(entry.timer);
    this.pending.delete(approvalId);
  }
}
