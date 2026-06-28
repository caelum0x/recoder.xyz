/**
 * A clock the engine reads "now" through so timestamps (Revision.resolvedAt,
 * BrainContext.assembledAt) are deterministic under test. The real default wraps
 * `Date`, tests inject a fixed clock.
 */
export interface ClockPort {
  /** Current wall-clock time as an ISO-8601 string. */
  nowIso(): string;
  /** Current epoch milliseconds (for TTL math, if any). */
  nowMs(): number;
}

/** The real clock — `Date`-backed. Used when no clock is injected. */
export const systemClock: ClockPort = {
  nowIso: () => new Date().toISOString(),
  nowMs: () => Date.now(),
};
