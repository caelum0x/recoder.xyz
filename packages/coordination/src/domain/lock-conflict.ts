/**
 * LockConflict — evidence that an acquire was blocked. Carries the offending
 * active lock so the caller/UI can show exactly who holds the path.
 */

import type { WorkLock } from './work-lock';

export type ConflictKind = 'overlap' | 'exclusive' | 'fence';

export const CONFLICT_KINDS: readonly ConflictKind[] = ['overlap', 'exclusive', 'fence'] as const;

export type LockConflict = {
  kind: ConflictKind;
  /** The active lock the requested acquire conflicts with. */
  existing: WorkLock;
  /** The glob the requester tried to claim. */
  requestedPathGlob: string;
  reason: string;
};
