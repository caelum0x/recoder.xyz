/**
 * Admin route auth-gate tests.
 *
 * Every /api/admin/* handler must gate on the shared `ensureAdminAccess`
 * helper: unauthenticated callers get 401, authenticated non-admin sessions
 * get 403, and a matching `x-admin-secret` header is still accepted (the
 * pre-existing script/smoke-test consumer contract).
 */

import { NextRequest, NextResponse } from 'next/server';

const mockRequireAuth = vi.fn();
const mockUsersFindFirst = vi.fn();
const mockUsersFindUnique = vi.fn();
const mockVerificationsFindMany = vi.fn();
const mockVerificationsDeleteMany = vi.fn();

vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    users: {
      findFirst: (...args: unknown[]) => mockUsersFindFirst(...args),
      findUnique: (...args: unknown[]) => mockUsersFindUnique(...args),
    },
    verifications: {
      findMany: (...args: unknown[]) => mockVerificationsFindMany(...args),
      deleteMany: (...args: unknown[]) => mockVerificationsDeleteMany(...args),
    },
  },
}));

vi.mock('@/lib/email', () => ({
  getEmailProviderStatus: () => ({
    provider: 'dev',
    hasResend: false,
    hasSmtp: false,
    fromEmail: 'noreply@example.com',
  }),
  sendVerificationEmail: vi.fn(),
  sendWelcomeEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendTemporaryPasswordEmail: vi.fn(),
}));

function unauthenticated() {
  mockRequireAuth.mockResolvedValue({
    error: true,
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  });
}

function nonAdminSession() {
  mockRequireAuth.mockResolvedValue({
    error: false,
    user: { id: 'u1', email: 'user@example.com' },
  });
  mockUsersFindFirst.mockResolvedValue({ id: 'u1', email: 'user@example.com', role: 'user' });
}

describe('admin route auth gates', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ADMIN_SECRET = 'test-admin-secret';
  });

  describe('/api/admin/kpi', () => {
    it('returns 401 for unauthenticated requests without the admin secret', async () => {
      unauthenticated();
      const { GET } = await import('@/app/api/admin/kpi/route');
      const response = await GET(new NextRequest('http://localhost/api/admin/kpi'));
      expect(response.status).toBe(401);
    });

    it('returns 403 for authenticated non-admin sessions', async () => {
      nonAdminSession();
      const { GET } = await import('@/app/api/admin/kpi/route');
      const response = await GET(new NextRequest('http://localhost/api/admin/kpi'));
      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toContain('Admin access required');
    });

    it('still accepts the x-admin-secret header contract', async () => {
      const { GET } = await import('@/app/api/admin/kpi/route');
      const response = await GET(
        new NextRequest('http://localhost/api/admin/kpi', {
          headers: { 'x-admin-secret': 'test-admin-secret' },
        })
      );
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(mockRequireAuth).not.toHaveBeenCalled();
    });
  });

  describe('/api/admin/test-email', () => {
    it('POST returns 401 for unauthenticated requests', async () => {
      unauthenticated();
      const { POST } = await import('@/app/api/admin/test-email/route');
      const response = await POST(
        new NextRequest('http://localhost/api/admin/test-email', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'a@b.co' }),
        })
      );
      expect(response.status).toBe(401);
    });

    it('POST returns 403 for non-admin sessions', async () => {
      nonAdminSession();
      const { POST } = await import('@/app/api/admin/test-email/route');
      const response = await POST(
        new NextRequest('http://localhost/api/admin/test-email', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'a@b.co' }),
        })
      );
      expect(response.status).toBe(403);
    });

    it('GET returns 401 for unauthenticated requests', async () => {
      unauthenticated();
      const { GET } = await import('@/app/api/admin/test-email/route');
      const response = await GET(new NextRequest('http://localhost/api/admin/test-email'));
      expect(response.status).toBe(401);
    });

    it('GET returns 403 for non-admin sessions', async () => {
      nonAdminSession();
      const { GET } = await import('@/app/api/admin/test-email/route');
      const response = await GET(new NextRequest('http://localhost/api/admin/test-email'));
      expect(response.status).toBe(403);
    });
  });

  describe('/api/admin/pending-verifications', () => {
    it('GET returns 401 for unauthenticated requests', async () => {
      unauthenticated();
      const { GET } = await import('@/app/api/admin/pending-verifications/route');
      const response = await GET(
        new NextRequest('http://localhost/api/admin/pending-verifications?email=a@b.co')
      );
      expect(response.status).toBe(401);
    });

    it('GET returns 403 for non-admin sessions', async () => {
      nonAdminSession();
      const { GET } = await import('@/app/api/admin/pending-verifications/route');
      const response = await GET(
        new NextRequest('http://localhost/api/admin/pending-verifications?email=a@b.co')
      );
      expect(response.status).toBe(403);
    });

    it('DELETE returns 401 for unauthenticated requests', async () => {
      unauthenticated();
      const { DELETE } = await import('@/app/api/admin/pending-verifications/route');
      const response = await DELETE(
        new NextRequest('http://localhost/api/admin/pending-verifications', { method: 'DELETE' })
      );
      expect(response.status).toBe(401);
    });

    it('POST returns 401 for unauthenticated requests', async () => {
      unauthenticated();
      const { POST } = await import('@/app/api/admin/pending-verifications/route');
      const response = await POST(
        new NextRequest('http://localhost/api/admin/pending-verifications', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'a@b.co' }),
        })
      );
      expect(response.status).toBe(401);
    });

    it('POST returns 403 for non-admin sessions', async () => {
      nonAdminSession();
      const { POST } = await import('@/app/api/admin/pending-verifications/route');
      const response = await POST(
        new NextRequest('http://localhost/api/admin/pending-verifications', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'a@b.co' }),
        })
      );
      expect(response.status).toBe(403);
    });
  });
});
