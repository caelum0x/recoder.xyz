/**
 * systemClock — the real ClockPort backed by the host clock.
 *
 * Not a stub: it reads the actual wall clock. Tests that need determinism inject
 * their own ClockPort instead of using this.
 */
import type { ClockPort } from '../ports/clock.port.js';

export const systemClock: ClockPort = {
  now: () => new Date().toISOString(),
  nowMs: () => Date.now(),
};
