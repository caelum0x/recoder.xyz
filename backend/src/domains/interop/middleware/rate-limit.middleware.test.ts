import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Request, Response, NextFunction } from 'express';
import { createRateLimitMiddleware } from './rate-limit.middleware.js';
import { A2ARateLimiter, type RateLimitConfig } from '../rate-limiter.service.js';

/**
 * A Response double that is a real EventEmitter (so 'finish'/'close' fire) and
 * captures the status set by `sendError`.
 */
function fakeRes(): Response & { statusCode: number | null } {
  const res = new EventEmitter() as unknown as Response & { statusCode: number | null };
  res.statusCode = null;
  (res as unknown as { status(code: number): unknown }).status = function (code: number) {
    (this as { statusCode: number | null }).statusCode = code;
    return this;
  };
  (res as unknown as { json(): unknown }).json = function () {
    return this;
  };
  (res as unknown as { setHeader(): unknown }).setHeader = function () {
    return this;
  };
  return res;
}

function fakeReq(): Request {
  return { method: 'POST', baseUrl: '/api/a2a', path: '/api/a2a', ip: '1.1.1.1' } as unknown as Request;
}

/** One concurrent slot, effectively unlimited request rate — so ONLY concurrency gates. */
const ONE_SLOT: RateLimitConfig = { maxRequests: 1_000_000, windowMs: 60_000, maxConcurrent: 1 };

/** Drive one request through the middleware; return whether `next` ran (allowed) + the res. */
function run(mw: ReturnType<typeof createRateLimitMiddleware>) {
  const res = fakeRes();
  let nexted = false;
  const next: NextFunction = () => {
    nexted = true;
  };
  mw(fakeReq(), res, next);
  return { res, nexted };
}

describe('createRateLimitMiddleware — concurrent-counter lifecycle', () => {
  it("releases the concurrent slot on 'close' (client abort without 'finish'), preventing self-DoS", () => {
    const limiter = new A2ARateLimiter();
    const mw = createRateLimitMiddleware({ config: ONE_SLOT, limiter });

    // Request 1 is admitted and takes the single concurrent slot.
    const first = run(mw);
    expect(first.nexted).toBe(true);
    expect(first.res.statusCode).toBeNull();

    // The client aborts: 'close' fires WITHOUT 'finish'. The slot must be released.
    first.res.emit('close');

    // Request 2 (same key) must be admitted — before the fix the leaked counter
    // would keep concurrent at 1 and this would be denied 429 forever.
    const second = run(mw);
    expect(second.nexted).toBe(true);
    expect(second.res.statusCode).toBeNull();
  });

  it("does not double-release when both 'finish' and 'close' fire (no underflow)", () => {
    const limiter = new A2ARateLimiter();
    const mw = createRateLimitMiddleware({ config: ONE_SLOT, limiter });

    const first = run(mw);
    expect(first.nexted).toBe(true);
    // Both events fire for the same request — the once-guard must release exactly once.
    first.res.emit('finish');
    first.res.emit('close');

    // A fresh request still takes exactly one slot; a second concurrent one is denied,
    // proving the counter did not underflow below zero.
    const a = run(mw);
    expect(a.nexted).toBe(true);
    const b = run(mw); // a is still in-flight (no finish/close) => slot taken
    expect(b.nexted).toBe(false);
    expect(b.res.statusCode).toBe(429);
  });

  it("still enforces maxConcurrent for genuinely in-flight requests", () => {
    const limiter = new A2ARateLimiter();
    const mw = createRateLimitMiddleware({ config: ONE_SLOT, limiter });

    const first = run(mw); // takes the slot, never completes
    expect(first.nexted).toBe(true);
    const second = run(mw); // slot busy => 429
    expect(second.nexted).toBe(false);
    expect(second.res.statusCode).toBe(429);
  });
});
