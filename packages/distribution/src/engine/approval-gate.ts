import type { DeliveryRequest } from '../domain/delivery';
import { requiresApproval } from '../domain/channel';
import type { ApprovalPort } from '../ports/approval-port';

export type ApprovalGateDecision =
  | { readonly outcome: 'approved'; readonly approvalRef: string }
  | { readonly outcome: 'not_required' }
  | { readonly outcome: 'pending'; readonly approvalRef: string; readonly reason: string }
  | { readonly outcome: 'rejected'; readonly approvalRef: string; readonly reason: string };

/**
 * The hard production rule. For a customer-visible channel, the delivery only
 * proceeds when a recorded `Approval{status:'approved'}` exists. Distribution
 * NEVER opens its own gate:
 *  - no approvalRef on the request  → request one (pending) and PAUSE;
 *  - approvalRef exists but pending  → PAUSE;
 *  - approvalRef approved            → proceed;
 *  - approvalRef rejected/expired    → fail.
 */
export async function approvalGate(
  approvals: ApprovalPort,
  req: DeliveryRequest,
): Promise<ApprovalGateDecision> {
  if (!requiresApproval(req.channel)) {
    return { outcome: 'not_required' };
  }

  // No approval referenced yet → request one and pause. Cannot self-approve.
  if (!req.approvalRef) {
    const approval = await approvals.requestApproval({
      taskId: req.taskId,
      reason: `customer-visible delivery to channel '${req.channel}'`,
      requestedBy: req.actor.subjectId,
      target: { command: `publish:${req.channel}` },
    });
    return {
      outcome: 'pending',
      approvalRef: approval.approvalId,
      reason: 'approval requested; awaiting governance decision',
    };
  }

  const approval = await approvals.getApproval(req.approvalRef);
  if (!approval) {
    // A referenced-but-missing approval is fail-closed, not assumed-approved.
    const requested = await approvals.requestApproval({
      taskId: req.taskId,
      reason: `customer-visible delivery to channel '${req.channel}' (referenced approval not found)`,
      requestedBy: req.actor.subjectId,
    });
    return {
      outcome: 'pending',
      approvalRef: requested.approvalId,
      reason: 'referenced approval not found; re-requested',
    };
  }

  switch (approval.status) {
    case 'approved':
      return { outcome: 'approved', approvalRef: approval.approvalId };
    case 'rejected':
    case 'expired':
      return {
        outcome: 'rejected',
        approvalRef: approval.approvalId,
        reason: `approval ${approval.status}`,
      };
    default:
      return {
        outcome: 'pending',
        approvalRef: approval.approvalId,
        reason: `approval ${approval.status}`,
      };
  }
}
