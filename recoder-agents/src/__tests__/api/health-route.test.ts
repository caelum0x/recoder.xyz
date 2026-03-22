import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('GET /api/health', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    // Mock fetch so that checkBackend and checkAuth both succeed
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    // Set env vars so the health checks actually run (otherwise they short-circuit to false)
    process.env.NEXT_PUBLIC_BACKEND_URL = 'http://localhost:3001';
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    delete process.env.BETTER_AUTH_URL;
  });

  it('returns 200 with status "ok"', async () => {
    const { GET } = await import('@/app/api/health/route');

    const response = await GET();

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  it('includes service name "recoder-agents"', async () => {
    const { GET } = await import('@/app/api/health/route');

    const response = await GET();
    const body = await response.json();

    expect(body.service).toBe('recoder-agents');
  });

  it('includes a valid ISO timestamp', async () => {
    const fixedDate = new Date('2026-03-06T12:00:00.000Z');
    vi.setSystemTime(fixedDate);

    const { GET } = await import('@/app/api/health/route');

    const response = await GET();
    const body = await response.json();

    expect(body.timestamp).toBe('2026-03-06T12:00:00.000Z');

    // Verify it's a valid ISO string
    const parsed = new Date(body.timestamp);
    expect(parsed.toISOString()).toBe(body.timestamp);
  });

  it('returns all expected fields in the response', async () => {
    const { GET } = await import('@/app/api/health/route');

    const response = await GET();
    const body = await response.json();

    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('service');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('node');
    expect(body).toHaveProperty('checks');
    expect(Object.keys(body)).toHaveLength(7);
  });

  it('returns 503 when backend and auth are unreachable', async () => {
    // Override fetch to simulate failure
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const { GET } = await import('@/app/api/health/route');

    const response = await GET();

    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.status).toBe('down');
  });
});
