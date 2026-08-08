import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/crypto', () => ({ encryptApiKey: vi.fn((k: string) => `enc(${k})`) }));
vi.mock('@/lib/prisma', () => ({ prisma: { users: { update: vi.fn(async () => ({})) } } }));
vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: vi.fn(async () => ({ user: { id: 'u1' } })),
  ensureAppUserFromAuthUser: vi.fn(async () => ({ id: 'u1' })),
}));

import { prisma } from '@/lib/prisma';
import { POST } from '../route';

const postReq = (body: unknown) =>
  new Request('http://localhost/api/user/api-key', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;

describe('POST /api/user/api-key — BYOK key is encrypted at rest (recoder-lmtn)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores the ENCRYPTED key + flag, never the plaintext', async () => {
    const res = await POST(postReq({ apiKey: 'sk-or-secret' }));
    expect(res.status).toBe(200);
    const data = (prisma.users.update as any).mock.calls[0][0].data;
    expect(data.openRouterApiKey).not.toBe('sk-or-secret'); // no plaintext at rest
    expect(data.openRouterApiKey).toBe('enc(sk-or-secret)');
    expect(data.apiKeyEncrypted).toBe('encrypted');
    expect(data.hasOwnApiKey).toBe(true);
  });
});
