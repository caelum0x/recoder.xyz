/**
 * `nextBackoff` + `BackoffTracker` — the shared restart-loop policy:
 *  - exponential growth clamped to the cap, jittered within ±20%,
 *  - the tracker advances, exhausts at the ceiling, and resets after a boot.
 */
import { describe, it, expect } from 'vitest';
import { nextBackoff, BackoffTracker } from './backoff.js';

describe('nextBackoff', () => {
  it('grows exponentially and clamps to the cap (within ±20% jitter)', () => {
    // attempt 0 ≈ base (1000ms) ± 20%.
    for (let i = 0; i < 50; i++) {
      const d0 = nextBackoff(0, 30_000, 1_000);
      expect(d0).toBeGreaterThanOrEqual(800);
      expect(d0).toBeLessThanOrEqual(1_200);
    }
    // a large attempt clamps to cap ± 20%.
    const capped = nextBackoff(20, 30_000, 1_000);
    expect(capped).toBeGreaterThanOrEqual(24_000);
    expect(capped).toBeLessThanOrEqual(36_000);
  });

  it('never returns a negative delay', () => {
    for (let i = 0; i < 100; i++) {
      expect(nextBackoff(i % 10)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('BackoffTracker', () => {
  it('advances, exhausts at the ceiling, and resets', () => {
    const tracker = new BackoffTracker(30_000, 3, 1_000);
    expect(tracker.exhausted()).toBe(false);
    tracker.next();
    tracker.next();
    tracker.next();
    expect(tracker.attempts()).toBe(3);
    expect(tracker.exhausted()).toBe(true);
    tracker.reset();
    expect(tracker.attempts()).toBe(0);
    expect(tracker.exhausted()).toBe(false);
  });
});
