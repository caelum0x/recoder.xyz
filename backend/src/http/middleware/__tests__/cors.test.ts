import { describe, it, expect } from 'vitest';
import { corsMiddleware } from '../cors.js';
import { mockReq, mockRes } from './_mock.js';

const cfg = { origins: ['https://app.recoder.xyz', '.recoder.xyz'], allowCredentials: true } as const;

describe('cors — origin allowlist + credentialed cross-subdomain', () => {
  it('echoes an exactly-allowlisted origin with credentials', () => {
    const req = mockReq({ headers: { origin: 'https://app.recoder.xyz' } });
    const res = mockRes();
    corsMiddleware(cfg)(req, res, () => {});
    expect(res.result.headers['access-control-allow-origin']).toBe('https://app.recoder.xyz');
    expect(res.result.headers['access-control-allow-credentials']).toBe('true');
    expect(res.result.headers['vary']).toBe('Origin');
  });

  it('allows any subdomain via a leading-dot suffix entry', () => {
    const req = mockReq({ headers: { origin: 'https://cockpit.recoder.xyz' } });
    const res = mockRes();
    corsMiddleware(cfg)(req, res, () => {});
    expect(res.result.headers['access-control-allow-origin']).toBe('https://cockpit.recoder.xyz');
  });

  it('sets NO allow-origin header for a non-allowlisted origin', () => {
    const req = mockReq({ headers: { origin: 'https://evil.example.com' } });
    const res = mockRes();
    let called = false;
    corsMiddleware(cfg)(req, res, () => {
      called = true;
    });
    expect(res.result.headers['access-control-allow-origin']).toBeUndefined();
    expect(called).toBe(true);
  });

  it('short-circuits preflight OPTIONS with 204 + method/header allowlists', () => {
    const req = mockReq({ method: 'OPTIONS', headers: { origin: 'https://app.recoder.xyz' } });
    const res = mockRes();
    let called = false;
    corsMiddleware(cfg)(req, res, () => {
      called = true;
    });
    expect(called).toBe(false);
    expect(res.result.statusCode).toBe(204);
    expect(res.result.ended).toBe(true);
    expect(res.result.headers['access-control-allow-methods']).toContain('POST');
  });
});
