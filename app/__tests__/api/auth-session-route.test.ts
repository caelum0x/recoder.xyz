import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetSession = vi.fn();

vi.mock('@/lib/auth-helpers', () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function makeRequest(): NextRequest {
  return new NextRequest('https://recoder.xyz/api/auth/session');
}

describe('GET /api/auth/session', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockGetSession.mockResolvedValue(null);
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
        expiresAt: '2026-04-04T00:00:00.000Z',
      },
    });

    const { GET } = await import('@/app/api/auth/session/route');
    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        image: null,
        subscriptionPlan: 'free',
        subscriptionStatus: 'active',
      },
      session: {
        id: 'session-1',
        expiresAt: '2026-04-04T00:00:00.000Z',
      },
    });
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it('returns a compatibility session resolved by the shared seam', async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        image: null,
      },
      expires: '2026-04-04T00:00:00.000Z',
      session: { id: 'session-db-1', expiresAt: '2026-04-04T00:00:00.000Z' },
    });

    const { GET } = await import('@/app/api/auth/session/route');
    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        image: null,
        subscriptionPlan: 'free',
        subscriptionStatus: 'active',
      },
      session: {
        id: 'session-db-1',
        expiresAt: '2026-04-04T00:00:00.000Z',
      },
    });
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it('returns a null user when neither session path succeeds', async () => {
    const { GET } = await import('@/app/api/auth/session/route');
    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ user: null });
  });
});
