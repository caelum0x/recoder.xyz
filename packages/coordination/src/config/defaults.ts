/**
 * Default TTLs / limits as named constants (no magic numbers). Sources cited
 * per design §10.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Matches the `work-lock-service.ts` 30-minute default TTL. */
export const DEFAULT_LOCK_TTL_MS = 30 * MINUTE_MS;

/** New: window before expiry in which a lock may be renewed. */
export const DEFAULT_LOCK_RENEW_WINDOW_MS = 5 * MINUTE_MS;

/** multica `claimResponseRecoveryWindow`. */
export const DEFAULT_CLAIM_RECOVERY_WINDOW_MS = 90_000;

/** A2A `HEARTBEAT_TIMEOUT_MS`. */
export const DEFAULT_PRESENCE_HEARTBEAT_TIMEOUT_MS = 5 * MINUTE_MS;

/** delegation-chain depth cap (design §10; source default was 5). */
export const DEFAULT_HANDOFF_MAX_DEPTH = 8;

/** A2A NATS 6h retention → handoff dedup TTL. */
export const DEFAULT_HANDOFF_DEDUP_TTL_MS = 6 * HOUR_MS;

/** A2A retention defaults for the event ring buffer. */
export const DEFAULT_EVENT_RETENTION_TTL_MS = 6 * HOUR_MS;
export const DEFAULT_EVENT_MAX_RECORDS = 1000;

/** New: reconciler tick interval. */
export const DEFAULT_RECONCILE_INTERVAL_MS = 30_000;

/**
 * Dispatch claim lease length. Defaults to the lock TTL so a dispatched agent's
 * claim and its reserved write-locks share a lifetime (design §4.3 / §10).
 */
export const DEFAULT_DISPATCH_LEASE_MS = DEFAULT_LOCK_TTL_MS;

/**
 * Per-space parallel-slot cap (multica `max_concurrent_tasks` analog). Bounds
 * how many tasks a single space may have dispatched concurrently.
 */
export const DEFAULT_DISPATCH_MAX_CONCURRENCY = 4;
