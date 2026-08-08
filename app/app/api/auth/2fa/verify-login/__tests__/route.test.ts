import { describe, it, expect, vi, beforeEach } from 'vitest';

// The route mints a session only after BOTH factors pass. Mock the seams.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    users: { findUnique: vi.fn(), update: vi.fn(async () => ({})) },
    security_settings: { findUnique: vi.fn(), update: vi.fn(async () => ({})) },
    cli_sessions: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock('@/lib/crypto', () => ({ verifyPassword: vi.fn() }));
vi.mock('otplib', () => ({ authenticator: { verify: vi.fn(() => true) } }));
vi.mock('@/lib/api-key-resolver', () => ({ getApiKeyStatus: vi.fn(async () => ({})) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/middleware/rate-limit', () => ({
  rateLimit: () => async () => null, // never rate-limited in these tests
  rateLimitConfigs: { auth: {} },
}));

import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/crypto';
import { POST } from '../route';

function req(body: unknown) {
  return new Request('http://localhost/api/auth/2fa/verify-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

const user2fa = {
  id: 'user-1',
  email: 'v@x.com',
  name: 'v',
  password: 'HASH',
  subscription: 'free',
  quota: null,
};

describe('POST /api/auth/2fa/verify-login — first factor is enforced (recoder-7lhk)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.users.findUnique as any).mockResolvedValue(user2fa);
    (prisma.security_settings.findUnique as any).mockResolvedValue({
      userId: 'user-1', twoFactorEnabled: true, twoFactorSecret: 'S', backupCodes: null,
    });
  });

  it('rejects a valid TOTP with a WRONG password (401) and mints NO session', async () => {
    (verifyPassword as any).mockResolvedValue(false); // password check fails
    const res = await POST(req({ userId: 'user-1', code: '123456', password: 'wrong' }));
    expect(res.status).toBe(401);
    expect(prisma.cli_sessions.create).not.toHaveBeenCalled(); // no account takeover
  });

  it('rejects when the password is omitted entirely (400)', async () => {
    const res = await POST(req({ userId: 'user-1', code: '123456' }));
    expect(res.status).toBe(400);
    expect(prisma.cli_sessions.create).not.toHaveBeenCalled();
  });

  it('mints a session only when BOTH the password AND the TOTP are valid', async () => {
    (verifyPassword as any).mockResolvedValue(true);
    const res = await POST(req({ userId: 'user-1', code: '123456', password: 'correct' }));
    expect(res.status).toBe(200);
    expect(prisma.cli_sessions.create).toHaveBeenCalledTimes(1);
  });
});
