import type { RuntimeDriver, ApprovalDecision } from '../contracts/runtime-driver';
import type { ApprovalPause } from '../policy/approval-pause';

/**
 * Forward an approval decision to a paused, awaiting run. Resolves the engine's
 * `ApprovalPause` and, if the driver implements native approval (codex/acp/pi), forwards
 * the decision to it as well.
 */
export async function forwardApproval(
  approvalId: string,
  decision: ApprovalDecision,
  deps: { pause: ApprovalPause; driver: RuntimeDriver },
): Promise<void> {
  const resolved = deps.pause.resolve(approvalId, decision);
  await deps.driver.approve?.(approvalId, decision);
  if (!resolved && !deps.driver.approve) {
    // No pending pause and no native handler: surface truthfully rather than silently no-op.
    throw new Error(`No pending approval "${approvalId}" to resolve.`);
  }
}
