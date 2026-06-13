// @vitest-environment node

import { NextRequest } from 'next/server';

const mockFindUnique = vi.fn();
const mockDeleteMany = vi.fn();
const mockVerificationsCreate = vi.fn();
const mockSendPasswordResetEmail = vi.fn();
const mockRateLimitCheck = vi.fn().mockResolvedValue(null);

vi.mock('@/lib/prisma', () => ({
  prisma: {
    users: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    verifications: {
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      create: (...args: unknown[]) => mockVerificationsCreate(...args),
    },
  },
}));

vi.mock('@/lib/email', () => ({
  resolvePublicAppUrl: vi.fn().mockReturnValue('https://recoder.xyz'),
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
}));

vi.mock('@/lib/middleware/rate-limit', () => ({
  rateLimit: () => (...args: unknown[]) => mockRateLimitCheck(...args),
  rateLimitConfigs: {
    passwordReset: { windowMs: 3600000, maxRequests: 3 },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('/api/auth/forgot-password route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // Default: user exists
    mockFindUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
    });
    // Default: delete old tokens succeeds
    mockDeleteMany.mockResolvedValue({ count: 0 });
    // Default: create verification succeeds
    mockVerificationsCreate.mockResolvedValue({ id: 'ver-1' });
    // Default: email sending succeeds
    mockSendPasswordResetEmail.mockResolvedValue({ success: true });
  });

  function req(body: Record<string, unknown>): NextRequest {
    return new NextRequest('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // --- Successful password reset request ---

  it('returns 200 with success message for valid email', async () => {
    const { POST } = await import('@/app/api/auth/forgot-password/route');
    const response = await POST(req({ email: 'user@example.com' }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.message).toContain('If an account exists');
  });

  it('sends password reset email to valid user', async () => {
    const { POST } = await import('@/app/api/auth/forgot-password/route');
    await POST(req({ email: 'user@example.com' }));

    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(
      'user@example.com',
      expect.stringContaining('https://recoder.xyz/auth/reset-password?token=')
    );
  });

  it('deletes old reset tokens before creating new one', async () => {
    const { POST } = await import('@/app/api/auth/forgot-password/route');
    await POST(req({ email: 'user@example.com' }));

    expect(mockDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          identifier: 'password-reset:user@example.com',
        },
      })
    );

    // Delete should be called before create
    const deleteOrder = mockDeleteMany.mock.invocationCallOrder[0];
    const createOrder = mockVerificationsCreate.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(createOrder);
  });

  it('creates a verification record with hashed token', async () => {
    const { POST } = await import('@/app/api/auth/forgot-password/route');
    await POST(req({ email: 'user@example.com' }));

    expect(mockVerificationsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          identifier: 'password-reset:user@example.com',
          value: expect.any(String), // hashed token
          expires_at: expect.any(Date),
        }),
      })
    );
  });

  // --- Non-existent email returns 200 (anti-enumeration) ---

  it('returns 200 for non-existent email to prevent enumeration', async () => {
    mockFindUnique.mockResolvedValue(null);

    const { POST } = await import('@/app/api/auth/forgot-password/route');
    const response = await POST(req({ email: 'nobody@example.com' }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.message).toContain('If an account exists');
  });

  it('does not send email when user does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);

    const { POST } = await import('@/app/api/auth/forgot-password/route');
    await POST(req({ email: 'nobody@example.com' }));

    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('does not create verification record when user does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);

    const { POST } = await import('@/app/api/auth/forgot-password/route');
    await POST(req({ email: 'nobody@example.com' }));

    expect(mockVerificationsCreate).not.toHaveBeenCalled();
  });

  // --- Missing email (400) ---

  it('returns 400 when email is missing', async () => {
    const { POST } = await import('@/app/api/auth/forgot-password/route');
    const response = await POST(req({}));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Email is required');
  });

  it('returns 400 when email is empty string', async () => {
    const { POST } = await import('@/app/api/auth/forgot-password/route');
    const response = await POST(req({ email: '' }));

    // Empty string is falsy, so treated as missing
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Email is required');
  });

  // --- Rate limiting ---

  it('returns 429 when rate limit is exceeded', async () => {
    mockRateLimitCheck.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'Too many requests', message: 'Rate limit exceeded' }),
        { status: 429, headers: { 'content-type': 'application/json' } }
      )
    );

    const { POST } = await import('@/app/api/auth/forgot-password/route');
    const response = await POST(req({ email: 'user@example.com' }));

    expect(response.status).toBe(429);
    const json = await response.json();
    expect(json.error).toBe('Too many requests');
  });

  // --- Email sending failure ---

  it('returns 500 when email sending fails', async () => {
    mockSendPasswordResetEmail.mockResolvedValue({
      success: false,
      error: 'SMTP connection failed',
    });

    const { POST } = await import('@/app/api/auth/forgot-password/route');
    const response = await POST(req({ email: 'user@example.com' }));

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Failed to send');
  });

  // --- Error handling (anti-enumeration in catch) ---

  it('returns 200 even when database throws to prevent enumeration', async () => {
    mockFindUnique.mockRejectedValue(new Error('Database connection error'));

    const { POST } = await import('@/app/api/auth/forgot-password/route');
    const response = await POST(req({ email: 'user@example.com' }));

    // The catch block returns success to prevent enumeration
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.message).toContain('If an account exists');
  });

  it('returns 200 even when verification creation throws to prevent enumeration', async () => {
    mockVerificationsCreate.mockRejectedValue(new Error('Write failed'));

    const { POST } = await import('@/app/api/auth/forgot-password/route');
    const response = await POST(req({ email: 'user@example.com' }));

    // The catch block returns success to prevent enumeration
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
  });
});
