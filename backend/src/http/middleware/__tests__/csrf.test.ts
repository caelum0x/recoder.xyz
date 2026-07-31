import { describe, it, expect } from 'vitest';
import { csrfOriginGuard } from '../csrf.js';
import { mockReq, mockRes } from './_mock.js';

const cfg = { origins: ['https://app.recoder.xyz', '.recoder.xyz'], allowCredentials: true } as const;

/** Run the guard and report whether it passed (called next) or rejected. */
function run(req: ReturnType<typeof mockReq>) {
  const res = mockRes();
  let called = false;
  csrfOriginGuard(cfg)(req, res, () => {
    called = true;
  });
  return { res, called };
}

describe('csrf — Origin/Sec-Fetch-Site guard for cookie-authenticated mutations (item #25)', () => {
  it('REJECTS a cookie-auth POST from a FOREIGN origin with 403', () => {
    const req = mockReq({
      method: 'POST',
      headers: { cookie: 'better-auth.session=abc', origin: 'https://evil.example.com' },
    });
    const { res, called } = run(req);
    expect(called).toBe(false);
    expect(res.result.statusCode).toBe(403);
    expect((res.result.body as { error: { code: string } }).error.code).toBe('AUTHZ_PROJECT_ACCESS_DENIED');
  });

  it('REJECTS a cookie-auth POST with NO Origin header (and no Sec-Fetch-Site) with 403', () => {
    const req = mockReq({ method: 'POST', headers: { cookie: 'better-auth.session=abc' } });
    const { res, called } = run(req);
    expect(called).toBe(false);
    expect(res.result.statusCode).toBe(403);
  });

  it('ALLOWS a same-origin cookie POST (Origin exactly on the allowlist)', () => {
    const req = mockReq({
      method: 'POST',
      headers: { cookie: 'better-auth.session=abc', origin: 'https://app.recoder.xyz' },
    });
    const { called } = run(req);
    expect(called).toBe(true);
  });

  it('ALLOWS a cookie POST from an allowed SUBDOMAIN via a leading-dot entry', () => {
    const req = mockReq({
      method: 'POST',
      headers: { cookie: 'better-auth.session=abc', origin: 'https://cockpit.recoder.xyz' },
    });
    const { called } = run(req);
    expect(called).toBe(true);
  });

  it('ALLOWS a cookie POST proven same-origin by Sec-Fetch-Site with NO Origin header', () => {
    const req = mockReq({
      method: 'POST',
      headers: { cookie: 'better-auth.session=abc', 'sec-fetch-site': 'same-origin' },
    });
    const { called } = run(req);
    expect(called).toBe(true);
  });

  it('EXEMPTS a bearer POST with no cookie regardless of a foreign Origin (not CSRF-able)', () => {
    const req = mockReq({
      method: 'POST',
      headers: { authorization: 'Bearer sk_live_xyz', origin: 'https://evil.example.com' },
    });
    const { called } = run(req);
    expect(called).toBe(true);
  });

  it('EXEMPTS an x-api-key POST from a foreign origin (bearer-style credential)', () => {
    const req = mockReq({
      method: 'POST',
      headers: { 'x-api-key': 'sk_live_xyz', origin: 'https://evil.example.com' },
    });
    const { called } = run(req);
    expect(called).toBe(true);
  });

  it('EXEMPTS a request that carries BOTH a bearer credential and a cookie (bearer wins)', () => {
    const req = mockReq({
      method: 'POST',
      headers: {
        authorization: 'Bearer sk_live_xyz',
        cookie: 'better-auth.session=abc',
        origin: 'https://evil.example.com',
      },
    });
    const { called } = run(req);
    expect(called).toBe(true);
  });

  it('EXEMPTS a non-mutating (GET) cookie request from a foreign origin', () => {
    const req = mockReq({
      method: 'GET',
      headers: { cookie: 'better-auth.session=abc', origin: 'https://evil.example.com' },
    });
    const { called } = run(req);
    expect(called).toBe(true);
  });

  it('guards every mutating verb (PUT/PATCH/DELETE) the same way', () => {
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const req = mockReq({
        method,
        headers: { cookie: 'better-auth.session=abc', origin: 'https://evil.example.com' },
      });
      const { res, called } = run(req);
      expect(called, `${method} should be blocked`).toBe(false);
      expect(res.result.statusCode, `${method} status`).toBe(403);
    }
  });
});
