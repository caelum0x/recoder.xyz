/**
 * ClockPort — deterministic time seam. Adapters return wall-clock; tests return
 * a pinned instant (FakeClock).
 */

export interface ClockPort {
  now(): number;
  iso(): string;
}
