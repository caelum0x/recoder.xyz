import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalFetch = globalThis.fetch;

describe('POST /monitoring', () => {
  const originalEnv = process.env.NEXT_PUBLIC_SENTRY_DSN;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv) {
      process.env.NEXT_PUBLIC_SENTRY_DSN = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    }
  });

  it('returns 500 when Sentry DSN is not configured', async () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

    const { POST } = await import('@/app/monitoring/route');

    const request = new Request('http://localhost/monitoring', {
      method: 'POST',
      body: '{}',
    });

    const response = await POST(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain('not configured');
  });

  it('rejects envelope with mismatched Sentry hostname', async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      'https://abc123@o123456.ingest.sentry.io/654321';

    const { POST } = await import('@/app/monitoring/route');

    const envelope = JSON.stringify({
      dsn: 'https://abc123@evil.sentry.io/654321',
    });

    const request = new Request('http://localhost/monitoring', {
      method: 'POST',
      body: `${envelope}\n{}`,
    });

    const response = await POST(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain('error tunneling');
  });

  it('rejects envelope with mismatched Sentry project ID', async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      'https://abc123@o123456.ingest.sentry.io/654321';

    const { POST } = await import('@/app/monitoring/route');

    const envelope = JSON.stringify({
      dsn: 'https://abc123@o123456.ingest.sentry.io/999999',
    });

    const request = new Request('http://localhost/monitoring', {
      method: 'POST',
      body: `${envelope}\n{}`,
    });

    const response = await POST(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain('error tunneling');
  });

  it('forwards valid envelope to Sentry upstream', async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      'https://abc123@o123456.ingest.sentry.io/654321';

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('', { status: 200 })
    );

    const { POST } = await import('@/app/monitoring/route');

    const envelope = JSON.stringify({
      dsn: 'https://abc123@o123456.ingest.sentry.io/654321',
    });

    const request = new Request('http://localhost/monitoring', {
      method: 'POST',
      body: `${envelope}\n{"type":"event"}`,
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://o123456.ingest.sentry.io/api/654321/envelope/',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
