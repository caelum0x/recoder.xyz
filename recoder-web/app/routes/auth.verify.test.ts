import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loader } from './auth.verify';

function getStatus(response: any): number {
  return response?.init?.status ?? response?.status ?? 200;
}

describe('auth.verify route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.INTERNAL_SERVICE_KEY;
    delete process.env.MAIN_SITE_URL;
  });

  it('returns 401 when token is missing', async () => {
    const request = new Request('http://localhost/auth/verify');
    const response = await loader({ request, context: {} as any, params: {} } as any);

    expect(getStatus(response)).toBe(401);
  });

  it('returns 500 when internal service key is not configured', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const request = new Request('http://localhost/auth/verify?token=test-token');
    const response = await loader({ request, context: {} as any, params: {} } as any);

    expect(getStatus(response)).toBe(500);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends signed internal headers when verifying token', async () => {
    process.env.INTERNAL_SERVICE_KEY = 'internal-key-test';
    process.env.MAIN_SITE_URL = 'http://main-site.local';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, user: { id: 'u1' } }),
    } as Response);
    vi.stubGlobal('fetch', mockFetch);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('nonce-fixed-123' as `${string}-${string}-${string}-${string}-${string}`);

    const request = new Request('http://localhost/auth/verify?token=test-token');
    const response = await loader({ request, context: {} as any, params: {} } as any);

    expect(getStatus(response)).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe('http://main-site.local/api/auth/verify-token');

    const options = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = options.headers as Record<string, string>;
    expect(options.method).toBe('POST');
    expect(headers['x-internal-service-key']).toBe('internal-key-test');
    expect(headers['x-internal-timestamp']).toBeTruthy();
    expect(headers['x-internal-nonce']).toBe('nonce-fixed-123');
    expect(headers['x-internal-signature']).toMatch(/^[a-f0-9]{64}$/);
  });

  it('normalizes cookie-pair token format before forwarding upstream', async () => {
    process.env.INTERNAL_SERVICE_KEY = 'internal-key-test';
    process.env.MAIN_SITE_URL = 'http://main-site.local';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, user: { id: 'u1' } }),
    } as Response);
    vi.stubGlobal('fetch', mockFetch);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('nonce-fixed-456' as `${string}-${string}-${string}-${string}-${string}`);

    const tokenPair = encodeURIComponent('__Secure-recoder.session_token=abc.def.ghi');
    const request = new Request(`http://localhost/auth/verify?token=${tokenPair}`);
    const response = await loader({ request, context: {} as any, params: {} } as any);

    expect(getStatus(response)).toBe(200);
    const options = mockFetch.mock.calls[0][1] as RequestInit;
    expect(options.body).toBe(JSON.stringify({ token: 'abc.def.ghi' }));
  });

});
