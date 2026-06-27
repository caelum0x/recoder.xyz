/**
 * ApprovalGatePort — open + await approval for gated handoffs. MERGED from the
 * A2A approval-gate.service open/await/on-resolved flow, decoupled from the
 * backend singleton. A gated handoff opens an approval and continues only when
 * resolved (granted), otherwise stops.
 */

export type ApprovalStatus = 'pending' | 'granted' | 'rejected';

export type ApprovalRequest = {
  spaceId: string;
  taskId?: string;
  requestedByAgentId: string;
  action: string;
  summary: string;
  context?: Record<string, unknown>;
};

export type ApprovalRecord = {
  approvalId: string;
  status: ApprovalStatus;
  openedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
};

export interface ApprovalGatePort {
  open(request: ApprovalRequest): Promise<ApprovalRecord>;
  /** Resolves when the approval reaches a terminal status. */
  await(approvalId: string): Promise<ApprovalRecord>;
  get(approvalId: string): Promise<ApprovalRecord | undefined>;
}
