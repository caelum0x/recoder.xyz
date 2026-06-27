/**
 * Lock request shapes. MERGED from the `*Input` types in
 * `packages/agent-os/src/services/work-lock-service.ts`, extended with `kind`
 * and `fenceToken` for shared/exclusive locking + write fencing.
 */

import type { LockKind } from './work-lock';

export type AcquireLockRequest = {
  spaceId: string;
  repo?: string;
  pathGlob: string;
  ownerAgentId: string;
  taskId: string;
  /** Defaults to `exclusive`. */
  kind?: LockKind;
  /** Optional explicit id; otherwise derived deterministically. */
  lockId?: string;
  ttlMs?: number;
};

export type ReleaseLockRequest = {
  lockId: string;
  ownerAgentId?: string;
  taskId?: string;
  /** Fence token the releaser holds; a stale token must not release. */
  fenceToken?: number;
};

export type RenewLockRequest = {
  lockId: string;
  ownerAgentId: string;
  taskId: string;
  fenceToken: number;
  ttlMs?: number;
};
