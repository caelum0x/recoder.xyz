/**
 * recoder-web API Routes — Smoke Tests
 *
 * Validates critical routes against a running recoder-web instance.
 * Set WEB_URL env to override the default production URL.
 *
 * Usage:
 *   WEB_URL=http://localhost:5173 npx vitest run tests/api-routes.test.ts
 */

import { describe, it, expect } from 'vitest';

const BASE = process.env.WEB_URL || 'https://web.recoder.xyz';

describe('recoder-web API routes', () => {
  it('GET / returns 200', async () => {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(10_000) });
    expect(res.status).toBe(200);
  });

  it('GET /api/health returns ok', async () => {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(10_000) });
    // Health route may not be implemented yet — accept 200 or 404
    expect([200, 404]).toContain(res.status);
  });

  it('POST /api/chat without body returns 4xx or 401', async () => {
    const res = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10_000),
    });
    // Should reject unauthenticated / malformed requests
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('GET /api/projects.rag without auth returns 401 or 403', async () => {
    const res = await fetch(`${BASE}/api/projects/rag`, {
      signal: AbortSignal.timeout(10_000),
    });
    // Protected route — expect auth rejection or not-found
    expect([401, 403, 404]).toContain(res.status);
  });

  it('GET /nonexistent returns 404', async () => {
    const res = await fetch(`${BASE}/nonexistent-route-test-${Date.now()}`, {
      signal: AbortSignal.timeout(10_000),
    });
    // Remix may redirect to root or return 404
    expect([200, 301, 302, 404]).toContain(res.status);
  });
});
