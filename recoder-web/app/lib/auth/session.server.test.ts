import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.stubGlobal('fetch', mockFetch);

import { verifySession } from './session.server';

function makeRequest(headers?: Record<string, string>): Request {
  const req = new Request('https://web.recoder.xyz/') as Request;
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      req.headers.set(key, value);
    }
  }
  return req;
}

describe('verifySession', () => {
  const env = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...env,
      NODE_ENV: 'production',
      MAIN_SITE_URL: 'https://recoder.xyz',
      MAIN_SITE_INTERNAL_URL: 'http://host.docker.internal:3000',
    };
  });

  it('returns null when the request has no cookies', async () => {
    await expect(verifySession(makeRequest())).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('falls back to the public main site when the internal URL fetch fails', async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'user-123',
            email: 'user@example.com',
            name: 'User',
            image: null,
            subscriptionPlan: 'pro',
            subscriptionStatus: 'active',
          },
          session: {
            id: 'session-123',
            expiresAt: '2026-04-30T00:00:00.000Z',
          },
        }),
      });

    const result = await verifySession(
      makeRequest({
        Cookie: '__Secure-recoder.session_token=token-123',
      }),
    );

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'http://host.docker.internal:3000/api/auth/session',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
          Cookie: '__Secure-recoder.session_token=token-123',
        }),
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://recoder.xyz/api/auth/session',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(result).toEqual({
      user: {
        id: 'user-123',
        email: 'user@example.com',
        name: 'User',
        image: null,
        subscriptionPlan: 'pro',
        subscriptionStatus: 'active',
      },
      sessionId: 'session-123',
      expiresAt: new Date('2026-04-30T00:00:00.000Z'),
    });
  });
});
