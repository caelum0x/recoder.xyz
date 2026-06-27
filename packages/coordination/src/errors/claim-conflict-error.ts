/**
 * ClaimConflictError — a task is already claimed by another agent. The crucial
 * anti-duplicate-work error: the loser of a claim race gets this. Carries the
 * holder so the caller can surface "already being worked by X".
 */

import { CoordinationError } from './coordination-error';
import { CoordinationErrorCode } from './error-codes';

export class ClaimConflictError extends CoordinationError {
  readonly taskId: string;
  readonly heldByAgentId: string;
  readonly existingClaimId: string;

  constructor(taskId: string, heldByAgentId: string, existingClaimId: string) {
    super(
      CoordinationErrorCode.CLAIM_CONFLICT,
      `Task ${taskId} is already claimed by ${heldByAgentId}.`,
      { taskId, heldByAgentId, existingClaimId },
    );
    this.name = 'ClaimConflictError';
    this.taskId = taskId;
    this.heldByAgentId = heldByAgentId;
    this.existingClaimId = existingClaimId;
  }
}

/**
 * ClaimLostError — a claim was held and then lost (e.g. the recovery window
 * expired and another agent reclaimed). Distinct from a conflict at acquire.
 */
export class ClaimLostError extends CoordinationError {
  readonly taskId: string;
  readonly claimId: string;

  constructor(taskId: string, claimId: string) {
    super(CoordinationErrorCode.CLAIM_LOST, `Claim ${claimId} on task ${taskId} was lost.`, {
      taskId,
      claimId,
    });
    this.name = 'ClaimLostError';
    this.taskId = taskId;
    this.claimId = claimId;
  }
}
