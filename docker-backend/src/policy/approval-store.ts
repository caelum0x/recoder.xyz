/**
 * @module policy/approval-store
 *
 * In-memory approval store for the A2A policy plane.
 *
 * Manages the lifecycle of approval records: creation, querying,
 * revocation, and expiry checks. Designed to be swapped for a
 * Redis-backed or database-backed implementation in production
 * without changing the interface.
 *
 * All mutation operations return the updated approval record and
 * are synchronous for the in-memory implementation.
 */

import { v4 as uuid } from 'uuid';
import { createLogger } from '../logger.js';
import type {
  Approval,
  ApprovalStatus,
  CreateApprovalInput,
  PrivilegedActionType,
} from './types.js';
import { ApprovalStatusEnum } from './types.js';

const logger = createLogger('policy:approval-store');

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/** In-memory store keyed by approval ID. */
const approvalById = new Map<string, Approval>();

/** Secondary index: taskId -> Set<approvalId> for fast task-scoped lookups. */
const approvalsByTask = new Map<string, Set<string>>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether an approval is effectively active (not revoked, not expired).
 */
function isEffectivelyActive(approval: Approval): boolean {
  if (approval.status === ApprovalStatusEnum.Revoked) return false;
  if (approval.expires_at && new Date(approval.expires_at).getTime() <= Date.now()) {
    return false;
  }
  return approval.status === ApprovalStatusEnum.Active;
}

/**
 * Materialise the effective status (handles lazy expiry detection).
 */
function effectiveStatus(approval: Approval): ApprovalStatus {
  if (approval.status === ApprovalStatusEnum.Revoked) return ApprovalStatusEnum.Revoked;
  if (approval.expires_at && new Date(approval.expires_at).getTime() <= Date.now()) {
    return ApprovalStatusEnum.Expired;
  }
  return approval.status;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new approval record.
 *
 * @param input - The approval creation input.
 * @returns The newly created Approval.
 */
export function createApproval(input: CreateApprovalInput): Approval {
  const id = `apv_${uuid().replace(/-/g, '').slice(0, 16)}`;
  const now = new Date().toISOString();

  const expiresAt = input.ttl_ms
    ? new Date(Date.now() + input.ttl_ms).toISOString()
    : null;

  const approval: Approval = {
    id,
    task_id: input.task_id,
    action: input.action,
    resource: input.resource,
    status: ApprovalStatusEnum.Active,
    granted_by: input.granted_by,
    granted_at: now,
    expires_at: expiresAt,
    revoked_at: null,
    revoked_by: null,
    reason: input.reason,
    workspace_id: input.workspace_id,
    trace_id: input.trace_id,
    metadata: input.metadata,
  };

  approvalById.set(id, approval);

  // Update task index
  if (!approvalsByTask.has(input.task_id)) {
    approvalsByTask.set(input.task_id, new Set());
  }
  approvalsByTask.get(input.task_id)!.add(id);

  logger.info(
    { approvalId: id, taskId: input.task_id, action: input.action },
    'approval created',
  );

  return approval;
}

/**
 * Get an approval by its ID.
 *
 * @param approvalId - The approval ID to look up.
 * @returns The approval, or null if not found.
 */
export function getApproval(approvalId: string): Approval | null {
  const approval = approvalById.get(approvalId);
  if (!approval) return null;

  // Materialise lazy expiry
  const status = effectiveStatus(approval);
  if (status !== approval.status) {
    approval.status = status;
  }

  return approval;
}

/**
 * Get all approvals for a given task.
 *
 * @param taskId - The task ID to query.
 * @returns Array of approvals for the task.
 */
export function getApprovalsByTask(taskId: string): Approval[] {
  const ids = approvalsByTask.get(taskId);
  if (!ids || ids.size === 0) return [];

  const results: Approval[] = [];
  for (const id of ids) {
    const approval = getApproval(id);
    if (approval) results.push(approval);
  }

  return results;
}

/**
 * Find an active approval for a specific task + action + resource combination.
 *
 * This is the primary lookup used by the policy engine to determine
 * whether an action has been pre-approved.
 *
 * @param taskId - The task ID.
 * @param action - The privileged action type.
 * @param resource - The specific resource (exact match or wildcard '*').
 * @returns The active approval, or null if none found.
 */
export function findActiveApproval(
  taskId: string,
  action: PrivilegedActionType,
  resource: string,
): Approval | null {
  const ids = approvalsByTask.get(taskId);
  if (!ids || ids.size === 0) return null;

  for (const id of ids) {
    const approval = getApproval(id);
    if (!approval) continue;

    if (
      isEffectivelyActive(approval) &&
      approval.action === action &&
      (approval.resource === resource || approval.resource === '*')
    ) {
      return approval;
    }
  }

  return null;
}

/**
 * Revoke an approval.
 *
 * @param approvalId - The approval ID to revoke.
 * @param revokedBy - Who is revoking the approval.
 * @returns The updated approval, or null if not found.
 */
export function revokeApproval(
  approvalId: string,
  revokedBy: string,
): Approval | null {
  const approval = approvalById.get(approvalId);
  if (!approval) return null;

  approval.status = ApprovalStatusEnum.Revoked;
  approval.revoked_at = new Date().toISOString();
  approval.revoked_by = revokedBy;

  logger.info(
    { approvalId, taskId: approval.task_id, revokedBy },
    'approval revoked',
  );

  return approval;
}

/**
 * Revoke all active approvals for a task.
 *
 * @param taskId - The task whose approvals should be revoked.
 * @param revokedBy - Who is revoking the approvals.
 * @returns The number of approvals revoked.
 */
export function revokeAllTaskApprovals(
  taskId: string,
  revokedBy: string,
): number {
  const ids = approvalsByTask.get(taskId);
  if (!ids || ids.size === 0) return 0;

  let count = 0;
  for (const id of ids) {
    const approval = approvalById.get(id);
    if (approval && isEffectivelyActive(approval)) {
      approval.status = ApprovalStatusEnum.Revoked;
      approval.revoked_at = new Date().toISOString();
      approval.revoked_by = revokedBy;
      count++;
    }
  }

  if (count > 0) {
    logger.info({ taskId, revokedBy, count }, 'all task approvals revoked');
  }

  return count;
}

/**
 * Get store statistics for monitoring/diagnostics.
 */
export function getApprovalStoreStats(): {
  total: number;
  active: number;
  revoked: number;
  expired: number;
  taskCount: number;
} {
  let active = 0;
  let revoked = 0;
  let expired = 0;

  for (const approval of approvalById.values()) {
    const status = effectiveStatus(approval);
    switch (status) {
      case ApprovalStatusEnum.Active:
        active++;
        break;
      case ApprovalStatusEnum.Revoked:
        revoked++;
        break;
      case ApprovalStatusEnum.Expired:
        expired++;
        break;
    }
  }

  return {
    total: approvalById.size,
    active,
    revoked,
    expired,
    taskCount: approvalsByTask.size,
  };
}

/**
 * Clear all approvals (for testing only).
 */
export function clearAllApprovals(): void {
  approvalById.clear();
  approvalsByTask.clear();
}
