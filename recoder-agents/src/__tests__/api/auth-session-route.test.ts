import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock runtime-urls before importing the route
vi.mock('@/lib/runtime-urls', () => ({
  resolveAuthBaseUrl: vi.fn(() => 'https://auth.test.local'),
}));

// Keep a reference to the original fetch so we can restore it
const originalFetch = globalThis.fetch;

describe('GET /api/auth/session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns session data for authenticated user', async () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      emailVerified: true,
      name: 'Test User',
      image: 'https://example.com/avatar.png',
    };

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: mockUser }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { GET } = await import('@/app/api/auth/session/route');

    const request = new NextRequest('http://localhost/api/auth/session', {
      headers: { cookie: 'session_token=abc123' },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.user).toEqual({
      id: 'user-123',
      email: 'test@example.com',
      emailVerified: true,
      name: 'Test User',
      image: 'https://example.com/avatar.png',
    });

    // Verify fetch was called with the correct auth URL and cookie forwarding
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://auth.test.local/api/auth/session',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          cookie: 'session_token=abc123',
        }),
        cache: 'no-store',
      }),
    );
  });

  it('returns null user when no cookies are present', async () => {
    globalThis.fetch = vi.fn();

    const { GET } = await import('@/app/api/auth/session/route');

    const request = new NextRequest('http://localhost/api/auth/session');
    // No cookie header

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.user).toBeNull();
    // Fetch should NOT be called when there are no cookies
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns the session_data cookie user without calling the auth service', async () => {
    globalThis.fetch = vi.fn();

    const { GET } = await import('@/app/api/auth/session/route');
    const cookiePayload = Buffer.from(JSON.stringify({
      session: {
        user: {
          id: 'cookie-user-123',
          email: 'cookie@example.com',
          name: 'Cookie User',
          imageUrl: 'https://example.com/cookie.png',
        },
      },
    })).toString('base64url');

    const request = new NextRequest('http://localhost/api/auth/session', {
      headers: { cookie: `_Secure-recoder.session_data=${cookiePayload}` },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.user).toEqual({
      id: 'cookie-user-123',
      email: 'cookie@example.com',
      emailVerified: true,
      name: 'Cookie User',
      image: 'https://example.com/cookie.png',
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns null user when upstream returns non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { GET } = await import('@/app/api/auth/session/route');

    const request = new NextRequest('http://localhost/api/auth/session', {
      headers: { cookie: 'session_token=expired' },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.user).toBeNull();
  });

  it('returns null user when upstream payload has no user', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { GET } = await import('@/app/api/auth/session/route');

    const request = new NextRequest('http://localhost/api/auth/session', {
      headers: { cookie: 'session_token=abc' },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.user).toBeNull();
  });

  it('handles backend service unavailability gracefully', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const { GET } = await import('@/app/api/auth/session/route');

    const request = new NextRequest('http://localhost/api/auth/session', {
      headers: { cookie: 'session_token=abc123' },
    });

    const response = await GET(request);
    const body = await response.json();

    // Should return null user instead of throwing
    expect(response.status).toBe(200);
    expect(body.data.user).toBeNull();
  });

  it('defaults emailVerified to true and optional fields to null when not provided', async () => {
    const mockUser = {
      id: 'user-456',
      email: 'minimal@example.com',
      // emailVerified, name, image are omitted
    };

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: mockUser }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { GET } = await import('@/app/api/auth/session/route');

    const request = new NextRequest('http://localhost/api/auth/session', {
      headers: { cookie: 'session_token=abc' },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(body.data.user).toEqual({
      id: 'user-456',
      email: 'minimal@example.com',
      emailVerified: true,
      name: null,
      image: null,
    });
  });
});
