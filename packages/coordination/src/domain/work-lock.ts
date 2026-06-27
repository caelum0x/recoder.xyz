/**
 * WorkLock — path/glob-scoped, TTL-bounded write claim.
 *
 * MERGED from `packages/agent-os/src/domain/work-lock.ts`. The original shape
 * (`lockId, spaceId, repo?, pathGlob, ownerAgentId, taskId, acquiredAt,
 * expiresAt`) and `lockCoversPath` are preserved here. EXTENDED with:
 *  - `fenceToken: number` — monotonic write-fence token (closes the
 *    "slow writer resumes after lock re-acquired" race; absent in the original).
 *  - `kind: 'exclusive' | 'shared'` — read-only agents (`shared`) co-locate;
 *    only `exclusive` writers conflict.
 *
 * Coordination owns this type but fuses, never forks, the agent-os primitive.
 */

import { globMatchesPath } from '../util/glob';

export type LockKind = 'exclusive' | 'shared';

export const LOCK_KINDS: readonly LockKind[] = ['exclusive', 'shared'] as const;

export type WorkLock = {
  lockId: string;
  spaceId: string;
  repo?: string;
  pathGlob: string;
  ownerAgentId: string;
  taskId: string;
  acquiredAt: string;
  expiresAt: string;
  /** Monotonic fence token issued at acquire; presented on every write. */
  fenceToken: number;
  /** `shared` locks never conflict with each other, only with `exclusive`. */
  kind: LockKind;
};

/** True if `lock` covers `path`. MERGED from agent-os `lockCoversPath`. */
export function lockCoversPath(lock: WorkLock, path: string): boolean {
  return globMatchesPath(lock.pathGlob, path);
}

/** Two locks conflict only when at least one is `exclusive`. */
export function locksAreCompatible(left: WorkLock, right: WorkLock): boolean {
  return left.kind === 'shared' && right.kind === 'shared';
}
