import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateBody, validateQuery, validateParams } from '../validate.js';
import { mockReq, mockRes } from './_mock.js';

describe('validate — the sanctioned inbound-validation boundary', () => {
  it('narrows and REPLACES req.body on success (coerced, typed)', () => {
    const schema = z.object({ name: z.string(), count: z.coerce.number() });
    const req = mockReq({ body: { name: 'a', count: '5' } });
    const res = mockRes();
    let called = false;
    validateBody(schema)(req, res, () => {
      called = true;
    });
    expect(called).toBe(true);
    expect(req.body).toEqual({ name: 'a', count: 5 });
    expect(res.result.body).toBeUndefined();
  });

  it('returns the VALIDATION_ERROR envelope with field paths on failure (no next)', () => {
    const schema = z.object({ email: z.string().email() });
    const req = mockReq({ body: { email: 'not-an-email' } });
    const res = mockRes();
    let called = false;
    validateBody(schema)(req, res, () => {
      called = true;
    });
    expect(called).toBe(false);
    expect(res.result.statusCode).toBe(400);
    const body = res.result.body as {
      success: boolean;
      error: { code: string; details?: { source: string; fields: Array<{ path: string }> } };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.source).toBe('body');
    expect(body.error.details?.fields[0]?.path).toBe('email');
  });

  it('validates params and query independently', () => {
    const req = mockReq({ params: { id: '42' }, query: { limit: '10' } });
    const res = mockRes();
    validateParams(z.object({ id: z.coerce.number() }))(req, res, () => {});
    expect(req.params).toEqual({ id: 42 });
    validateQuery(z.object({ limit: z.coerce.number() }))(req, res, () => {});
    expect(req.query).toEqual({ limit: 10 });
  });
});
