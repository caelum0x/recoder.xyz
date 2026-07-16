import { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockDeleteMany = vi.fn();
const mockCount = vi.fn();
const mockSendWebPush = vi.fn();
const mockIsStaleSubscription = vi.fn();

vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    users: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
    web_push_subscriptions: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
  },
}));

vi.mock('@/lib/push-server', () => ({
  sendWebPush: (...args: unknown[]) => mockSendWebPush(...args),
  isStaleSubscription: (...args: unknown[]) => mockIsStaleSubscription(...args),
}));

describe('/api/push/test route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ADMIN_SECRET = 'test-admin-secret';
  });

  function req(url: string, init?: RequestInit): NextRequest {
    return new NextRequest(url, init);
  }

  it('returns 403 for non-admin requests', async () => {
    mockRequireAuth.mockResolvedValue({
      error: false,
      user: { id: 'u1', email: 'user@example.com' },
    });
    mockFindFirst.mockResolvedValue({ role: 'user' });

    const { POST } = await import('@/app/api/push/test/route');
    const response = await POST(
      req('http://localhost/api/push/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      })
    );

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Admin access required');
  });

  it('supports dry-run via x-admin-secret and returns matched subscriptions', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 's1',
        userId: 'u1',
        endpoint: 'https://push.example.com/subscription-abcdef1234567890',
        p256dh: 'k1',
        auth: 'a1',
        createdAt: new Date(),
      },
    ]);

    const { POST } = await import('@/app/api/push/test/route');
    const response = await POST(
      req('http://localhost/api/push/test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-secret': 'test-admin-secret',
        },
        body: JSON.stringify({ dryRun: true, title: 'hello', body: 'world' }),
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.mode).toBe('dry-run');
    expect(Array.isArray(json.subscriptions)).toBe(true);
    expect(json.subscriptions.length).toBe(1);
    expect(json.payload.title).toBe('hello');
  });

  it('direct send prunes stale subscriptions', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 's1',
        userId: 'u1',
        endpoint: 'https://push.example.com/subscription-deadbeef11111111',
        p256dh: 'k1',
        auth: 'a1',
        createdAt: new Date(),
      },
      {
        id: 's2',
        userId: 'u2',
        endpoint: 'https://push.example.com/subscription-alivebeef22222222',
        p256dh: 'k2',
        auth: 'a2',
        createdAt: new Date(),
      },
    ]);

    mockSendWebPush
      .mockResolvedValueOnce({
        ok: false,
        endpoint: 'https://push.example.com/subscription-deadbeef11111111',
        statusCode: 410,
        error: 'Gone',
      })
      .mockResolvedValueOnce({
        ok: true,
        endpoint: 'https://push.example.com/subscription-alivebeef22222222',
      });
    mockIsStaleSubscription.mockImplementation((result: { statusCode?: number }) => result.statusCode === 410);
    mockDeleteMany.mockResolvedValue({ count: 1 });

    const { POST } = await import('@/app/api/push/test/route');
    const response = await POST(
      req('http://localhost/api/push/test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-secret': 'test-admin-secret',
        },
        body: JSON.stringify({ dryRun: false, transport: 'direct' }),
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.mode).toBe('direct');
    expect(json.delivered).toBe(1);
    expect(json.failed).toBe(1);
    expect(json.prunedStaleSubscriptions).toBe(1);
    expect(mockDeleteMany).toHaveBeenCalledTimes(1);
  });
});
