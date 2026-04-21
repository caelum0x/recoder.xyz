import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loader } from '../../app/routes/auth.verify';

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.stubGlobal('fetch', mockFetch);

describe('auth.verify loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_SERVICE_KEY = 'test-internal-key';
    process.env.MAIN_SITE_INTERNAL_URL = 'https://recoder.xyz';
  });

  it('sets a web session bridge cookie and redirects to the requested path', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        user: {
          id: 'user-123',
          email: 'user@example.com',
          name: 'User Example',
          subscriptionPlan: 'pro',
          subscriptionStatus: 'active',
        },
      }),
    });

    const response = await loader({
      request: new Request('https://web.recoder.xyz/auth/verify?token=test-token&redirect=/'),
      context: { cloudflare: {} } as any,
      params: {},
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://web.recoder.xyz/');
    expect(response.headers.get('Set-Cookie')).toContain('__Secure-recoder.web_session_data=');
    expect(response.headers.get('Set-Cookie')).toContain('HttpOnly');
  });

  it('falls back to the web root when redirect is missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        user: {
          id: 'user-123',
          email: 'user@example.com',
        },
      }),
    });

    const response = await loader({
      request: new Request('https://web.recoder.xyz/auth/verify?token=test-token'),
      context: { cloudflare: {} } as any,
      params: {},
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://web.recoder.xyz/');
    expect(response.headers.get('Set-Cookie')).toContain('__Secure-recoder.web_session_data=');
  });

  it('accepts https redirect targets behind a forwarded proxy origin', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        user: {
          id: 'user-123',
          email: 'user@example.com',
        },
      }),
    });

    const response = await loader({
      request: new Request(
        'http://internal-web/auth/verify?token=test-token&redirect=https%3A%2F%2Fweb.recoder.xyz',
        {
          headers: {
            'x-forwarded-proto': 'https',
            'x-forwarded-host': 'web.recoder.xyz',
          },
        },
      ),
      context: { cloudflare: {} } as any,
      params: {},
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://web.recoder.xyz/');
  });
});
