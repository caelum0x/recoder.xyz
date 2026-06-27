/**
 * CoordinationErrorCode — the typed error vocabulary (design §9). Every error
 * carries one of these so callers/UI can branch without string matching.
 */

export enum CoordinationErrorCode {
  LOCK_CONFLICT = 'LOCK_CONFLICT',
  CLAIM_CONFLICT = 'CLAIM_CONFLICT',
  CLAIM_LOST = 'CLAIM_LOST',
  DEPENDENCY_BLOCKED = 'DEPENDENCY_BLOCKED',
  HANDOFF_DEPTH_EXCEEDED = 'HANDOFF_DEPTH_EXCEEDED',
  HANDOFF_CYCLE = 'HANDOFF_CYCLE',
  FENCE_VIOLATION = 'FENCE_VIOLATION',
  POLICY_DENIED = 'POLICY_DENIED',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  INVALID_COMMAND = 'INVALID_COMMAND',
  INTERNAL = 'INTERNAL',
}

export const COORDINATION_ERROR_CODES: readonly CoordinationErrorCode[] = [
  CoordinationErrorCode.LOCK_CONFLICT,
  CoordinationErrorCode.CLAIM_CONFLICT,
  CoordinationErrorCode.CLAIM_LOST,
  CoordinationErrorCode.DEPENDENCY_BLOCKED,
  CoordinationErrorCode.HANDOFF_DEPTH_EXCEEDED,
  CoordinationErrorCode.HANDOFF_CYCLE,
  CoordinationErrorCode.FENCE_VIOLATION,
  CoordinationErrorCode.POLICY_DENIED,
  CoordinationErrorCode.APPROVAL_REQUIRED,
  CoordinationErrorCode.INVALID_COMMAND,
  CoordinationErrorCode.INTERNAL,
] as const;
