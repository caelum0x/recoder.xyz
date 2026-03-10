import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track deleted cookies
const deletedCookies: string[] = [];

// Mock next/headers cookies()
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    delete: vi.fn((name: string) => {
      deletedCookies.push(name);
    }),
    get: vi.fn(() => undefined),
  }),
}));

// Mock @recoder/auth/edge to provide SESSION_COOKIE_NAMES
vi.mock('@recoder/auth/edge', () => ({
  SESSION_COOKIE_NAMES: [
    'better-auth.session_token',
    'better-auth.session_data',
    '__Secure-better-auth.session_token',
  ],
}));

describe('POST /api/auth/sign-out', () => {
  beforeEach(() => {
    deletedCookies.length = 0;
    vi.clearAllMocks();
  });

  it('clears all session cookies', async () => {
    const { POST } = await import('@/app/api/auth/sign-out/route');

    const response = await POST();
    const body = await response.json();

    expect(body.success).toBe(true);

    // Verify all session cookie names were deleted
    expect(deletedCookies).toContain('better-auth.session_token');
    expect(deletedCookies).toContain('better-auth.session_data');
    expect(deletedCookies).toContain('__Secure-better-auth.session_token');
    expect(deletedCookies).toHaveLength(3);
  });

  it('returns a JSON response with success true', async () => {
    const { POST } = await import('@/app/api/auth/sign-out/route');

    const response = await POST();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true });
  });

  it('handles already-signed-out state (no cookies to clear)', async () => {
    // Even if there are no cookies set, the route still iterates
    // SESSION_COOKIE_NAMES and calls delete — this should not throw.
    const { POST } = await import('@/app/api/auth/sign-out/route');

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    // delete is still called for each name even if the cookie doesn't exist
    expect(deletedCookies).toHaveLength(3);
  });
});
