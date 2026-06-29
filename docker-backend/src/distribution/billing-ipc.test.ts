/**
 * Tests for the recoder-billing IPC connect seam.
 *
 * Drive the REAL `billingIpc*` helpers against a stubbed `globalThis.fetch` (the
 * ONLY external IO), asserting the degrade-safe contract: connects only when
 * `BILLING_BASE_URL` is set, probes the py engine's `/health`, refuses to
 * `invoke` without an `INTERNAL_SERVICE_KEY`, and never throws / never fabricates
 * a healthy result.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  billingBaseUrl,
  billingIpcAvailability,
  billingIpcHealth,
  billingIpcInvoke,
} from './billing-ipc.js';

const URL_KEY = 'BILLING_BASE_URL';
const KEY_KEY = 'INTERNAL_SERVICE_KEY';
const originalUrl = process.env[URL_KEY];
const originalKey = process.env[KEY_KEY];

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  setEnv(URL_KEY, undefined);
  setEnv(KEY_KEY, undefined);
});

afterEach(() => {
  setEnv(URL_KEY, originalUrl);
  setEnv(KEY_KEY, originalKey);
  vi.unstubAllGlobals();
});

describe('billingBaseUrl / availability', () => {
  it('is unavailable when BILLING_BASE_URL is unset', () => {
    expect(billingBaseUrl()).toBeUndefined();
    expect(billingIpcAvailability()).toEqual({ available: false, authorized: false });
  });

  it('reports available + authorized and strips a trailing slash', () => {
    setEnv(URL_KEY, 'http://billing:9100/');
    setEnv(KEY_KEY, 'svc-key');
    expect(billingBaseUrl()).toBe('http://billing:9100');
    expect(billingIpcAvailability()).toEqual({
      available: true,
      url: 'http://billing:9100',
      authorized: true,
    });
  });
});

describe('billingIpcHealth — degrade-safe', () => {
  it('reports not-available without a network call when the URL is unset', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const health = await billingIpcHealth();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(health).toEqual({ available: false, healthy: false, reason: 'BILLING_BASE_URL not set' });
  });

  it('reports healthy on a 200 {healthy:true}', async () => {
    setEnv(URL_KEY, 'http://billing:9100');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ status: 'ok', healthy: true })),
    );
    const health = await billingIpcHealth();
    expect(health).toEqual({ available: true, healthy: true, status: 'ok' });
  });

  it('reports not-healthy on a 503 unhealthy body (never throws)', async () => {
    setEnv(URL_KEY, 'http://billing:9100');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ status: 'unhealthy', healthy: false }, 503)),
    );
    const health = await billingIpcHealth();
    expect(health.available).toBe(true);
    expect(health.healthy).toBe(false);
    expect(health.status).toBe('unhealthy');
  });

  it('degrades to not-healthy on a transport error', async () => {
    setEnv(URL_KEY, 'http://billing:9100');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const health = await billingIpcHealth();
    expect(health.healthy).toBe(false);
    expect(health.reason).toMatch(/ECONNREFUSED/);
  });
});

describe('billingIpcInvoke — authorization', () => {
  it('refuses without a network call when the URL is unset', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await billingIpcInvoke({ envelope: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/BILLING_BASE_URL/);
  });

  it('refuses without a network call when INTERNAL_SERVICE_KEY is unset', async () => {
    setEnv(URL_KEY, 'http://billing:9100');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await billingIpcInvoke({ envelope: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/INTERNAL_SERVICE_KEY/);
  });

  it('posts the envelope with the service-key header and returns the body on 200', async () => {
    setEnv(URL_KEY, 'http://billing:9100');
    setEnv(KEY_KEY, 'svc-key');
    const fetchSpy = vi.fn(async () => jsonResponse({ ok: true, result: 42 }));
    vi.stubGlobal('fetch', fetchSpy);
    const result = await billingIpcInvoke({ operation: 'checkout.create' });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ ok: true, result: 42 });
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-internal-service-key']).toBe('svc-key');
  });

  it('reports the HTTP status on a non-2xx (e.g. 401 unauthorized)', async () => {
    setEnv(URL_KEY, 'http://billing:9100');
    setEnv(KEY_KEY, 'svc-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'unauthorized' }, 401)),
    );
    const result = await billingIpcInvoke({ operation: 'x' });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });
});
