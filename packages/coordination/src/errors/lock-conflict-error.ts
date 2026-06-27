/**
 * LockConflictError — MERGED from `WorkLockConflictError`
 * (packages/agent-os/src/services/work-lock-service.ts). Preserves the
 * `conflicts: WorkLock[]` evidence so callers/UI can show exactly who holds the
 * path. Now a `CoordinationError` with `code = LOCK_CONFLICT`.
 */

import type { WorkLock } from '../domain';
import { CoordinationError } from './coordination-error';
import { CoordinationErrorCode } from './error-codes';

export class LockConflictError extends CoordinationError {
  readonly conflicts: WorkLock[];

  constructor(conflicts: WorkLock[]) {
    super(
      CoordinationErrorCode.LOCK_CONFLICT,
      `Work lock conflicts with ${conflicts.length} active lock(s).`,
      { conflictLockIds: conflicts.map((lock) => lock.lockId) },
    );
    this.name = 'LockConflictError';
    this.conflicts = conflicts;
  }
}
