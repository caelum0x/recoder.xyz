/**
 * @module rate-limiter.test
 *
 * Test suite for the A2A sliding-window rate limiter.
 *
 * Covers:
 * - checkLimit: basic allow/deny, window sliding, boundary cases
 * - Concurrent request tracking: startRequest / endRequest
 * - Per-key config overrides via setConfig
 * - getSummary / getStatus observability
 * - createRateLimitMiddleware: headers, 429 response, concurrent lifecycle
 * - Singleton management: getA2ARateLimiter / resetA2ARateLimiter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  A2ARateLimiter,
  getA2ARateLimiter,
  resetA2ARateLimiter,
  createRateLimitMiddleware,
  DEFAULT_ADAPTER_LIMITS,
  DEFAULT_AGENT_LIMITS,
  type RateLimitConfig,
} from '../rate-limiter.service';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMockReq(overrides?: { params?: any; path?: string }): any {
  return {
    params: overrides?.params ?? {},
    path: overrides?.path ?? '/test',
    headers: {},
  };
}

function makeMockRes(): any {
  const res: any = {
    _status: 200,
    _data: null as any,
    _headers: {} as Record<string, string>,
    _finishHandlers: [] as Array<() => void>,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: any) {
      res._data = data;
      return res;
    },
    setHeader(name: string, value: string) {
      res._headers[name.toLowerCase()] = value;
    },
    on(event: string, handler: () => void) {
      if (event === 'finish') {
        res._finishHandlers.push(handler);
      }
    },
    /** Simulate response finish (for concurrent tracking). */
    simulateFinish() {
      for (const h of res._finishHandlers) h();
    },
  };
  return res;
}

function makeMockNext() {
  return vi.fn();
}

// ===========================================================================
// A2ARateLimiter — core class
// ===========================================================================

describe('A2ARateLimiter', () => {
  let limiter: A2ARateLimiter;

  beforeEach(() => {
    limiter = new A2ARateLimiter();
  });

  // ---- checkLimit ---------------------------------------------------------

  describe('checkLimit', () => {
    it('allows the first request', () => {
      const result = limiter.checkLimit('key-1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(DEFAULT_ADAPTER_LIMITS.maxRequests - 1);
    });

    it('denies after maxRequests are exhausted', () => {
      limiter.setConfig('key-2', { maxRequests: 3, windowMs: 60_000, maxConcurrent: 0 });

      limiter.checkLimit('key-2');
      limiter.checkLimit('key-2');
      limiter.checkLimit('key-2');
      const fourth = limiter.checkLimit('key-2');

      expect(fourth.allowed).toBe(false);
      expect(fourth.remaining).toBe(0);
      expect(fourth.retryAfterMs).toBeGreaterThanOrEqual(0);
    });

    it('returns correct remaining count', () => {
      limiter.setConfig('key-3', { maxRequests: 5, windowMs: 60_000, maxConcurrent: 0 });

      const r1 = limiter.checkLimit('key-3');
      expect(r1.remaining).toBe(4);

      const r2 = limiter.checkLimit('key-3');
      expect(r2.remaining).toBe(3);
    });

    it('resets after window expires', () => {
      limiter.setConfig('key-4', { maxRequests: 2, windowMs: 100, maxConcurrent: 0 });

      limiter.checkLimit('key-4');
      limiter.checkLimit('key-4');

      // Manually expire the timestamps
      const entry = (limiter as any).entries.get('key-4');
      entry.timestamps = [Date.now() - 200, Date.now() - 200];

      const result = limiter.checkLimit('key-4');
      expect(result.allowed).toBe(true);
    });

    it('provides a resetAt ISO string', () => {
      const result = limiter.checkLimit('key-5');
      expect(result.resetAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // ---- Concurrent limits --------------------------------------------------

  describe('concurrent limits', () => {
    it('denies when concurrent limit is reached', () => {
      limiter.setConfig('conc-1', { maxRequests: 100, windowMs: 60_000, maxConcurrent: 2 });

      limiter.startRequest('conc-1');
      limiter.startRequest('conc-1');

      const result = limiter.checkLimit('conc-1');
      expect(result.allowed).toBe(false);
      expect(result.currentConcurrent).toBe(2);
      expect(result.retryAfterMs).toBe(1_000);
    });

    it('allows after a concurrent request ends', () => {
      limiter.setConfig('conc-2', { maxRequests: 100, windowMs: 60_000, maxConcurrent: 1 });

      limiter.startRequest('conc-2');
      limiter.endRequest('conc-2');

      const result = limiter.checkLimit('conc-2');
      expect(result.allowed).toBe(true);
    });

    it('does not go below 0 on endRequest', () => {
      limiter.endRequest('no-start');
      const entry = (limiter as any).entries.get('no-start');
      expect(entry.concurrent).toBe(0);
    });

    it('unlimited concurrent when maxConcurrent is 0', () => {
      limiter.setConfig('conc-3', { maxRequests: 100, windowMs: 60_000, maxConcurrent: 0 });

      for (let i = 0; i < 50; i++) limiter.startRequest('conc-3');

      const result = limiter.checkLimit('conc-3');
      expect(result.allowed).toBe(true);
    });
  });

  // ---- setConfig ----------------------------------------------------------

  describe('setConfig', () => {
    it('overrides the default config for a key', () => {
      const custom: RateLimitConfig = { maxRequests: 5, windowMs: 10_000, maxConcurrent: 2 };
      limiter.setConfig('custom-key', custom);

      // Use up 5 requests
      for (let i = 0; i < 5; i++) limiter.checkLimit('custom-key');
      const result = limiter.checkLimit('custom-key');

      expect(result.allowed).toBe(false);
    });
  });

  // ---- getStatus ----------------------------------------------------------

  describe('getStatus', () => {
    it('returns status without recording a request', () => {
      limiter.setConfig('status-key', { maxRequests: 10, windowMs: 60_000, maxConcurrent: 0 });

      const before = limiter.getStatus('status-key');
      expect(before.allowed).toBe(true);
      expect(before.remaining).toBe(10);

      // Status should NOT consume a slot
      const after = limiter.getStatus('status-key');
      expect(after.remaining).toBe(10);
    });

    it('reflects concurrent state', () => {
      limiter.setConfig('status-conc', { maxRequests: 100, windowMs: 60_000, maxConcurrent: 1 });
      limiter.startRequest('status-conc');

      const status = limiter.getStatus('status-conc');
      expect(status.allowed).toBe(false);
      expect(status.currentConcurrent).toBe(1);
    });
  });

  // ---- getSummary ---------------------------------------------------------

  describe('getSummary', () => {
    it('returns aggregate counters', () => {
      limiter.setConfig('sum-key', { maxRequests: 2, windowMs: 60_000, maxConcurrent: 0 });

      limiter.checkLimit('sum-key'); // allowed
      limiter.checkLimit('sum-key'); // allowed
      limiter.checkLimit('sum-key'); // denied

      const summary = limiter.getSummary();
      expect(summary.totalChecks).toBe(3);
      expect(summary.totalAllowed).toBe(2);
      expect(summary.totalDenied).toBe(1);
      expect(summary.byKey['sum-key']).toBeDefined();
      expect(summary.byKey['sum-key'].requestsInWindow).toBe(2);
    });
  });

  // ---- reset --------------------------------------------------------------

  describe('reset', () => {
    it('clears all state', () => {
      limiter.checkLimit('reset-key');
      limiter.reset();

      const summary = limiter.getSummary();
      expect(summary.totalChecks).toBe(0);
      expect(Object.keys(summary.byKey)).toHaveLength(0);
    });
  });
});

// ===========================================================================
// Singleton
// ===========================================================================

describe('singleton management', () => {
  afterEach(() => {
    resetA2ARateLimiter();
  });

  it('returns the same instance on repeated calls', () => {
    const a = getA2ARateLimiter();
    const b = getA2ARateLimiter();
    expect(a).toBe(b);
  });

  it('returns a new instance after reset', () => {
    const a = getA2ARateLimiter();
    resetA2ARateLimiter();
    const b = getA2ARateLimiter();
    expect(a).not.toBe(b);
  });
});

// ===========================================================================
// Default configs
// ===========================================================================

describe('default configs', () => {
  it('DEFAULT_ADAPTER_LIMITS has expected values', () => {
    expect(DEFAULT_ADAPTER_LIMITS.maxRequests).toBe(100);
    expect(DEFAULT_ADAPTER_LIMITS.windowMs).toBe(60_000);
    expect(DEFAULT_ADAPTER_LIMITS.maxConcurrent).toBe(10);
  });

  it('DEFAULT_AGENT_LIMITS has expected values', () => {
    expect(DEFAULT_AGENT_LIMITS.maxRequests).toBe(200);
    expect(DEFAULT_AGENT_LIMITS.windowMs).toBe(60_000);
    expect(DEFAULT_AGENT_LIMITS.maxConcurrent).toBe(20);
  });
});

// ===========================================================================
// createRateLimitMiddleware
// ===========================================================================

describe('createRateLimitMiddleware', () => {
  afterEach(() => {
    resetA2ARateLimiter();
  });

  it('calls next() and sets rate limit headers when allowed', () => {
    const mw = createRateLimitMiddleware(
      (req) => `adapter:${req.params.adapterId}`,
      { maxRequests: 10, windowMs: 60_000, maxConcurrent: 0 },
    );

    const req = makeMockReq({ params: { adapterId: 'rest-1' } });
    const res = makeMockRes();
    const next = makeMockNext();

    mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._headers['x-ratelimit-remaining']).toBeDefined();
    expect(res._headers['x-ratelimit-limit']).toBe('10');
    expect(res._headers['x-ratelimit-reset']).toBeDefined();
  });

  it('returns 429 when rate limit is exceeded', () => {
    const mw = createRateLimitMiddleware(
      () => 'fixed-key',
      { maxRequests: 1, windowMs: 60_000, maxConcurrent: 0 },
    );

    const req1 = makeMockReq();
    const res1 = makeMockRes();
    mw(req1, res1, makeMockNext());

    // Second request should be denied
    const req2 = makeMockReq();
    const res2 = makeMockRes();
    const next2 = makeMockNext();
    mw(req2, res2, next2);

    expect(next2).not.toHaveBeenCalled();
    expect(res2._status).toBe(429);
    expect(res2._data.success).toBe(false);
    expect(res2._data.error.code).toBeDefined();
    expect(res2._headers['retry-after']).toBeDefined();
  });

  it('tracks concurrent requests via response finish event', () => {
    const mw = createRateLimitMiddleware(
      () => 'conc-mw-key',
      { maxRequests: 100, windowMs: 60_000, maxConcurrent: 5 },
    );

    const req = makeMockReq();
    const res = makeMockRes();
    const next = makeMockNext();

    mw(req, res, next);

    // Concurrent should be incremented
    const limiter = getA2ARateLimiter();
    const status = limiter.getStatus('conc-mw-key');
    expect(status.currentConcurrent).toBe(1);

    // Simulate finish
    res.simulateFinish();
    const statusAfter = limiter.getStatus('conc-mw-key');
    expect(statusAfter.currentConcurrent).toBe(0);
  });
});
