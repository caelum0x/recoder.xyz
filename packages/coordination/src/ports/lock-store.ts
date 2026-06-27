/**
 * LockStorePort — persistence of work-locks, scoped by space + repo. `put` is a
 * compare-and-set keyed on fence token so two concurrent acquires cannot both
 * win the same scope (the Postgres adapter uses a unique partial index on
 * active locks; memory uses a Map CAS).
 */

import type { WorkLock } from '../domain';

export type LockScope = {
  spaceId: string;
  repo?: string;
};

export interface LockStorePort {
  /** All locks (active + expired) for a space/repo scope. */
  list(scope: LockScope): Promise<WorkLock[]>;
  /** Persist a lock with compare-and-set on its fence token. Returns the stored lock. */
  put(lock: WorkLock): Promise<WorkLock>;
  /** Remove a lock by id (optionally owner/task scoped). */
  delete(lockId: string, owner?: { ownerAgentId?: string; taskId?: string }): Promise<void>;
  /** Read a single lock by id. */
  get(lockId: string): Promise<WorkLock | undefined>;
}
