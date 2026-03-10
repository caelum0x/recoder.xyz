// @vitest-environment node

import { NextRequest } from 'next/server';

const mockFindUnique = vi.fn();
const mockCreateUser = vi.fn();
const mockCreateAccount = vi.fn();
const mockCreateQuota = vi.fn();
const mockHashPassword = vi.fn();
const mockSendVerificationEmail = vi.fn();
const mockScheduleOnboardingEmails = vi.fn();
const mockCreateVerificationRecord = vi.fn();
const mockValidatePassword = vi.fn();
const mockRateLimitCheck = vi.fn().mockResolvedValue(null);

vi.mock('@/lib/prisma', () => ({
  prisma: {
    users: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreateUser(...args),
    },
    accounts: {
      create: (...args: unknown[]) => mockCreateAccount(...args),
    },
    user_quota: {
      create: (...args: unknown[]) => mockCreateQuota(...args),
    },
  },
}));

vi.mock('@/lib/crypto', () => ({
  hashPassword: (...args: unknown[]) => mockHashPassword(...args),
}));

vi.mock('@/lib/email', () => ({
  resolvePublicAppUrl: vi.fn().mockReturnValue('https://recoder.xyz'),
  sendVerificationEmail: (...args: unknown[]) => mockSendVerificationEmail(...args),
}));

vi.mock('@/lib/services/onboarding-email.service', () => ({
  scheduleOnboardingEmails: (...args: unknown[]) => mockScheduleOnboardingEmails(...args),
}));

vi.mock('@/lib/auth/verification-store', () => ({
  createVerificationRecord: (...args: unknown[]) => mockCreateVerificationRecord(...args),
}));

vi.mock('@/lib/password-validation', () => ({
  validatePassword: (...args: unknown[]) => mockValidatePassword(...args),
}));

vi.mock('@/lib/plan-config', () => ({
  getPlanLimits: vi.fn().mockReturnValue({
    sessionsPerDay: 6,
    requiresOwnApiKey: true,
  }),
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

vi.mock('@/lib/attribution', () => ({
  extractAttribution: vi.fn().mockReturnValue({
    referredByCode: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    firstTouchReferrer: null,
    firstTouchLanding: null,
    acquisitionSource: 'direct',
  }),
}));

vi.mock('@/lib/referral', () => ({
  generateReferralCode: vi.fn().mockReturnValue('REF_abc123'),
}));

vi.mock('nanoid', () => ({
  nanoid: vi.fn().mockReturnValue('mock-nanoid-value-1234567890123456'),
}));

describe('/api/auth/register route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // Default: password passes validation
    mockValidatePassword.mockReturnValue({ valid: true, score: 3, errors: [] });
    // Default: no existing user
    mockFindUnique.mockResolvedValue(null);
    // Default: hashing returns a hash
    mockHashPassword.mockResolvedValue('hashed-password-value');
    // Default: user creation succeeds
    mockCreateUser.mockResolvedValue({
      id: 'mock-nanoid-value-1234567890123456',
      email: 'newuser@example.com',
      name: 'New User',
      subscription: 'free',
      emailVerified: false,
    });
    // Default: account creation succeeds
    mockCreateAccount.mockResolvedValue({ id: 'mock-account-id' });
    // Default: quota creation succeeds
    mockCreateQuota.mockResolvedValue({ id: 'mock-quota-id' });
    // Default: verification record creation succeeds
    mockCreateVerificationRecord.mockResolvedValue('hashed-token');
    // Default: email sending succeeds
    mockSendVerificationEmail.mockResolvedValue({ success: true });
    // Default: onboarding emails succeed
    mockScheduleOnboardingEmails.mockResolvedValue(undefined);
  });

  function req(body: Record<string, unknown>): NextRequest {
    return new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // --- Successful registration ---

  it('returns 200 with user data on successful registration', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(req({
      email: 'newuser@example.com',
      password: 'StrongPass123!',
      name: 'New User',
    }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.user).toBeDefined();
    expect(json.user.email).toBe('newuser@example.com');
    expect(json.user.name).toBe('New User');
    expect(json.user.plan).toBe('free');
    expect(json.user.emailVerified).toBe(false);
    expect(json.requiresVerification).toBe(true);
    expect(json.message).toContain('Registration successful');
  });

  it('creates a user in the database with hashed password', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    await POST(req({
      email: 'newuser@example.com',
      password: 'StrongPass123!',
      name: 'New User',
    }));

    expect(mockHashPassword).toHaveBeenCalledWith('StrongPass123!');
    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'newuser@example.com',
          name: 'New User',
          password: 'hashed-password-value',
          subscription: 'free',
          emailVerified: false,
        }),
      })
    );
  });

  it('creates a credential account row for Better Auth compatibility', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    await POST(req({
      email: 'newuser@example.com',
      password: 'StrongPass123!',
      name: 'New User',
    }));

    expect(mockCreateAccount).toHaveBeenCalledTimes(1);
    expect(mockCreateAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerId: 'credential',
          password: 'hashed-password-value',
        }),
      })
    );
  });

  it('creates a user quota record', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    await POST(req({
      email: 'newuser@example.com',
      password: 'StrongPass123!',
      name: 'New User',
    }));

    expect(mockCreateQuota).toHaveBeenCalledTimes(1);
    expect(mockCreateQuota).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionsPerDay: 6,
          sessionsUsedToday: 0,
        }),
      })
    );
  });

  it('sends a verification email', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    await POST(req({
      email: 'newuser@example.com',
      password: 'StrongPass123!',
      name: 'New User',
    }));

    // sendVerificationEmail is called non-blocking (fire-and-forget with .catch)
    expect(mockSendVerificationEmail).toHaveBeenCalledWith(
      'newuser@example.com',
      expect.stringContaining('https://recoder.xyz/api/auth/verify-email?token=')
    );
  });

  it('stores a verification record', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    await POST(req({
      email: 'newuser@example.com',
      password: 'StrongPass123!',
      name: 'New User',
    }));

    expect(mockCreateVerificationRecord).toHaveBeenCalledWith(
      'email-verify:newuser@example.com',
      expect.any(String), // The raw token
      expect.any(Date)    // The expiry date
    );
  });

  // --- Missing fields (400) ---

  it('returns 400 when email is missing', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(req({
      password: 'StrongPass123!',
      name: 'New User',
    }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 when password is missing', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(req({
      email: 'newuser@example.com',
      name: 'New User',
    }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(req({
      email: 'newuser@example.com',
      password: 'StrongPass123!',
    }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 when all fields are missing', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(req({}));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBeDefined();
  });

  // --- Invalid email (400) ---

  it('returns 400 when email format is invalid', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(req({
      email: 'not-an-email',
      password: 'StrongPass123!',
      name: 'New User',
    }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 when email is an empty string', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(req({
      email: '',
      password: 'StrongPass123!',
      name: 'New User',
    }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBeDefined();
  });

  // --- Weak password (400) ---

  it('returns 400 when password is too short', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(req({
      email: 'newuser@example.com',
      password: 'short',
      name: 'New User',
    }));

    // Zod catches min length first (min 8)
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 when password fails strength validation', async () => {
    mockValidatePassword.mockReturnValue({
      valid: false,
      score: 1,
      errors: ['Should contain an uppercase letter', 'Should contain a number'],
    });

    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(req({
      email: 'newuser@example.com',
      password: 'weakpassword',
      name: 'New User',
    }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBeDefined();
    expect(json.errors).toBeDefined();
    expect(json.errors.length).toBeGreaterThan(0);
  });

  // --- Duplicate email (400) ---

  it('returns 400 when email is already registered', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'existing-user-id',
      email: 'existing@example.com',
      name: 'Existing User',
    });

    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(req({
      email: 'existing@example.com',
      password: 'StrongPass123!',
      name: 'New User',
    }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('User with this email already exists');
  });

  it('does not create user or send email when duplicate email', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'existing-user-id',
      email: 'existing@example.com',
    });

    const { POST } = await import('@/app/api/auth/register/route');
    await POST(req({
      email: 'existing@example.com',
      password: 'StrongPass123!',
      name: 'New User',
    }));

    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockSendVerificationEmail).not.toHaveBeenCalled();
  });

  // --- Rate limiting ---

  it('returns 429 when rate limit is exceeded', async () => {
    mockRateLimitCheck.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'Too many requests', message: 'Rate limit exceeded' }),
        { status: 429, headers: { 'content-type': 'application/json' } }
      )
    );

    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(req({
      email: 'newuser@example.com',
      password: 'StrongPass123!',
      name: 'New User',
    }));

    expect(response.status).toBe(429);
    const json = await response.json();
    expect(json.error).toBe('Too many requests');
  });

  // --- Edge cases ---

  it('lowercases email input for duplicate check', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    await POST(req({
      email: 'NewUser@Example.COM',
      password: 'StrongPass123!',
      name: 'New User',
    }));

    // The findUnique should be called with the lowercased email
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'newuser@example.com' },
      })
    );
  });

  it('returns 500 when database creation fails', async () => {
    mockCreateUser.mockRejectedValue(new Error('Database connection error'));

    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(req({
      email: 'newuser@example.com',
      password: 'StrongPass123!',
      name: 'New User',
    }));

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Registration failed');
  });

  it('accepts optional plan parameter', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(req({
      email: 'prouser@example.com',
      password: 'StrongPass123!',
      name: 'Pro User',
      plan: 'pro',
    }));

    expect(response.status).toBe(200);
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscription: 'pro',
        }),
      })
    );
  });
});
