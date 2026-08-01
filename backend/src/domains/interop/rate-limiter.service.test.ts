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

describe('A2ARateLimiter — idle-entry eviction (bounded memory under churn)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('evicts keys whose window has fully elapsed so the map does not grow unbounded', () => {
    vi.setSystemTime(0);
    // sweepIntervalOps:1 → every checkLimit runs a full idle sweep (deterministic).
    const rl = new A2ARateLimiter({ sweepIntervalOps: 1 });

    // 100 distinct one-shot keys (churny traffic: unique IPs that never return).
    for (let i = 0; i < 100; i++) rl.checkLimit(`ip-${i}`);
    expect(rl.size()).toBe(100); // still inside their (default) window — all live.

    // Slide past the default window; every ip-* entry is now idle/expired.
    vi.setSystemTime(DEFAULT_ADAPTER_LIMITS.windowMs + 1);
    rl.checkLimit('trigger'); // a single touch triggers the sweep.

    // Only the active 'trigger' key survives — the 100 idle keys are gone.
    expect(rl.size()).toBe(1);
  });

  it('keeps an ACTIVE key\'s in-window count intact while evicting idle keys (no wrongful reset)', () => {
    vi.setSystemTime(0);
    const rl = new A2ARateLimiter({ sweepIntervalOps: 1 });

    // Active key: long window, 2 of 3 budget consumed at t=0.
    rl.setConfig('active', { maxRequests: 3, windowMs: 10_000, maxConcurrent: 0 });
    rl.checkLimit('active');
    rl.checkLimit('active');

    // Idle keys: short window so they expire before the active one.
    for (let i = 0; i < 5; i++) {
      rl.setConfig(`idle-${i}`, { maxRequests: 3, windowMs: 1_000, maxConcurrent: 0 });
      rl.checkLimit(`idle-${i}`);
    }
    expect(rl.size()).toBe(6);

    // Past the idle window (1s) but well within the active window (10s).
    vi.setSystemTime(2_000);
    const third = rl.checkLimit('active'); // sweep fires; 3rd hit on 'active'.
    expect(third.allowed).toBe(true);

    expect(rl.size()).toBe(1); // idle keys evicted, active retained.
    // Count was NOT wrongly reset by the sweep: 3 hits used → the 4th is denied.
    expect(rl.checkLimit('active').allowed).toBe(false);
  });

  it('never evicts a key with in-flight (concurrent) requests even when its window is empty', () => {
    vi.setSystemTime(0);
    const rl = new A2ARateLimiter({ sweepIntervalOps: 1 });
    rl.setConfig('busy', { maxRequests: 5, windowMs: 1_000, maxConcurrent: 4 });
    rl.checkLimit('busy');
    rl.startRequest('busy'); // one request still in flight.

    // Window slides past — timestamps expire, but the request is still running.
    vi.setSystemTime(2_000);
    rl.checkLimit('other'); // sweep fires.

    // 'busy' must survive (active concurrency), so its in-flight count is intact.
    expect(rl.getStatus('busy').currentConcurrent).toBe(1);
  });

  it('still allows/denies correctly after an evicted key re-appears with a fresh budget', () => {
    vi.setSystemTime(0);
    const rl = new A2ARateLimiter({ sweepIntervalOps: 1 });
    rl.setConfig('k', tight); // 3 per 1s.
    rl.checkLimit('k');
    rl.checkLimit('k');
    rl.checkLimit('k');
    expect(rl.checkLimit('k').allowed).toBe(false); // exhausted.

    vi.setSystemTime(1_500); // window elapsed → 'k' is idle.
    rl.setConfig('k', tight);
    rl.checkLimit('other'); // sweep evicts idle 'k'.
    expect(rl.size()).toBe(1); // only 'other' remains.

    // 'k' re-appears within a fresh window and is served again (correct allow).
    expect(rl.checkLimit('k').allowed).toBe(true);
  });

  it('exposes evictIdle for an explicit sweep that returns the count removed', () => {
    vi.setSystemTime(0);
    const rl = new A2ARateLimiter({ sweepIntervalOps: 1_000_000 }); // no auto-sweep here.
    rl.setConfig('a', tight);
    rl.setConfig('b', tight);
    rl.checkLimit('a');
    rl.checkLimit('b');
    expect(rl.size()).toBe(2);

    vi.setSystemTime(2_000); // both windows elapsed.
    expect(rl.evictIdle()).toBe(2);
    expect(rl.size()).toBe(0);
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
