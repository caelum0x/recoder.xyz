// @vitest-environment node

import { NextRequest } from 'next/server';

const mockFindUnique = vi.fn();
const mockUsersUpdate = vi.fn();
const mockFindValidVerificationByHashedValue = vi.fn();
const mockConsumeVerification = vi.fn();
const mockCreateVerificationRecord = vi.fn();
const mockSendVerificationEmailWithCode = vi.fn();
const mockUserUpdate = vi.fn();
const mockRateLimitCheck = vi.fn().mockResolvedValue(null);

vi.mock('@/lib/prisma', () => ({
  prisma: {
    users: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUsersUpdate(...args),
    },
    user: {
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

vi.mock('@/lib/auth/verification-store', () => ({
  findValidVerificationByHashedValue: (...args: unknown[]) => mockFindValidVerificationByHashedValue(...args),
  consumeVerification: (...args: unknown[]) => mockConsumeVerification(...args),
  createVerificationRecord: (...args: unknown[]) => mockCreateVerificationRecord(...args),
}));

vi.mock('@/lib/email', () => ({
  resolvePublicAppUrl: vi.fn().mockReturnValue('https://recoder.xyz'),
  getEmailProviderStatus: vi.fn().mockReturnValue({ provider: 'smtp', hasSmtp: true, hasResend: false, fromEmail: 'noreply@recoder.xyz' }),
  sendVerificationEmailWithCode: (...args: unknown[]) => mockSendVerificationEmailWithCode(...args),
}));

vi.mock('@/lib/middleware/rate-limit', () => ({
  rateLimit: () => (...args: unknown[]) => mockRateLimitCheck(...args),
  rateLimitConfigs: {
    auth: { windowMs: 60000, maxRequests: 5 },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('/api/auth/verify-email route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // Default: verification record exists and is valid
    mockFindValidVerificationByHashedValue.mockResolvedValue({
      id: 'ver-1',
      identifier: 'email-verify:user@example.com',
      value: 'hashed-token-value',
      expiresAt: new Date(Date.now() + 86400000),
      source: 'verifications',
    });
    // Default: consume succeeds
    mockConsumeVerification.mockResolvedValue(undefined);
    // Default: user updates succeed
    mockUsersUpdate.mockResolvedValue({});
    mockUserUpdate.mockResolvedValue({});
    // Default: user exists and is not verified
    mockFindUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      emailVerified: false,
    });
    // Default: verification record creation succeeds
    mockCreateVerificationRecord.mockResolvedValue('hashed-token');
    // Default: email sending succeeds
    mockSendVerificationEmailWithCode.mockResolvedValue({ success: true });
  });

  // ============================
  // GET /api/auth/verify-email
  // ============================

  describe('GET - token-based verification', () => {
    function getReq(queryParams: string): NextRequest {
      return new NextRequest(`http://localhost/api/auth/verify-email${queryParams}`, {
        method: 'GET',
      });
    }

    it('redirects to signin with verified=true on valid token', async () => {
      const { GET } = await import('@/app/api/auth/verify-email/route');
      const response = await GET(getReq('?token=valid-token-value'));

      expect(response.status).toBe(307); // NextResponse.redirect uses 307
      const location = response.headers.get('location');
      expect(location).toContain('/auth/signin?verified=true');
    });

    it('marks email as verified across tables on valid token', async () => {
      const { GET } = await import('@/app/api/auth/verify-email/route');
      await GET(getReq('?token=valid-token-value'));

      // Should update the users table
      expect(mockUsersUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'user@example.com' },
          data: expect.objectContaining({
            emailVerified: true,
          }),
        })
      );
    });

    it('consumes the verification token after use', async () => {
      const { GET } = await import('@/app/api/auth/verify-email/route');
      await GET(getReq('?token=valid-token-value'));

      expect(mockConsumeVerification).toHaveBeenCalledWith(
        'email-verify:user@example.com',
        expect.any(String) // hashed token
      );
    });

    it('redirects to signin with error=expired_token when token is invalid', async () => {
      mockFindValidVerificationByHashedValue.mockResolvedValue(null);

      const { GET } = await import('@/app/api/auth/verify-email/route');
      const response = await GET(getReq('?token=invalid-token'));

      expect(response.status).toBe(307);
      const location = response.headers.get('location');
      expect(location).toContain('/auth/signin?error=expired_token');
    });

    it('redirects to signin with error=expired_token when identifier is wrong prefix', async () => {
      mockFindValidVerificationByHashedValue.mockResolvedValue({
        id: 'ver-1',
        identifier: 'password-reset:user@example.com', // Wrong prefix
        value: 'hashed-token-value',
        expiresAt: new Date(Date.now() + 86400000),
        source: 'verifications',
      });

      const { GET } = await import('@/app/api/auth/verify-email/route');
      const response = await GET(getReq('?token=some-token'));

      expect(response.status).toBe(307);
      const location = response.headers.get('location');
      expect(location).toContain('/auth/signin?error=expired_token');
    });

    it('redirects to signin with error=invalid_token when token is missing', async () => {
      const { GET } = await import('@/app/api/auth/verify-email/route');
      const response = await GET(getReq(''));

      expect(response.status).toBe(307);
      const location = response.headers.get('location');
      expect(location).toContain('/auth/signin?error=invalid_token');
    });

    it('redirects to signin with error on database failure', async () => {
      mockFindValidVerificationByHashedValue.mockRejectedValue(new Error('DB error'));

      const { GET } = await import('@/app/api/auth/verify-email/route');
      const response = await GET(getReq('?token=valid-token'));

      expect(response.status).toBe(307);
      const location = response.headers.get('location');
      expect(location).toContain('/auth/signin?error=verification_failed');
    });

    it('returns 429 when rate limit is exceeded', async () => {
      mockRateLimitCheck.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: 'Too many requests', message: 'Rate limit exceeded' }),
          { status: 429, headers: { 'content-type': 'application/json' } }
        )
      );

      const { GET } = await import('@/app/api/auth/verify-email/route');
      const response = await GET(getReq('?token=valid-token'));

      expect(response.status).toBe(429);
    });
  });

  // ============================
  // POST /api/auth/verify-email (resend)
  // ============================

  describe('POST - resend verification email', () => {
    function postReq(body: Record<string, unknown>): NextRequest {
      return new NextRequest('http://localhost/api/auth/verify-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    it('returns 200 and sends verification email for valid unverified user', async () => {
      const { POST } = await import('@/app/api/auth/verify-email/route');
      const response = await POST(postReq({ email: 'user@example.com' }));

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.message).toContain('Verification email sent');
      expect(json.emailSent).toBe(true);
    });

    it('creates verification records for both token and code', async () => {
      const { POST } = await import('@/app/api/auth/verify-email/route');
      await POST(postReq({ email: 'user@example.com' }));

      // Should create two records: one for email-verify (token) and one for email-code (code)
      expect(mockCreateVerificationRecord).toHaveBeenCalledTimes(2);
      expect(mockCreateVerificationRecord).toHaveBeenCalledWith(
        'email-verify:user@example.com',
        expect.any(String),
        expect.any(Date)
      );
      expect(mockCreateVerificationRecord).toHaveBeenCalledWith(
        'email-code:user@example.com',
        expect.any(String),
        expect.any(Date)
      );
    });

    it('sends verification email with code and URL', async () => {
      const { POST } = await import('@/app/api/auth/verify-email/route');
      await POST(postReq({ email: 'user@example.com' }));

      expect(mockSendVerificationEmailWithCode).toHaveBeenCalledWith(
        'user@example.com',
        expect.stringMatching(/^\d{6}$/), // 6-digit code
        expect.stringContaining('https://recoder.xyz/verify')
      );
    });

    it('returns 400 when email is missing', async () => {
      const { POST } = await import('@/app/api/auth/verify-email/route');
      const response = await POST(postReq({}));

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Email is required');
    });

    it('returns 404 when user does not exist', async () => {
      mockFindUnique.mockResolvedValue(null);

      const { POST } = await import('@/app/api/auth/verify-email/route');
      const response = await POST(postReq({ email: 'nobody@example.com' }));

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('not found');
    });

    it('returns 400 when email is already verified', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'u1',
        email: 'user@example.com',
        emailVerified: true,
      });

      const { POST } = await import('@/app/api/auth/verify-email/route');
      const response = await POST(postReq({ email: 'user@example.com' }));

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('already verified');
    });

    it('does not send email when user not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      const { POST } = await import('@/app/api/auth/verify-email/route');
      await POST(postReq({ email: 'nobody@example.com' }));

      expect(mockSendVerificationEmailWithCode).not.toHaveBeenCalled();
    });

    it('returns 500 when an unexpected error occurs', async () => {
      mockFindUnique.mockRejectedValue(new Error('Database connection error'));

      const { POST } = await import('@/app/api/auth/verify-email/route');
      const response = await POST(postReq({ email: 'user@example.com' }));

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Internal server error');
    });

    it('returns 429 when rate limit is exceeded', async () => {
      mockRateLimitCheck.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: 'Too many requests', message: 'Rate limit exceeded' }),
          { status: 429, headers: { 'content-type': 'application/json' } }
        )
      );

      const { POST } = await import('@/app/api/auth/verify-email/route');
      const response = await POST(postReq({ email: 'user@example.com' }));

      expect(response.status).toBe(429);
    });
  });
});
