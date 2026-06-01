/**
 * @module approval-lifecycle-wiring
 *
 * Wires approval-gate resolutions into the task lifecycle so that PM approval
 * decisions become first-class lifecycle transitions rather than downstream
 * annotations.
 *
 * When an approval that is linked to a task (via its `details` bag) is
 * resolved, the linked task is driven accordingly:
 *
 *   granted  -> resume the task (input-required -> working)
 *   rejected -> terminate the task (-> cancelled, recorded as a PM reject)
 *   expired  -> terminate the task (-> cancelled, recorded as a PM reject)
 *
 * The wiring is decoupled: the approval-gate service exposes an
 * {@link import('./approval-gate.service').ApprovalDecisionSink} registration
 * hook, and this module registers a sink that calls the task-lifecycle
 * service. This avoids an import cycle between the two services while keeping
 * the integration explicit and idempotent.
 */

import { createLogger } from '../logger';
import {
  getApprovalGateService,
  extractApprovalTaskId,
  type ApprovalGateService,
} from './approval-gate.service';
import {
  getTaskLifecycleService,
  type TaskLifecycleService,
} from './task-lifecycle.service';

const logger = createLogger('a2a-approval-lifecycle-wiring');

let _wired = false;

export interface WireApprovalLifecycleDeps {
  approvalGate?: ApprovalGateService;
  taskLifecycle?: TaskLifecycleService;
}

/**
 * Register a decision sink that drives the task lifecycle from approval-gate
 * resolutions. Idempotent: safe to call multiple times (subsequent calls are
 * no-ops unless {@link resetApprovalLifecycleWiring} is called first).
 */
export function wireApprovalToTaskLifecycle(deps: WireApprovalLifecycleDeps = {}): void {
  if (_wired) return;
  _wired = true;

  const approvalGate = deps.approvalGate ?? getApprovalGateService();
  const taskLifecycle = deps.taskLifecycle ?? getTaskLifecycleService();

  approvalGate.onDecision((approval, decision) => {
    const taskId = extractApprovalTaskId(approval);
    if (!taskId) {
      // Approval not linked to a task — nothing to drive.
      return;
    }

    const triggeredBy = approval.resolvedBy ?? approval.requestingAgentId;
    const result = taskLifecycle.resolveApprovalDecision(taskId, decision, {
      triggeredBy,
      approvalId: approval.approvalId,
      reason:
        decision === 'granted'
          ? `Approval ${approval.approvalId} granted`
          : decision === 'expired'
            ? `Approval ${approval.approvalId} expired`
            : `Approval ${approval.approvalId} rejected`,
    });

    if (!result.ok) {
      logger.warn(
        { taskId, approvalId: approval.approvalId, decision, error: result.error.code },
        'failed to drive task lifecycle from approval decision',
      );
      return;
    }

    logger.info(
      { taskId, approvalId: approval.approvalId, decision, state: result.data.state },
      'approval decision drove task lifecycle',
    );
  });

  logger.info('approval-gate decisions wired to task lifecycle');
}

/** Reset the wiring guard (for tests). */
export function resetApprovalLifecycleWiring(): void {
  _wired = false;
}
