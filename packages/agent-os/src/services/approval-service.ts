import type { Approval, ApprovalStatus, PolicyDecision } from '../domain';
import { decideApproval } from '../domain';

export type RequestApprovalInput = {
  approvalId?: string;
  taskId: string;
  runId?: string;
  reason: string;
  requestedBy: string;
  requestedAt?: string;
  requiredAt?: Approval['requiredAt'];
  target?: Approval['target'];
  metadata?: Record<string, unknown>;
};

export type RequestApprovalFromPolicyDecisionInput = {
  decision: PolicyDecision;
  runId?: string;
  requestedBy?: string;
  requiredAt?: Approval['requiredAt'];
  target?: Approval['target'];
  metadata?: Record<string, unknown>;
};

export class ApprovalService {
  request(input: RequestApprovalInput): Approval {
    return {
      approvalId: input.approvalId ?? `approval_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      taskId: input.taskId,
      runId: input.runId,
      status: 'pending',
      reason: input.reason,
      requestedBy: input.requestedBy,
      requestedAt: input.requestedAt ?? new Date().toISOString(),
      requiredAt: input.requiredAt ?? 'before_sensitive_action',
      target: input.target,
      metadata: input.metadata,
    };
  }

  requestFromPolicyDecision(input: RequestApprovalFromPolicyDecisionInput): Approval | undefined {
    const { decision } = input;
    if (decision.effect !== 'needs_approval' || !decision.taskId) {
      return undefined;
    }

    return this.request({
      approvalId: decision.approval?.gateId,
      taskId: decision.taskId,
      runId: input.runId,
      reason: decision.approval?.reason ?? decision.reason,
      requestedBy: input.requestedBy ?? decision.actorAgentId,
      requiredAt: input.requiredAt,
      target: input.target,
      metadata: {
        ...(input.metadata ?? {}),
        policyDecisionId: decision.decisionId,
        policyAction: decision.action,
        policyFindings: decision.findings,
        policyMetadata: decision.metadata,
      },
    });
  }

  decide(approval: Approval, status: Extract<ApprovalStatus, 'approved' | 'rejected'>, decidedBy: string, reason?: string): Approval {
    return decideApproval(approval, status, { decidedBy, decisionReason: reason });
  }
}
