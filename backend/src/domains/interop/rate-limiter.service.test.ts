import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  A2ARateLimiter,
  getA2ARateLimiter,
  resetA2ARateLimiter,
  DEFAULT_ADAPTER_LIMITS,
  type RateLimitConfig,
} from './rate-limiter.service.js';

const tight: RateLimitConfig = { maxRequests: 3, windowMs: 1_000, maxConcurrent: 2 };

describe('A2ARateLimiter — sliding-window rate limiting (DoS protection)', () => {
  let rl: A2ARateLimiter;

  beforeEach(() => {
    rl = new A2ARateLimiter();
  });

  it('allows up to maxRequests then DENIES the overflow in the same window', () => {
    rl.setConfig('k', tight);
    expect(rl.checkLimit('k').allowed).toBe(true);
    expect(rl.checkLimit('k').allowed).toBe(true);
    const third = rl.checkLimit('k');
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    const fourth = rl.checkLimit('k');
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
  });

  it('isolates limits per key (one key exhausted does not affect another)', () => {
    rl.setConfig('a', tight);
    rl.setConfig('b', tight);
    for (let i = 0; i < 4; i++) rl.checkLimit('a');
    expect(rl.checkLimit('a').allowed).toBe(false);
    expect(rl.checkLimit('b').allowed).toBe(true);
  });

  it('DENIES when concurrent in-flight requests reach maxConcurrent', () => {
    rl.setConfig('k', { maxRequests: 100, windowMs: 60_000, maxConcurrent: 2 });
    expect(rl.checkLimit('k').allowed).toBe(true);
    rl.startRequest('k');
    expect(rl.checkLimit('k').allowed).toBe(true);
    rl.startRequest('k');
    // Two in-flight now → next check is denied on the concurrent ceiling.
    const denied = rl.checkLimit('k');
    expect(denied.allowed).toBe(false);
    expect(denied.currentConcurrent).toBe(2);
    // Finish one → capacity frees up.
    rl.endRequest('k');
    expect(rl.checkLimit('k').allowed).toBe(true);
  });

  it('treats maxConcurrent=0 as unlimited concurrency', () => {
    rl.setConfig('k', { maxRequests: 100, windowMs: 60_000, maxConcurrent: 0 });
    for (let i = 0; i < 50; i++) rl.startRequest('k');
    expect(rl.checkLimit('k').allowed).toBe(true);
  });

  it('never lets endRequest drive the concurrent count negative', () => {
    rl.setConfig('k', tight);
    rl.endRequest('k');
    rl.endRequest('k');
    expect(rl.getStatus('k').currentConcurrent).toBe(0);
  });

  it('falls back to DEFAULT_ADAPTER_LIMITS for an unconfigured key', () => {
    const status = rl.getStatus('never-configured');
    expect(status.remaining).toBe(DEFAULT_ADAPTER_LIMITS.maxRequests);
  });

  it('getStatus does NOT consume the budget (non-mutating peek)', () => {
    rl.setConfig('k', tight);
    rl.getStatus('k');
    rl.getStatus('k');
    // Three real checks should still be allowed — status peeks recorded nothing.
    expect(rl.checkLimit('k').allowed).toBe(true);
    expect(rl.checkLimit('k').allowed).toBe(true);
    expect(rl.checkLimit('k').allowed).toBe(true);
    expect(rl.checkLimit('k').allowed).toBe(false);
  });

  it('tracks allowed/denied tallies in the summary', () => {
    rl.setConfig('k', tight);
    for (let i = 0; i < 5; i++) rl.checkLimit('k'); // 3 allowed, 2 denied
    const s = rl.getSummary();
    expect(s.totalAllowed).toBe(3);
    expect(s.totalDenied).toBe(2);
    expect(s.byKey['k'].requestsInWindow).toBe(3);
  });

  describe('sliding-window expiry (fake timers)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('reclaims budget once the window slides past the old timestamps', () => {
      vi.setSystemTime(0);
      rl.setConfig('k', tight);
      rl.checkLimit('k');
      rl.checkLimit('k');
      rl.checkLimit('k');
      expect(rl.checkLimit('k').allowed).toBe(false);
      // Advance beyond the 1s window — the three old hits expire.
      vi.setSystemTime(1_500);
      expect(rl.checkLimit('k').allowed).toBe(true);
    });
  });
});

describe('A2ARateLimiter singleton lifecycle', () => {
  afterEach(() => resetA2ARateLimiter());

  it('returns a stable singleton until reset', () => {
    const a = getA2ARateLimiter();
    const b = getA2ARateLimiter();
    expect(a).toBe(b);
    resetA2ARateLimiter();
    expect(getA2ARateLimiter()).not.toBe(a);
  });
});
