import { describe, it, expect } from 'vitest';
import { securityHeaders, resolveSecurityHeadersConfig } from '../security-headers.js';
import { mockReq, mockRes } from './_mock.js';

/** Run the middleware against the mock req/res and return the captured headers. */
function run(partial?: Parameters<typeof securityHeaders>[0]): Record<string, string> {
  const res = mockRes();
  let nextCalled = false;
  securityHeaders(partial)(mockReq(), res, () => {
    nextCalled = true;
  });
  expect(nextCalled).toBe(true);
  return res.result.headers;
}

describe('security-headers middleware (item #24 — HTTP hardening)', () => {
  it('sets the core hardening headers with secure defaults', () => {
    const headers = run();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['content-security-policy']).toContain("default-src 'none'");
    expect(headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(headers['strict-transport-security']).toContain('includeSubDomains');
  });

  it('HSTS max-age + includeSubDomains are config-driven', () => {
    const headers = run({ hstsMaxAgeSeconds: 42, hstsIncludeSubDomains: false });
    expect(headers['strict-transport-security']).toBe('max-age=42');
  });

  it('CSP can be tuned or disabled via config', () => {
    expect(run({ contentSecurityPolicy: "default-src 'self'" })['content-security-policy']).toBe(
      "default-src 'self'",
    );
    expect(run({ contentSecurityPolicy: false })['content-security-policy']).toBeUndefined();
  });

  it('HSTS can be disabled (e.g. plain-HTTP self-host)', () => {
    expect(run({ hsts: false })['strict-transport-security']).toBeUndefined();
  });

  it('the whole layer can be turned off; still calls next()', () => {
    const headers = run({ enabled: false });
    expect(headers['x-content-type-options']).toBeUndefined();
    expect(headers['x-frame-options']).toBeUndefined();
  });

  it('resolveSecurityHeadersConfig merges partials over secure defaults', () => {
    const cfg = resolveSecurityHeadersConfig({ frameOptions: 'SAMEORIGIN' });
    expect(cfg.enabled).toBe(true);
    expect(cfg.noSniff).toBe(true);
    expect(cfg.frameOptions).toBe('SAMEORIGIN');
  });
});
