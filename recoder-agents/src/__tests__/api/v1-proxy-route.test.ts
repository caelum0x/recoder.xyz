import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { extractSessionTokenMock } = vi.hoisted(() => ({
  extractSessionTokenMock: vi.fn(),
}));

vi.mock('@recoder/auth/edge', () => ({
  extractSessionToken: extractSessionTokenMock,
}));

describe('v1 proxy route', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    extractSessionTokenMock.mockReturnValue('cookie-session-token');
    delete process.env.BACKEND_INTERNAL_URL;
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    delete process.env.BACKEND_URL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('proxies GET requests to the internal backend URL', async () => {
    process.env.BACKEND_INTERNAL_URL = 'http://backend.internal:8000/v1';
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { GET } = await import('@/app/v1/[...path]/route');
    const request = new NextRequest('http://localhost/v1/system/status?check=1', {
      headers: {
        authorization: 'Bearer explicit-token',
        cookie: 'session=abc',
      },
    });

    const response = await GET(request, {
      params: Promise.resolve({ path: ['system', 'status'] }),
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = init.headers as Headers;

    expect(url).toBe('http://backend.internal:8000/v1/system/status?check=1');
    expect(init.method).toBe('GET');
    expect(headers.get('authorization')).toBe('Bearer explicit-token');
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('x-forwarded-host')).toBe('localhost');
    expect(response.status).toBe(200);
    expect(response.headers.get('x-recoder-proxy')).toBe('agents-v1');
    expect(await response.json()).toEqual({ ok: true });
  });

  it('injects a bearer token from the session cookie when needed', async () => {
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://api.recoder.xyz/v1';
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('ok', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );

    const { GET } = await import('@/app/v1/[...path]/route');
    const request = new NextRequest('http://localhost/v1/accounts');

    await GET(request, {
      params: Promise.resolve({ path: ['accounts'] }),
    });

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = init.headers as Headers;

    expect(headers.get('authorization')).toBe('Bearer cookie-session-token');
  });

  it('does not proxy through NEXT_PUBLIC_BACKEND_URL when backend server envs are unset', async () => {
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://wrong-public.recoder.xyz/v1';
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { GET } = await import('@/app/v1/[...path]/route');
    const request = new NextRequest('http://localhost/v1/system/status');

    await GET(request, {
      params: Promise.resolve({ path: ['system', 'status'] }),
    });

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.recoder.xyz/v1/system/status');
  });

  it('forwards POST bodies without buffering them into JSON', async () => {
    process.env.BACKEND_INTERNAL_URL = 'http://backend.internal:8000/v1';
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ started: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { POST } = await import('@/app/v1/[...path]/route');
    const request = new NextRequest('http://localhost/v1/agent/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'hello' }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ path: ['agent', 'start'] }),
    });

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = init.headers as Headers;
    const bodyText = await new Response(init.body as BodyInit).text();

    expect(url).toBe('http://backend.internal:8000/v1/agent/start');
    expect(init.method).toBe('POST');
    expect(init.duplex).toBe('half');
    expect(headers.get('content-type')).toBe('application/json');
    expect(bodyText).toBe(JSON.stringify({ prompt: 'hello' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ started: true });
  });

  it('returns 502 when the upstream request throws', async () => {
    process.env.BACKEND_INTERNAL_URL = 'http://backend.internal:8000/v1';
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));

    const { GET } = await import('@/app/v1/[...path]/route');
    const request = new NextRequest('http://localhost/v1/health');

    const response = await GET(request, {
      params: Promise.resolve({ path: ['health'] }),
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'connect ECONNREFUSED' });
  });
});
