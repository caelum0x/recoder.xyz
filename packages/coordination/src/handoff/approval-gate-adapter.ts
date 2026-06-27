/**
 * approval-gate-adapter — route gated handoffs through approval.
 *
 * MERGED from the approval-required branch of
 * `docker-backend/src/a2a/autonomous-routing.service.ts` (`processHandoff`):
 * when the workspace/space required approval, the source opened an approval,
 * marked the handoff `awaiting-approval`, registered an `onResolved` callback,
 * and only continued the delegation when the approval was `granted`.
 *
 * Here that flow is decoupled from the backend singleton and the
 * `getApprovalGateService()`/`getTaskLifecycleService()` globals: the gate is the
 * `ApprovalGatePort`, the gating decision is PURE, and the await/continue logic
 * is a thin impure shell over the port. No callbacks/EventEmitter — the caller
 * awaits the resolution and branches on the returned decision.
 */

import type { ApprovalGatePort, ApprovalRecord, ApprovalRequest } from '../ports/approval-gate';
import type { Handoff } from '../domain';

/** Whether a handoff requires approval before it may proceed (PURE). */
export function handoffRequiresApproval(
  handoff: Handoff,
  spaceApprovalRequired: boolean,
): boolean {
  // A space that requires approval gates every delegation/handoff/merge.
  // (`review` is read-only in spirit but the source gated all intents equally.)
  return spaceApprovalRequired;
}

/** Build the approval request for a gated handoff (PURE, mirrors source `details`). */
export function buildApprovalRequest(handoff: Handoff): ApprovalRequest {
  return {
    spaceId: handoff.spaceId ?? '',
    ...(handoff.sourceTaskId ? { taskId: handoff.sourceTaskId } : {}),
    requestedByAgentId: handoff.fromAgentId,
    action: handoff.intent,
    summary: `${handoff.fromAgentId} wants to ${handoff.intent} to @${handoff.toAgentId}`,
    context: {
      prompt: handoff.prompt,
      targetAgentId: handoff.toAgentId,
      handoffId: handoff.handoffId,
      ...(handoff.channelId ? { channelId: handoff.channelId } : {}),
    },
  };
}

export type ApprovalDecision =
  | { readonly outcome: 'granted'; readonly record: ApprovalRecord }
  | { readonly outcome: 'rejected'; readonly record: ApprovalRecord }
  | { readonly outcome: 'not-required' };

/**
 * IMPURE SHELL: open an approval (if required) and await its resolution,
 * returning a decision the caller branches on. Mirrors the source: open →
 * onResolved(granted ⇒ continue). A non-granted resolution stops the handoff.
 */
export async function gateHandoff(
  gate: ApprovalGatePort,
  handoff: Handoff,
  spaceApprovalRequired: boolean,
): Promise<ApprovalDecision> {
  if (!handoffRequiresApproval(handoff, spaceApprovalRequired)) {
    return { outcome: 'not-required' };
  }

  const opened = await gate.open(buildApprovalRequest(handoff));
  const resolved = await gate.await(opened.approvalId);

  return resolved.status === 'granted'
    ? { outcome: 'granted', record: resolved }
    : { outcome: 'rejected', record: resolved };
}
