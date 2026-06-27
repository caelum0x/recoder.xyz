/**
 * Clock — the deterministic-time seam. The pure core never calls `Date.now()`
 * directly; it receives a `now` ISO string (or a `Clock`) so tests can pin time.
 * The `ClockPort` (ports/clock.ts) is the injectable adapter shape; this is the
 * lightweight value type + helper for callers that already hold a timestamp.
 */

export type Clock = {
  now(): number;
  iso(): string;
};

/** Build a Clock from a fixed ISO instant (deterministic, for the pure core). */
export function fixedClock(iso: string): Clock {
  const ms = Date.parse(iso);
  return {
    now: () => ms,
    iso: () => new Date(ms).toISOString(),
  };
}

/** ISO string for an epoch-ms value. */
export function iso(ms: number): string {
  return new Date(ms).toISOString();
}
