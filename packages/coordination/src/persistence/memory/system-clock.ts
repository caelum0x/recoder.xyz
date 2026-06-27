/**
 * SystemClock — wall-clock `ClockPort`. The default production clock; tests use
 * a pinned `FakeClock` instead so age/expiry math is deterministic.
 */

import type { ClockPort } from '../../ports';

export class SystemClock implements ClockPort {
  now(): number {
    return Date.now();
  }

  iso(): string {
    return new Date().toISOString();
  }
}

/**
 * FakeClock — a pinned-instant `ClockPort` for tests. `advance(ms)` moves time
 * forward so window/expiry transitions can be exercised deterministically.
 */
export class FakeClock implements ClockPort {
  private millis: number;

  constructor(start: number | string = 0) {
    this.millis = typeof start === 'string' ? Date.parse(start) : start;
  }

  now(): number {
    return this.millis;
  }

  iso(): string {
    return new Date(this.millis).toISOString();
  }

  advance(ms: number): void {
    this.millis += ms;
  }

  set(at: number | string): void {
    this.millis = typeof at === 'string' ? Date.parse(at) : at;
  }
}
