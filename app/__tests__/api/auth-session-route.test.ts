import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetSession = vi.fn();
const mockHeaders = vi.fn();
const mockExtractSessionTokenFromHeader = vi.fn();
const mockFindFallbackSessionByToken = vi.fn();

vi.mock('@/lib/auth-config', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: (...args: unknown[]) => mockHeaders(...args),
}));

vi.mock('@recoder/auth', () => ({
  extractSessionTokenFromHeader: (...args: unknown[]) => mockExtractSessionTokenFromHeader(...args),
}));

vi.mock('@/lib/session-fallback', () => ({
  findFallbackSessionByToken: (...args: unknown[]) => mockFindFallbackSessionByToken(...args),
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

    mockHeaders.mockResolvedValue(new Headers({
      cookie: 'recoder.session_token=test-token',
      host: 'recoder.xyz',
    }));
    mockGetSession.mockResolvedValue(null);
    mockExtractSessionTokenFromHeader.mockReturnValue('test-token');
    mockFindFallbackSessionByToken.mockResolvedValue(null);
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
    expect(mockFindFallbackSessionByToken).not.toHaveBeenCalled();
  });

  it('falls back to DB-backed session verification when Better Auth misses', async () => {
    mockFindFallbackSessionByToken.mockResolvedValue({
      sessionId: 'session-db-1',
      userId: 'user-1',
      expiresAt: new Date('2026-04-04T00:00:00.000Z'),
      user: {
        id: 'user-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'User',
        image: null,
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-04-01T00:00:00.000Z'),
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
        id: 'session-db-1',
        expiresAt: '2026-04-04T00:00:00.000Z',
      },
    });
    expect(mockFindFallbackSessionByToken).toHaveBeenCalledTimes(1);
  });

  it('returns a null user when neither session path succeeds', async () => {
    const { GET } = await import('@/app/api/auth/session/route');
    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ user: null });
  });
});
