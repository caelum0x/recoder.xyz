import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetSession = vi.fn();
const mockVerifyInternalServiceRequest = vi.fn();
const mockSessionsFindFirst = vi.fn();
const mockSessionFindFirst = vi.fn();

vi.mock('@/lib/auth-config', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

vi.mock('@/lib/internal-service-auth', () => ({
  verifyInternalServiceRequest: (...args: unknown[]) => mockVerifyInternalServiceRequest(...args),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    sessions: {
      findFirst: (...args: unknown[]) => mockSessionsFindFirst(...args),
    },
    session: {
      findFirst: (...args: unknown[]) => mockSessionFindFirst(...args),
    },
  },
}));

function makeRequest(body: unknown = { token: 'test-token' }): NextRequest {
  return new NextRequest('https://recoder.xyz/api/auth/verify-token', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/verify-token', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockVerifyInternalServiceRequest.mockReturnValue({ ok: true });
    mockGetSession.mockResolvedValue(null);
    mockSessionsFindFirst.mockResolvedValue(null);
    mockSessionFindFirst.mockResolvedValue(null);
  });

  it('returns the Better Auth session when available', async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        image: null,
      },
      session: {
        id: 'session-1',
      },
    });

    const { POST } = await import('@/app/api/auth/verify-token/route');
    const response = await POST(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      success: true,
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        image: null,
      },
    });
    expect(mockSessionsFindFirst).not.toHaveBeenCalled();
    expect(mockSessionFindFirst).not.toHaveBeenCalled();
  });

  it('falls back to the primary sessions table when Better Auth misses', async () => {
    mockSessionsFindFirst.mockResolvedValue({
      userId: 'user-1',
      expiresAt: new Date('2026-04-04T00:00:00.000Z'),
      users: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        image: null,
      },
    });

    const { POST } = await import('@/app/api/auth/verify-token/route');
    const response = await POST(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      success: true,
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        image: null,
      },
    });
    expect(mockSessionsFindFirst).toHaveBeenCalledTimes(1);
    expect(mockSessionFindFirst).not.toHaveBeenCalled();
  });

  it('falls back to the legacy session table when needed', async () => {
    mockSessionFindFirst.mockResolvedValue({
      userId: 'legacy-user',
      expiresAt: new Date('2026-04-04T00:00:00.000Z'),
      user: {
        id: 'legacy-user',
        email: 'legacy@example.com',
        name: 'Legacy User',
        image: null,
      },
    });

    const { POST } = await import('@/app/api/auth/verify-token/route');
    const response = await POST(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      success: true,
      user: {
        id: 'legacy-user',
        email: 'legacy@example.com',
        name: 'Legacy User',
        image: null,
      },
    });
    expect(mockSessionsFindFirst).toHaveBeenCalledTimes(1);
    expect(mockSessionFindFirst).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when the token cannot be resolved', async () => {
    const { POST } = await import('@/app/api/auth/verify-token/route');
    const response = await POST(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: 'Invalid or expired token' });
  });
});
