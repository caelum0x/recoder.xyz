import { NextRequest } from 'next/server';

const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockQueryRaw = vi.fn();
const mockVerifyPassword = vi.fn();
const mockGetApiKeyStatus = vi.fn();
const mockTrackServerEvent = vi.fn();
const mockTraceRequest = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    users: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    cli_sessions: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

vi.mock('@/lib/crypto', () => ({
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
}));

vi.mock('@/lib/api-key-resolver', () => ({
  getApiKeyStatus: (...args: unknown[]) => mockGetApiKeyStatus(...args),
}));

vi.mock('@/lib/analytics', () => ({
  trackServerEvent: (...args: unknown[]) => mockTrackServerEvent(...args),
  AnalyticsEvents: {
    LOGIN_FAILED: 'login_failed',
    LOGIN_COMPLETED: 'login_completed',
  },
}));

vi.mock('@/lib/middleware/rate-limit', () => ({
  rateLimit: () => vi.fn().mockResolvedValue(null),
  rateLimitConfigs: {
    auth: { windowMs: 60000, max: 5 },
  },
}));

vi.mock('@/lib/tracing-middleware', () => ({
  traceRequest: (...args: unknown[]) => mockTraceRequest(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn().mockReturnValue('mock-jwt-token'),
  },
}));

vi.mock('nanoid', () => ({
  nanoid: vi.fn().mockReturnValue('mock-nanoid-value-1234567890123456'),
}));

describe('/api/auth/login route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-jwt-secret-for-testing';

    // Default mock: traceRequest returns a traceId and passthrough applyTraceId
    mockTraceRequest.mockReturnValue({
      traceId: 'test-trace-id',
      applyTraceId: (response: Response) => response,
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });
  });

  function req(url: string, init?: RequestInit): NextRequest {
    return new NextRequest(url, init);
  }

  // --- Validation errors (400) ---

  it('returns 400 when body is empty', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(
      req('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 when email is missing', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(
      req('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'somepassword123' }),
      })
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 when password is missing', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(
      req('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com' }),
      })
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 when email format is invalid', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(
      req('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', password: 'somepassword123' }),
      })
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain('email');
  });

  // --- Invalid credentials (401) ---

  it('returns 401 when user is not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(
      req('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'nobody@example.com', password: 'somepassword123' }),
      })
    );

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe('Invalid email or password');
  });

  it('returns 401 when user has no password set', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'u1',
      email: 'oauth-user@example.com',
      name: 'OAuth User',
      password: null,
      emailVerified: true,
      subscription: 'free',
      quota: null,
    });

    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(
      req('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'oauth-user@example.com', password: 'somepassword123' }),
      })
    );

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe('Invalid email or password');
  });

  it('returns 401 when password does not match', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      name: 'Test User',
      password: 'hashed-password',
      emailVerified: true,
      subscription: 'free',
      quota: null,
    });
    mockVerifyPassword.mockResolvedValue(false);

    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(
      req('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', password: 'wrongpassword' }),
      })
    );

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe('Invalid email or password');
  });

  it('tracks login_failed event on invalid credentials', async () => {
    mockFindUnique.mockResolvedValue(null);

    const { POST } = await import('@/app/api/auth/login/route');
    await POST(
      req('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'nobody@example.com', password: 'somepassword123' }),
      })
    );

    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      'login_failed',
      expect.objectContaining({ reason: 'invalid_credentials' })
    );
  });

  // --- Email not verified (403) ---

  it('returns 403 when email is not verified', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'u1',
      email: 'unverified@example.com',
      name: 'Unverified User',
      password: 'hashed-password',
      emailVerified: false,
      subscription: 'free',
      quota: null,
    });
    mockVerifyPassword.mockResolvedValue(true);

    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(
      req('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'unverified@example.com', password: 'correctpassword' }),
      })
    );

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.emailNotVerified).toBe(true);
    expect(json.email).toBe('unverified@example.com');
  });

  // --- 2FA required (200 with requires2FA) ---

  it('returns 200 with requires2FA when 2FA is enabled', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'u1',
      email: 'twofactor@example.com',
      name: '2FA User',
      password: 'hashed-password',
      emailVerified: true,
      subscription: 'pro-monthly',
      quota: null,
    });
    mockVerifyPassword.mockResolvedValue(true);
    mockQueryRaw.mockResolvedValue([{ two_factor_enabled: true }]);

    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(
      req('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'twofactor@example.com', password: 'correctpassword' }),
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.requires2FA).toBe(true);
    expect(json.userId).toBe('u1');
  });

  // --- Successful login (200) ---

  it('returns 200 with user and session on successful login', async () => {
    const periodEnd = new Date('2026-03-27T00:00:00.000Z');
    mockFindUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      name: 'Test User',
      password: 'hashed-password',
      emailVerified: true,
      subscription: 'pro-monthly',
      quota: {
        sessionsPerDay: 50,
        sessionsUsedToday: 5,
        tokensPerSession: 100000,
        periodEnd,
      },
    });
    mockVerifyPassword.mockResolvedValue(true);
    mockQueryRaw.mockResolvedValue([]);
    mockCreate.mockResolvedValue({ id: 'session-1' });
    mockUpdate.mockResolvedValue({});
    mockGetApiKeyStatus.mockResolvedValue({ hasKey: true, source: 'platform' });

    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(
      req('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', password: 'correctpassword' }),
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();

    // Top-level
    expect(json.success).toBe(true);

    // User object
    expect(json.user).toBeDefined();
    expect(json.user.id).toBe('u1');
    expect(json.user.email).toBe('user@example.com');
    expect(json.user.name).toBe('Test User');
    expect(json.user.plan).toBe('pro-monthly');
    expect(json.user.apiKeyStatus).toEqual({ hasKey: true, source: 'platform' });

    // Quota
    expect(json.user.quota).toBeDefined();
    expect(json.user.quota.remaining).toBe(45); // 50 - 5
    expect(json.user.quota.limit).toBe(50);
    expect(json.user.quota.tokensPerSession).toBe(100000);

    // Session object
    expect(json.session).toBeDefined();
    expect(json.session.accessToken).toBeDefined();
    expect(json.session.refreshToken).toBeDefined();
    expect(json.session.expiresAt).toBeDefined();
  });

  it('creates a CLI session on successful login', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      name: 'Test User',
      password: 'hashed-password',
      emailVerified: true,
      subscription: 'free',
      quota: null,
    });
    mockVerifyPassword.mockResolvedValue(true);
    mockQueryRaw.mockResolvedValue([]);
    mockCreate.mockResolvedValue({ id: 'session-1' });
    mockUpdate.mockResolvedValue({});
    mockGetApiKeyStatus.mockResolvedValue({ hasKey: false });

    const { POST } = await import('@/app/api/auth/login/route');
    await POST(
      req('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', password: 'correctpassword' }),
      })
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          deviceName: 'Web Browser',
          deviceType: 'web',
          isActive: true,
        }),
      })
    );
  });

  it('updates lastLoginAt on successful login', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      name: 'Test User',
      password: 'hashed-password',
      emailVerified: true,
      subscription: 'free',
      quota: null,
    });
    mockVerifyPassword.mockResolvedValue(true);
    mockQueryRaw.mockResolvedValue([]);
    mockCreate.mockResolvedValue({ id: 'session-1' });
    mockUpdate.mockResolvedValue({});
    mockGetApiKeyStatus.mockResolvedValue({ hasKey: false });

    const { POST } = await import('@/app/api/auth/login/route');
    await POST(
      req('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', password: 'correctpassword' }),
      })
    );

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({
          lastLoginAt: expect.any(Date),
        }),
      })
    );
  });

  it('tracks login_completed event on successful login', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      name: 'Test User',
      password: 'hashed-password',
      emailVerified: true,
      subscription: 'pro-monthly',
      quota: null,
    });
    mockVerifyPassword.mockResolvedValue(true);
    mockQueryRaw.mockResolvedValue([]);
    mockCreate.mockResolvedValue({ id: 'session-1' });
    mockUpdate.mockResolvedValue({});
    mockGetApiKeyStatus.mockResolvedValue({ hasKey: true });

    const { POST } = await import('@/app/api/auth/login/route');
    await POST(
      req('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', password: 'correctpassword' }),
      })
    );

    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      'login_completed',
      expect.objectContaining({
        method: 'email',
        userId: 'u1',
        plan: 'pro-monthly',
      })
    );
  });

  it('returns null quota when user has no quota record', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      name: 'Test User',
      password: 'hashed-password',
      emailVerified: true,
      subscription: 'free',
      quota: null,
    });
    mockVerifyPassword.mockResolvedValue(true);
    mockQueryRaw.mockResolvedValue([]);
    mockCreate.mockResolvedValue({ id: 'session-1' });
    mockUpdate.mockResolvedValue({});
    mockGetApiKeyStatus.mockResolvedValue({ hasKey: false });

    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(
      req('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', password: 'correctpassword' }),
      })
    );

    const json = await response.json();
    expect(json.user.quota).toBeNull();
  });
});
