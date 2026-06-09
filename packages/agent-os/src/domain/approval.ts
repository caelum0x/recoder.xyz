export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'escalated';

export type Approval = {
  approvalId: string;
  taskId: string;
  runId?: string;
  status: ApprovalStatus;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  requiredAt:
    | 'before_execution'
    | 'before_write'
    | 'before_push'
    | 'before_pr'
    | 'before_sensitive_action'
    | 'after_verification'
    | 'custom';
  target?: {
    path?: string;
    command?: string;
    toolName?: string;
  };
  decidedBy?: string;
  decidedAt?: string;
  decisionReason?: string;
  metadata?: Record<string, unknown>;
};

export function decideApproval(
  approval: Approval,
  decision: 'approved' | 'rejected',
  input: { decidedBy: string; decidedAt?: string; decisionReason?: string },
): Approval {
  if (approval.status !== 'pending' && approval.status !== 'escalated') {
    throw new Error(`Approval is not pending: ${approval.approvalId}`);
  }
  return {
    ...approval,
    status: decision,
    decidedBy: input.decidedBy,
    decidedAt: input.decidedAt ?? new Date().toISOString(),
    decisionReason: input.decisionReason,
  };
}
