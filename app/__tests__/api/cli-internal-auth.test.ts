/**
 * /api/auth/cli-internal/* auth-gate tests.
 *
 * These handlers sit on the CLI auth-code / device-flow path, so every one of
 * them must reject requests that carry neither a valid signed
 * INTERNAL_SERVICE_KEY request nor the legitimate browser/CLI credential for
 * that handler (Better Auth session for the browser-called POSTs, the
 * RFC 8628 device_code bearer for the CLI-polled GET).
 *
 * The real `verifyInternalServiceRequest` implementation is exercised (not
 * mocked) so missing/forged internal headers are verified end to end.
 */

import { NextRequest, NextResponse } from 'next/server';

const mockRequireAuth = vi.fn();
const mockUsersFindUnique = vi.fn();
const mockUsersCreate = vi.fn();
const mockAuthCodeUpsert = vi.fn();
const mockAuthCodeDeleteMany = vi.fn();
const mockAuthCodeFindUnique = vi.fn();

vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock('@/lib/auth-config', () => ({
  auth: {},
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    users: {
      findUnique: (...args: unknown[]) => mockUsersFindUnique(...args),
      create: (...args: unknown[]) => mockUsersCreate(...args),
    },
    authCode: {
      upsert: (...args: unknown[]) => mockAuthCodeUpsert(...args),
      deleteMany: (...args: unknown[]) => mockAuthCodeDeleteMany(...args),
      findUnique: (...args: unknown[]) => mockAuthCodeFindUnique(...args),
    },
  },
}));

vi.mock('@/lib/device-flow-storage', () => ({
  getDeviceFlowRequestByUserCode: vi.fn().mockResolvedValue(null),
  getDeviceFlowRequest: vi.fn().mockResolvedValue(null),
  updateDeviceFlowRequest: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function unauthenticated() {
  mockRequireAuth.mockResolvedValue({
    error: true,
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  });
}

// Forged internal headers: right shape, wrong key/signature. The signature
// check must fail because the attacker does not know INTERNAL_SERVICE_KEY.
const FORGED_INTERNAL_HEADERS = {
  'x-internal-service-key': 'attacker-guessed-wrong-key-value',
  'x-internal-timestamp': String(Date.now()),
  'x-internal-nonce': 'forged-nonce-123',
  'x-internal-signature': 'deadbeef'.repeat(8),
};

describe('/api/auth/cli-internal auth gates', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.INTERNAL_SERVICE_KEY = 'test-internal-service-key-0123456789';
  });

  describe('set-user POST', () => {
    const body = JSON.stringify({
      code: 'auth-code-1',
      user_id: 'victim-user',
      user_email: 'victim@example.com',
    });

    it('returns 401 with no internal key and no session', async () => {
      unauthenticated();
      const { POST } = await import('@/app/api/auth/cli-internal/set-user/route');
      const response = await POST(
        new NextRequest('http://localhost/api/auth/cli-internal/set-user', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        })
      );
      expect(response.status).toBe(401);
      expect(mockAuthCodeUpsert).not.toHaveBeenCalled();
    });

    it('returns 401 with forged internal headers and no session', async () => {
      unauthenticated();
      const { POST } = await import('@/app/api/auth/cli-internal/set-user/route');
      const response = await POST(
        new NextRequest('http://localhost/api/auth/cli-internal/set-user', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...FORGED_INTERNAL_HEADERS },
          body,
        })
      );
      expect(response.status).toBe(401);
      expect(mockAuthCodeUpsert).not.toHaveBeenCalled();
    });

    it('binds the auth code to the SESSION user, ignoring body user_id', async () => {
      mockRequireAuth.mockResolvedValue({
        error: false,
        user: { id: 'session-user', email: 'session@example.com', name: 'Session User' },
      });
      mockUsersFindUnique.mockResolvedValue({ id: 'session-user', email: 'session@example.com' });
      mockAuthCodeUpsert.mockResolvedValue({});
      mockAuthCodeDeleteMany.mockResolvedValue({ count: 0 });

      const { POST } = await import('@/app/api/auth/cli-internal/set-user/route');
      const response = await POST(
        new NextRequest('http://localhost/api/auth/cli-internal/set-user', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        })
      );
      expect(response.status).toBe(200);
      // The attacker-controlled body said "victim-user"; the code must be
      // bound to the session identity instead.
      expect(mockUsersFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'session-user' } })
      );
      expect(mockAuthCodeUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ userId: 'session-user' }),
        })
      );
    });
  });

  describe('set-user GET', () => {
    it('returns 401 with no internal key', async () => {
      const { GET } = await import('@/app/api/auth/cli-internal/set-user/route');
      const response = await GET(
        new NextRequest('http://localhost/api/auth/cli-internal/set-user?code=auth-code-1')
      );
      expect(response.status).toBe(401);
      expect(mockAuthCodeFindUnique).not.toHaveBeenCalled();
    });

    it('returns 401 with forged internal headers', async () => {
      const { GET } = await import('@/app/api/auth/cli-internal/set-user/route');
      const response = await GET(
        new NextRequest('http://localhost/api/auth/cli-internal/set-user?code=auth-code-1', {
          headers: FORGED_INTERNAL_HEADERS,
        })
      );
      expect(response.status).toBe(401);
      expect(mockAuthCodeFindUnique).not.toHaveBeenCalled();
    });
  });

  describe('authorize-device POST', () => {
    it('returns 401 with no session and no internal key', async () => {
      unauthenticated();
      const { POST } = await import('@/app/api/auth/cli-internal/authorize-device/route');
      const response = await POST(
        new NextRequest('http://localhost/api/auth/cli-internal/authorize-device', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ user_code: 'ABCD1234', action: 'authorize' }),
        })
      );
      expect(response.status).toBe(401);
    });

    it('returns 401 with forged internal headers and no session', async () => {
      unauthenticated();
      const { POST } = await import('@/app/api/auth/cli-internal/authorize-device/route');
      const response = await POST(
        new NextRequest('http://localhost/api/auth/cli-internal/authorize-device', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...FORGED_INTERNAL_HEADERS },
          body: JSON.stringify({ user_code: 'ABCD1234', action: 'authorize' }),
        })
      );
      expect(response.status).toBe(401);
    });
  });

  describe('authorize-device GET', () => {
    it('returns 401 with no credentials at all (no key, no device_code)', async () => {
      const { GET } = await import('@/app/api/auth/cli-internal/authorize-device/route');
      const response = await GET(
        new NextRequest('http://localhost/api/auth/cli-internal/authorize-device')
      );
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toBe('unauthorized');
    });

    it('returns 401 with forged internal headers and no device_code', async () => {
      const { GET } = await import('@/app/api/auth/cli-internal/authorize-device/route');
      const response = await GET(
        new NextRequest('http://localhost/api/auth/cli-internal/authorize-device', {
          headers: FORGED_INTERNAL_HEADERS,
        })
      );
      expect(response.status).toBe(401);
    });

    it('keeps RFC 8628 error semantics for CLI callers presenting a device_code', async () => {
      const { GET } = await import('@/app/api/auth/cli-internal/authorize-device/route');
      const response = await GET(
        new NextRequest(
          'http://localhost/api/auth/cli-internal/authorize-device?device_code=unknown-code'
        )
      );
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('invalid_grant');
    });
  });
});
