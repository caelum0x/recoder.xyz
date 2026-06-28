/**
 * ClockPort — the time seam.
 *
 * Injecting the clock keeps the engine, reconcile, and observe modules
 * deterministic under test (no real `Date.now()` reads). Returns an ISO-8601
 * timestamp string (the format every Workspace/Run/Event field uses).
 */
export interface ClockPort {
  /** Current wall-clock time as an ISO-8601 string. */
  now(): string;
  /** Current epoch milliseconds (for durations/latency metrics). */
  nowMs(): number;
}
