import { NextRequest } from 'next/server';

/**
 * Entitlement ENFORCEMENT e2e — proves the tier gate actually BLOCKS, it is not
 * decorative. The money path for the desktop/CLI is POST /api/cli/proxy: a
 * free-tier user at their daily session cap must be denied (429) BEFORE any
 * BYOK key is resolved or any upstream token is spent, while an unlimited
 * (enterprise) user is allowed through even when over the numeric cap.
 *
 * GET /api/cli/quota is the advisory read the CLI polls; it must report
 * canMakeRequest=false at the cap so the client and the enforcement agree.
 *
 * These drive the REAL route handlers over a fake prisma + fake upstream fetch;
 * only the auth service, prisma, and the BYOK key resolver are substituted.
 */

interface QuotaRow {
  id: string;
  sessionsPerDay: number;
  sessionsUsedToday: number;
  tokensPerSession: number;
  periodStart: Date;
  periodEnd: Date;
  lastResetAt: Date;
}

interface AuthContext {
  userId: string;
  email: string;
  name: string;
  plan: string;
  status: string;
}

const state: {
  quota: QuotaRow | null;
  authContext: AuthContext;
  resolveApiKeyImpl: (userId: string) => Promise<{ apiKey: string; source: 'user'; provider: string }>;
} = {
  quota: null,
  authContext: { userId: 'u1', email: 'user@example.com', name: 'Test', plan: 'free', status: 'active' },
  resolveApiKeyImpl: async () => ({ apiKey: 'sk-user-byok', source: 'user', provider: 'openrouter' }),
};

// Real error class so `error instanceof ApiKeyResolverError` narrows in the route.
class ApiKeyResolverError extends Error {
  constructor(
    message: string,
    public code: string,
    public upgradeRequired = false
  ) {
    super(message);
    this.name = 'ApiKeyResolverError';
  }
}

const findQuotaMock = vi.fn(async () => (state.quota ? { ...state.quota } : null));
const updateQuotaMock = vi.fn(async () => ({}));
const createQuotaMock = vi.fn(async (args: { data: Partial<QuotaRow> }) => ({
  id: 'q-new',
  sessionsUsedToday: 0,
  ...args.data,
}));
const createUsageMock = vi.fn(async () => ({}));
const resolveApiKeyMock = vi.fn((userId: string) => state.resolveApiKeyImpl(userId));
const fetchMock = vi.fn();

vi.mock('@/lib/services/cli-auth.service', () => ({
  CLIAuthService: {
    validateAccessToken: vi.fn(async () => ({ ...state.authContext, sessionId: 's1' })),
    validateApiKey: vi.fn(async () => ({ ...state.authContext, keyId: 'k1' })),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user_quota: {
      findUnique: (...args: unknown[]) => findQuotaMock(...(args as [])),
      update: (...args: unknown[]) => updateQuotaMock(...(args as [])),
      create: (...args: unknown[]) => createQuotaMock(...(args as [{ data: Partial<QuotaRow> }])),
    },
    usage_records: {
      create: (...args: unknown[]) => createUsageMock(...(args as [])),
    },
  },
}));

vi.mock('@/lib/api-key-resolver', () => ({
  resolveApiKey: (...args: unknown[]) => resolveApiKeyMock(...(args as [string])),
  ApiKeyResolverError,
}));

function futureDate(): Date {
  return new Date(Date.now() + 60 * 60 * 1000);
}

function quotaFixture(overrides: Partial<QuotaRow> = {}): QuotaRow {
  return {
    id: 'q1',
    sessionsPerDay: 6,
    sessionsUsedToday: 0,
    tokensPerSession: 10000,
    periodStart: new Date(Date.now() - 60 * 1000),
    periodEnd: futureDate(),
    lastResetAt: new Date(Date.now() - 60 * 1000),
    ...overrides,
  };
}

function proxyRequest(): NextRequest {
  return new NextRequest('http://localhost/api/cli/proxy', {
    method: 'POST',
    headers: { authorization: 'Bearer reco_test_token', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'anthropic/claude-3-5-sonnet', messages: [{ role: 'user', content: 'hi' }] }),
  });
}

function quotaGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/cli/quota', {
    headers: { authorization: 'Bearer reco_test_token' },
  });
}

function okUpstream() {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: 'generated code' } }],
      model: 'anthropic/claude-3-5-sonnet',
      usage: { total_tokens: 42, prompt_tokens: 10, completion_tokens: 32 },
    }),
  };
}

async function getProxyRoute() {
  return import('@/app/api/cli/proxy/route');
}

async function getQuotaRoute() {
  return import('@/app/api/cli/quota/route');
}

beforeEach(() => {
  vi.clearAllMocks();
  state.authContext = { userId: 'u1', email: 'user@example.com', name: 'Test', plan: 'free', status: 'active' };
  state.quota = quotaFixture();
  state.resolveApiKeyImpl = async () => ({ apiKey: 'sk-user-byok', source: 'user', provider: 'openrouter' });
  fetchMock.mockResolvedValue(okUpstream());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/cli/proxy — tier gate ENFORCES the daily session cap', () => {
  it('BLOCKS a free user at their limit with 429 and spends NOTHING upstream', async () => {
    state.authContext.plan = 'free';
    state.quota = quotaFixture({ sessionsPerDay: 6, sessionsUsedToday: 6 });

    const { POST } = await getProxyRoute();
    const response = await POST(proxyRequest());

    expect(response.status).toBe(429);
    const json = await response.json();
    expect(json.error).toBe('Quota exceeded');
    expect(json.quota).toEqual({ used: 6, limit: 6 });

    // The gate must short-circuit BEFORE resolving the BYOK key or calling the
    // upstream provider — otherwise the free user still spends tokens.
    expect(resolveApiKeyMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateQuotaMock).not.toHaveBeenCalled();
  });

  it('BLOCKS a free user who is already over the cap (used > limit)', async () => {
    state.authContext.plan = 'free';
    state.quota = quotaFixture({ sessionsPerDay: 6, sessionsUsedToday: 9 });

    const { POST } = await getProxyRoute();
    const response = await POST(proxyRequest());

    expect(response.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ALLOWS a free user under the cap and increments the session counter', async () => {
    state.authContext.plan = 'free';
    state.quota = quotaFixture({ id: 'q7', sessionsPerDay: 6, sessionsUsedToday: 3 });

    const { POST } = await getProxyRoute();
    const response = await POST(proxyRequest());

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.response).toBe('generated code');

    expect(resolveApiKeyMock).toHaveBeenCalledWith('u1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Usage is recorded AND the daily counter advances by exactly one.
    expect(createUsageMock).toHaveBeenCalledTimes(1);
    expect(updateQuotaMock).toHaveBeenCalledWith({
      where: { id: 'q7' },
      data: { sessionsUsedToday: { increment: 1 } },
    });
  });

  it('DOWNGRADE: enforces the CURRENT plan cap, not the stale sessionsPerDay frozen in the row', async () => {
    // User was premium (row sessionsPerDay=50) then downgraded to free. The dodo
    // webhook updates users.plan without touching user_quota, so the row is stale.
    // The gate must cap at the current free tier (6), not the frozen 50. (bug-hunt)
    state.authContext.plan = 'free';
    state.quota = quotaFixture({ sessionsPerDay: 50, sessionsUsedToday: 6 });

    const { POST } = await getProxyRoute();
    const response = await POST(proxyRequest());

    expect(response.status).toBe(429);
    const json = await response.json();
    expect(json.error).toBe('Quota exceeded');
    expect(json.quota).toEqual({ used: 6, limit: 6 }); // limit derived from current plan, not 50
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ALLOWS an enterprise (unlimited) user even when over the numeric cap', async () => {
    state.authContext.plan = 'enterprise';
    state.quota = quotaFixture({ sessionsPerDay: 6, sessionsUsedToday: 999 });

    const { POST } = await getProxyRoute();
    const response = await POST(proxyRequest());

    // Enterprise bypasses the numeric gate entirely (isUnlimited).
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ALLOWS a pro user under the cap', async () => {
    state.authContext.plan = 'pro';
    state.quota = quotaFixture({ sessionsPerDay: 50, sessionsUsedToday: 10 });

    const { POST } = await getProxyRoute();
    const response = await POST(proxyRequest());

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT charge quota when the BYOK key is missing (degrades to 403, no spend)', async () => {
    state.authContext.plan = 'free';
    state.quota = quotaFixture({ sessionsPerDay: 6, sessionsUsedToday: 1 });
    state.resolveApiKeyImpl = async () => {
      throw new ApiKeyResolverError('No BYOK key', 'NO_API_KEY', false);
    };

    const { POST } = await getProxyRoute();
    const response = await POST(proxyRequest());

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toBe('NO_API_KEY');
    // No upstream call, no counter increment: fails safe, never a fake success.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateQuotaMock).not.toHaveBeenCalled();
  });

  /**
   * FIXED 2026-08-07 (recoder-y41k): a user with NO user_quota row must NOT escape
   * the cap. Accounts created via a path that skips quota provisioning (some
   * OAuth/Better-Auth flows) previously proxied uncapped + untracked because the
   * gate was `if (quota && plan !== 'enterprise')`. The proxy now lazily creates a
   * free-tier row so the cap and usage tracking always apply to non-enterprise users.
   */
  it('caps a user with NO quota row by lazily creating a free-tier row (no uncapped escape)', async () => {
    state.authContext.plan = 'free';
    state.quota = null;

    const { POST } = await getProxyRoute();
    const response = await POST(proxyRequest());

    // First request lands under the freshly-created free-tier cap → allowed…
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // …but a free-tier row is CREATED and the session is TRACKED — no escape.
    expect(createQuotaMock).toHaveBeenCalledTimes(1);
    const created = createQuotaMock.mock.calls[0][0].data;
    expect(created.userId).toBe('u1');
    expect(created.sessionsPerDay).toBeGreaterThan(0);
    expect(updateQuotaMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT fabricate a quota row for an enterprise (unlimited) user with no row', async () => {
    state.authContext.plan = 'enterprise';
    state.quota = null;

    const { POST } = await getProxyRoute();
    const response = await POST(proxyRequest());

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Enterprise is unlimited — no row is fabricated, no session metering.
    expect(createQuotaMock).not.toHaveBeenCalled();
    expect(updateQuotaMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/cli/quota — advisory read agrees with the enforcement gate', () => {
  it('reports canMakeRequest=false for a free user at the cap', async () => {
    state.authContext.plan = 'free';
    state.quota = quotaFixture({ sessionsPerDay: 6, sessionsUsedToday: 6 });

    const { GET } = await getQuotaRoute();
    const response = await GET(quotaGetRequest());

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.canMakeRequest).toBe(false);
    expect(json.quota.sessionsRemaining).toBe(0);
    expect(json.message).toMatch(/quota exceeded/i);
  });

  it('reports canMakeRequest=true for an enterprise user even at the cap', async () => {
    state.authContext.plan = 'enterprise';
    state.quota = quotaFixture({ sessionsPerDay: 6, sessionsUsedToday: 6 });

    const { GET } = await getQuotaRoute();
    const json = await (await GET(quotaGetRequest())).json();

    expect(json.canMakeRequest).toBe(true);
    expect(json.quota.isUnlimited).toBe(true);
  });

  it('reports canMakeRequest=true for a free user under the cap', async () => {
    state.authContext.plan = 'free';
    state.quota = quotaFixture({ sessionsPerDay: 6, sessionsUsedToday: 2 });

    const { GET } = await getQuotaRoute();
    const json = await (await GET(quotaGetRequest())).json();

    expect(json.canMakeRequest).toBe(true);
    expect(json.quota.sessionsRemaining).toBe(4);
  });
});
