/**
 * /api/user/ai-provider-keys/decrypt returns a DECRYPTED BYOK provider key,
 * so it must be session-authenticated, scoped to the caller's own keys,
 * rate limited, and must never log the decrypted value.
 */

import { NextRequest, NextResponse } from 'next/server';

const mockRequireAuth = vi.fn();
const mockUsersFindUnique = vi.fn();
const mockKeysFindFirst = vi.fn();
const mockKeysUpdate = vi.fn();
const mockDecrypt = vi.fn();
const mockLoggerError = vi.fn();

vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    users: {
      findUnique: (...args: unknown[]) => mockUsersFindUnique(...args),
    },
    user_api_keys: {
      findFirst: (...args: unknown[]) => mockKeysFindFirst(...args),
      update: (...args: unknown[]) => mockKeysUpdate(...args),
    },
  },
}));

vi.mock('@/lib/encryption', () => ({
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: (...args: unknown[]) => mockLoggerError(...args),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

function req(url: string): NextRequest {
  return new NextRequest(url);
}

const ROUTE_URL = 'http://localhost/api/user/ai-provider-keys/decrypt?provider=openrouter';

describe('/api/user/ai-provider-keys/decrypt route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockRequireAuth.mockResolvedValue({
      error: true,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const { GET } = await import('@/app/api/user/ai-provider-keys/decrypt/route');
    const response = await GET(req(ROUTE_URL));
    expect(response.status).toBe(401);
    expect(mockKeysFindFirst).not.toHaveBeenCalled();
    expect(mockDecrypt).not.toHaveBeenCalled();
  });

  it('returns 404 when the session user has no app-database identity', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'web-1', email: 'ghost@example.com' },
    });
    mockUsersFindUnique.mockResolvedValue(null);

    const { GET } = await import('@/app/api/user/ai-provider-keys/decrypt/route');
    const response = await GET(req(ROUTE_URL));
    expect(response.status).toBe(404);
    expect(mockKeysFindFirst).not.toHaveBeenCalled();
  });

  it('scopes the key lookup to the session user (ownership) and never logs the key', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'web-1', email: 'owner@example.com' },
    });
    mockUsersFindUnique.mockResolvedValue({ id: 'app-user-1' });
    mockKeysFindFirst.mockResolvedValue({
      id: 'key-1',
      provider: 'openrouter',
      encryptedKey: 'ciphertext',
      lastUsed: null,
    });
    mockKeysUpdate.mockResolvedValue({});
    mockDecrypt.mockReturnValue('sk-or-decrypted-secret');

    const { GET } = await import('@/app/api/user/ai-provider-keys/decrypt/route');
    const response = await GET(req(ROUTE_URL));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.apiKey).toBe('sk-or-decrypted-secret');

    // Ownership: the query filter comes from the caller's own resolved app id,
    // never from request input, so another user's keys are unreachable.
    expect(mockKeysFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'app-user-1', provider: 'openrouter' }),
      })
    );

    // The decrypted key must never reach the logger.
    expect(JSON.stringify(mockLoggerError.mock.calls)).not.toContain('sk-or-decrypted-secret');
  });

  it('rate limits after 10 requests per identifier (429)', async () => {
    mockRequireAuth.mockResolvedValue({
      error: true,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const { GET } = await import('@/app/api/user/ai-provider-keys/decrypt/route');
    for (let i = 0; i < 10; i += 1) {
      const response = await GET(req(ROUTE_URL));
      expect(response.status).toBe(401);
    }
    const throttled = await GET(req(ROUTE_URL));
    expect(throttled.status).toBe(429);
  });
});
