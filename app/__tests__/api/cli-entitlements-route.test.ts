import { NextRequest } from 'next/server';
import { getEntitlementFeatures } from '@/lib/entitlements';

/**
 * GET /api/cli/entitlements — authoritative tier/feature check for the desktop.
 * Uses an in-memory prisma fake + a mocked CLIAuthService (bearer reco_ tokens).
 */

type UserRow = { subscriptionPlan: string | null; subscriptionStatus: string | null };
type SubscriptionRow = { planId: string; status: string };
type QuotaRow = {
  sessionsPerDay: number;
  sessionsUsedToday: number;
  tokensPerSession: number;
  periodEnd: Date;
};

const state: {
  user: UserRow | null;
  subscription: SubscriptionRow | null;
  quota: QuotaRow | null;
  authContext: { userId: string; email: string; name: string; plan: string; status: string };
} = {
  user: null,
  subscription: null,
  quota: null,
  authContext: { userId: 'u1', email: 'user@example.com', name: 'Test', plan: 'pro', status: 'active' },
};

vi.mock('@/lib/services/cli-auth.service', () => ({
  CLIAuthService: {
    validateAccessToken: vi.fn(async () => ({ ...state.authContext, sessionId: 's1' })),
    validateApiKey: vi.fn(async () => ({ ...state.authContext, keyId: 'k1' })),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    users: {
      findUnique: vi.fn(async () => (state.user ? { ...state.user } : null)),
    },
    subscriptions: {
      findFirst: vi.fn(async () => (state.subscription ? { ...state.subscription } : null)),
    },
    user_quota: {
      findUnique: vi.fn(async () => (state.quota ? { ...state.quota } : null)),
    },
  },
}));

function futureDate(): Date {
  return new Date(Date.now() + 60 * 60 * 1000);
}

function authedRequest(): NextRequest {
  return new NextRequest('http://localhost/api/cli/entitlements', {
    headers: { authorization: 'Bearer reco_test_token' },
  });
}

async function getRoute() {
  return import('@/app/api/cli/entitlements/route');
}

describe('GET /api/cli/entitlements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.user = { subscriptionPlan: 'pro', subscriptionStatus: 'active' };
    state.subscription = null;
    state.quota = {
      sessionsPerDay: 20,
      sessionsUsedToday: 3,
      tokensPerSession: 100000,
      periodEnd: futureDate(),
    };
    state.authContext = {
      userId: 'u1',
      email: 'user@example.com',
      name: 'Test',
      plan: 'pro',
      status: 'active',
    };
  });

  it('rejects requests without an authorization header (401)', async () => {
    const { GET } = await getRoute();
    const response = await GET(new NextRequest('http://localhost/api/cli/entitlements'));
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe('Authentication failed');
  });

  it('rejects malformed bearer tokens (401)', async () => {
    const { GET } = await getRoute();
    const response = await GET(
      new NextRequest('http://localhost/api/cli/entitlements', {
        headers: { authorization: 'Bearer not_a_recoder_token' },
      })
    );
    expect(response.status).toBe(401);
  });

  it('returns the {plan, status, features, quota} envelope with no-store caching', async () => {
    const { GET } = await getRoute();
    const response = await GET(authedRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');

    const json = await response.json();
    expect(json.plan).toBe('pro');
    expect(json.status).toBe('active');
    expect(json.features).toEqual(getEntitlementFeatures('pro'));
    expect(json.quota).toEqual({
      sessionsPerDay: 20,
      sessionsUsed: 3,
      sessionsRemaining: 17,
      tokensPerSession: 100000,
      periodEnd: state.quota!.periodEnd.toISOString(),
      isUnlimited: false,
    });
  });

  it('marks enterprise quota as unlimited', async () => {
    state.user = { subscriptionPlan: 'enterprise', subscriptionStatus: 'active' };
    const { GET } = await getRoute();
    const json = await (await GET(authedRequest())).json();
    expect(json.plan).toBe('enterprise');
    expect(json.quota.isUnlimited).toBe(true);
  });

  it('degrades an unknown stored plan to free features', async () => {
    state.user = { subscriptionPlan: 'legacy-gold', subscriptionStatus: 'active' };
    const { GET } = await getRoute();
    const json = await (await GET(authedRequest())).json();
    expect(json.plan).toBe('free');
    expect(json.features).toEqual(getEntitlementFeatures('free'));
  });

  it('degrades features (not the reported plan/status) when the DB says canceled', async () => {
    state.user = { subscriptionPlan: 'pro', subscriptionStatus: 'canceled' };
    const { GET } = await getRoute();
    const json = await (await GET(authedRequest())).json();
    expect(json.plan).toBe('pro');
    expect(json.status).toBe('canceled');
    expect(json.features).toEqual(getEntitlementFeatures('free'));
  });

  it('prefers the active subscription record over the user row', async () => {
    state.user = { subscriptionPlan: 'free', subscriptionStatus: 'active' };
    state.subscription = { planId: 'pro-monthly', status: 'active' };
    const { GET } = await getRoute();
    const json = await (await GET(authedRequest())).json();
    expect(json.plan).toBe('pro');
    expect(json.features).toEqual(getEntitlementFeatures('pro'));
  });

  it('falls back to premium quota defaults when no quota row exists', async () => {
    state.quota = null;
    const { GET } = await getRoute();
    const json = await (await GET(authedRequest())).json();
    expect(json.quota).toEqual({
      sessionsPerDay: 50,
      sessionsUsed: 0,
      sessionsRemaining: 50,
      tokensPerSession: 50000,
      periodEnd: null,
      isUnlimited: false,
    });
  });

  it('treats a lapsed quota period as reset without persisting', async () => {
    state.quota = {
      sessionsPerDay: 20,
      sessionsUsedToday: 20,
      tokensPerSession: 100000,
      periodEnd: new Date(Date.now() - 60 * 60 * 1000),
    };
    const { GET } = await getRoute();
    const json = await (await GET(authedRequest())).json();
    expect(json.quota.sessionsUsed).toBe(0);
    expect(json.quota.sessionsRemaining).toBe(20);
  });
});
