/**
 * LockLease — a TTL-bounded lease plus the fence token a writer must present.
 * The fence token (monotonic, per `LeaseFencerPort`) lets the store reject a
 * write from a stale writer even if the lock row still exists.
 */

export type LockLease = {
  lockId: string;
  ownerAgentId: string;
  taskId: string;
  acquiredAt: string;
  expiresAt: string;
  /** Monotonic; a writer with a lower token than the current lease is stale. */
  fenceToken: number;
};
