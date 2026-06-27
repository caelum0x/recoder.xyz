/**
 * Time + window math. ISO<->ms helpers and TTL/expiry/window predicates used by
 * locks, claims, presence, and the reconciler. Time is always passed in (the
 * Clock port is the deterministic seam) — these are pure helpers over values.
 */

/** Parse an ISO timestamp to epoch ms. */
export function toMs(iso: string): number {
  return Date.parse(iso);
}

/** Format epoch ms as an ISO timestamp. */
export function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

/** ISO timestamp `ttlMs` after `iso`. */
export function addMs(iso: string, ttlMs: number): string {
  return toIso(toMs(iso) + ttlMs);
}

/** True if `expiresAt` is at or before `now`. */
export function isExpired(expiresAt: string, now: string): boolean {
  return toMs(expiresAt) <= toMs(now);
}

/** True if `now` is still strictly before `expiresAt`. */
export function isActive(expiresAt: string, now: string): boolean {
  return toMs(expiresAt) > toMs(now);
}

/** Milliseconds remaining until `expiresAt` (negative if already expired). */
export function remainingMs(expiresAt: string, now: string): number {
  return toMs(expiresAt) - toMs(now);
}

/** True if `then` is within `windowMs` before-or-after `now`. */
export function withinWindow(then: string, now: string, windowMs: number): boolean {
  return Math.abs(toMs(now) - toMs(then)) <= windowMs;
}
