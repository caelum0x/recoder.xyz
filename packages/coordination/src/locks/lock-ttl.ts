/**
 * Lock TTL math — expiry, renewal windows, lease end computation.
 *
 * Pure over passed-in values; the Clock port is the deterministic time seam, so
 * every function here takes `now` (an ISO string) explicitly. Replaces the
 * inline `Date.parse`/`new Date(... + ttlMs)` arithmetic the original
 * `work-lock-service.ts` did in `acquire`/`listActive`.
 */

import type { WorkLock } from '../domain';
import { DEFAULT_LOCK_RENEW_WINDOW_MS, DEFAULT_LOCK_TTL_MS } from '../config/defaults';
import { addMs, isActive, isExpired, remainingMs } from '../util/time';

/** ISO expiry timestamp `ttlMs` after `now` (defaults to the 30m lock TTL). */
export function computeExpiry(now: string, ttlMs: number = DEFAULT_LOCK_TTL_MS): string {
  return addMs(now, ttlMs);
}

/** True if the lock is still active (not yet expired) at `now`. */
export function isLockActive(lock: WorkLock, now: string): boolean {
  return isActive(lock.expiresAt, now);
}

/** True if the lock has expired at `now`. */
export function isLockExpired(lock: WorkLock, now: string): boolean {
  return isExpired(lock.expiresAt, now);
}

/** Milliseconds remaining on the lock's lease (negative once expired). */
export function lockRemainingMs(lock: WorkLock, now: string): number {
  return remainingMs(lock.expiresAt, now);
}

/**
 * True if the lock is inside its renewal window: still active, but within
 * `renewWindowMs` of expiry. Renewing earlier is wasteful; renewing after
 * expiry is a re-acquire (and must go through the conflict check + fencer).
 */
export function isRenewable(
  lock: WorkLock,
  now: string,
  renewWindowMs: number = DEFAULT_LOCK_RENEW_WINDOW_MS,
): boolean {
  if (!isLockActive(lock, now)) {
    return false;
  }
  return lockRemainingMs(lock, now) <= renewWindowMs;
}

/** Filter a lock set to only those active at `now`. MERGED from `listActive`. */
export function activeLocks(locks: readonly WorkLock[], now: string): WorkLock[] {
  return locks.filter((lock) => isLockActive(lock, now));
}

/** Filter a lock set to only those expired at `now`. */
export function expiredLocks(locks: readonly WorkLock[], now: string): WorkLock[] {
  return locks.filter((lock) => isLockExpired(lock, now));
}
