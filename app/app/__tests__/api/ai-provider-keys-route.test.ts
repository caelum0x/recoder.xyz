// @vitest-environment node
/**
 * AI Provider Keys Route Tests
 * Tests GET, POST, DELETE /api/user/ai-provider-keys
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies before importing route
vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: vi.fn(),
  ensureAppUserFromAuthUser: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    users: {
      findUnique: vi.fn(),
    },
    user_api_keys: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((text: string) => `encrypted:${text}`),
  decrypt: vi.fn((text: string) => text.replace('encrypted:', '')),
  maskApiKey: vi.fn((key: string) => `${key.slice(0, 8)}...`),
  validateApiKeyFormat: vi.fn((key: string, provider: string) => {
    if (provider === 'openai') return key.startsWith('sk-');
    if (provider === 'anthropic') return key.startsWith('sk-ant-');
    return true;
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/internal-service-auth', () => ({
  verifyInternalServiceRequest: vi.fn(() => ({ ok: false })),
}));

import { GET, POST, DELETE } from '@/app/api/user/ai-provider-keys/route';
import { requireAuth, ensureAppUserFromAuthUser } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { validateApiKeyFormat } from '@/lib/encryption';

const mockRequireAuth = vi.mocked(requireAuth);
const mockEnsureAppUser = vi.mocked(ensureAppUserFromAuthUser);
const mockPrisma = vi.mocked(prisma);
const mockValidateFormat = vi.mocked(validateApiKeyFormat);

function buildGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/user/ai-provider-keys', {
    method: 'GET',
  });
}

function buildPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/user/ai-provider-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function buildDeleteRequest(keyId?: string): NextRequest {
  const url = keyId
    ? `http://localhost/api/user/ai-provider-keys?id=${keyId}`
    : 'http://localhost/api/user/ai-provider-keys';
  return new NextRequest(url, { method: 'DELETE' });
}

describe('GET /api/user/ai-provider-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRequireAuth.mockResolvedValue({
      error: true,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    } as any);

    const res = await GET(buildGetRequest());

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 404 when app user is not found', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'auth-user-1', email: 'test@example.com' },
    } as any);
    mockEnsureAppUser.mockResolvedValue(null);

    const res = await GET(buildGetRequest());

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('User not found');
  });

  it('returns user API keys (masked, not raw)', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'auth-user-1', email: 'test@example.com' },
    } as any);
    mockEnsureAppUser.mockResolvedValue({
      id: 'app-user-1',
      email: 'test@example.com',
    } as any);

    const mockKeys = [
      {
        id: 'key-1',
        provider: 'openai',
        name: 'OpenAI Key',
        keyPrefix: 'sk-abc1...',
        lastUsed: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
      {
        id: 'key-2',
        provider: 'anthropic',
        name: 'Anthropic Key',
        keyPrefix: 'sk-ant-...',
        lastUsed: new Date('2026-03-01'),
        createdAt: new Date('2026-02-01'),
        updatedAt: new Date('2026-03-01'),
      },
    ];

    mockPrisma.user_api_keys.findMany.mockResolvedValue(mockKeys as any);

    const res = await GET(buildGetRequest());

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.keys).toHaveLength(2);
    expect(data.keys[0].provider).toBe('openai');
    expect(data.keys[0].keyPrefix).toBe('sk-abc1...');
    // Ensure no raw key data is returned
    expect(data.keys[0]).not.toHaveProperty('encryptedKey');

    // Verify query filters active keys for the correct user
    expect(mockPrisma.user_api_keys.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'app-user-1',
          isActive: true,
        },
      })
    );
  });
});

describe('POST /api/user/ai-provider-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateFormat.mockReturnValue(true);
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRequireAuth.mockResolvedValue({
      error: true,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    } as any);

    const res = await POST(buildPostRequest({ provider: 'openai', apiKey: 'sk-test123' }));

    expect(res.status).toBe(401);
  });

  it('returns 400 when provider is missing', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'auth-user-1', email: 'test@example.com' },
    } as any);
    mockEnsureAppUser.mockResolvedValue({
      id: 'app-user-1',
      email: 'test@example.com',
    } as any);

    const res = await POST(buildPostRequest({ apiKey: 'sk-test123' }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('required');
  });

  it('returns 400 when apiKey is missing', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'auth-user-1', email: 'test@example.com' },
    } as any);
    mockEnsureAppUser.mockResolvedValue({
      id: 'app-user-1',
      email: 'test@example.com',
    } as any);

    const res = await POST(buildPostRequest({ provider: 'openai' }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('required');
  });

  it('returns 400 for invalid API key format', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'auth-user-1', email: 'test@example.com' },
    } as any);
    mockEnsureAppUser.mockResolvedValue({
      id: 'app-user-1',
      email: 'test@example.com',
    } as any);
    mockValidateFormat.mockReturnValue(false);

    const res = await POST(buildPostRequest({ provider: 'openai', apiKey: 'invalid-key' }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid API key format');
  });

  it('adds a new API key successfully', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'auth-user-1', email: 'test@example.com' },
    } as any);
    mockEnsureAppUser.mockResolvedValue({
      id: 'app-user-1',
      email: 'test@example.com',
    } as any);

    // No existing key for this provider
    mockPrisma.user_api_keys.findFirst.mockResolvedValue(null);

    const createdKey = {
      id: 'new-key-1',
      provider: 'openai',
      name: 'OpenAI API Key',
      keyPrefix: 'sk-test1...',
      createdAt: new Date('2026-03-06'),
    };
    mockPrisma.user_api_keys.create.mockResolvedValue(createdKey as any);

    const res = await POST(buildPostRequest({
      provider: 'openai',
      apiKey: 'sk-test123456',
      name: 'My OpenAI Key',
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain('added');
    expect(data.key.provider).toBe('openai');

    // Verify the key was created with encrypted data
    expect(mockPrisma.user_api_keys.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'app-user-1',
          provider: 'openai',
          encryptedKey: expect.any(String),
          isActive: true,
        }),
      })
    );
  });

  it('updates existing key for the same provider instead of creating duplicate', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'auth-user-1', email: 'test@example.com' },
    } as any);
    mockEnsureAppUser.mockResolvedValue({
      id: 'app-user-1',
      email: 'test@example.com',
    } as any);

    // Existing key for this provider
    mockPrisma.user_api_keys.findFirst.mockResolvedValue({
      id: 'existing-key-1',
      provider: 'openai',
      name: 'Old Key',
      userId: 'app-user-1',
    } as any);

    const updatedKey = {
      id: 'existing-key-1',
      provider: 'openai',
      name: 'Updated Key',
      keyPrefix: 'sk-newk...',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-03-06'),
    };
    mockPrisma.user_api_keys.update.mockResolvedValue(updatedKey as any);

    const res = await POST(buildPostRequest({
      provider: 'openai',
      apiKey: 'sk-newkey789',
      name: 'Updated Key',
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain('updated');

    // Verify update was called instead of create
    expect(mockPrisma.user_api_keys.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing-key-1' },
        data: expect.objectContaining({
          encryptedKey: expect.any(String),
        }),
      })
    );
    expect(mockPrisma.user_api_keys.create).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/user/ai-provider-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRequireAuth.mockResolvedValue({
      error: true,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    } as any);

    const res = await DELETE(buildDeleteRequest('key-1'));

    expect(res.status).toBe(401);
  });

  it('returns 400 when key ID is missing', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'auth-user-1', email: 'test@example.com' },
    } as any);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'app-user-1',
    } as any);

    const res = await DELETE(buildDeleteRequest());

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('required');
  });

  it('returns 404 when key does not belong to user', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'auth-user-1', email: 'test@example.com' },
    } as any);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'app-user-1',
    } as any);
    mockPrisma.user_api_keys.findFirst.mockResolvedValue(null);

    const res = await DELETE(buildDeleteRequest('nonexistent-key'));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('not found');
  });

  it('soft-deletes an API key successfully', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'auth-user-1', email: 'test@example.com' },
    } as any);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'app-user-1',
    } as any);
    mockPrisma.user_api_keys.findFirst.mockResolvedValue({
      id: 'key-1',
      userId: 'app-user-1',
      provider: 'openai',
    } as any);
    mockPrisma.user_api_keys.update.mockResolvedValue({} as any);

    const res = await DELETE(buildDeleteRequest('key-1'));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain('deleted');

    // Verify soft delete (isActive: false) instead of hard delete
    expect(mockPrisma.user_api_keys.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'key-1' },
        data: { isActive: false },
      })
    );
  });

  it('returns 404 when app user is not found in database', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'auth-user-1', email: 'test@example.com' },
    } as any);
    mockPrisma.users.findUnique.mockResolvedValue(null);

    const res = await DELETE(buildDeleteRequest('key-1'));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('User not found');
  });
});
