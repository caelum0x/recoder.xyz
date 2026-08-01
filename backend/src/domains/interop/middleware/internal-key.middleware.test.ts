import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { internalServiceGuard } from './internal-key.middleware.js';

/** Minimal Response double capturing the status set by `sendError`. */
function fakeRes(): Response & { statusCode: number | null } {
  const res = {
    statusCode: null as number | null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number | null };
}

function reqWith(headers: Record<string, unknown>): Request {
  return { headers } as unknown as Request;
}

const KEY = 'super-secret-internal-key';

describe('internalServiceGuard — single /internal/* gate (fail-closed)', () => {
  it('FAIL-CLOSED: an UNCONFIGURED gate (null key) denies 503 and never calls next', () => {
    const guard = internalServiceGuard({ internalServiceKey: null });
    const res = fakeRes();
    const next = vi.fn();
    guard(reqWith({}), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
  });

  it('denies 401 when no key is presented', () => {
    const guard = internalServiceGuard({ internalServiceKey: KEY });
    const res = fakeRes();
    const next = vi.fn();
    guard(reqWith({}), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('denies 401 on a mismatched key', () => {
    const guard = internalServiceGuard({ internalServiceKey: KEY });
    const res = fakeRes();
    const next = vi.fn();
    guard(reqWith({ 'x-internal-service-key': 'wrong' }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('denies 401 on a same-prefix but different-length key (constant-time, length-safe)', () => {
    const guard = internalServiceGuard({ internalServiceKey: KEY });
    const res = fakeRes();
    const next = vi.fn();
    guard(reqWith({ 'x-internal-service-key': KEY.slice(0, 5) }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('ADMITS a correct key via x-internal-service-key', () => {
    const guard = internalServiceGuard({ internalServiceKey: KEY });
    const res = fakeRes();
    const next = vi.fn();
    guard(reqWith({ 'x-internal-service-key': KEY }), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeNull();
  });

  it('ADMITS a correct key via the Authorization: Bearer fallback', () => {
    const guard = internalServiceGuard({ internalServiceKey: KEY });
    const res = fakeRes();
    const next = vi.fn();
    guard(reqWith({ authorization: `Bearer ${KEY}` }), res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('accepts an array-valued header (takes the first element)', () => {
    const guard = internalServiceGuard({ internalServiceKey: KEY });
    const res = fakeRes();
    const next = vi.fn();
    guard(reqWith({ 'x-internal-service-key': [KEY, 'other'] }), res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
