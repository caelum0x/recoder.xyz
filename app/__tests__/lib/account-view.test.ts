import { describe, expect, it } from 'vitest';
import {
  buildAccountView,
  cliTokenPrefix,
  TOKEN_PREFIX_LENGTH,
  type AccountApiKeyInput,
  type AccountCliSessionInput,
} from '@/app/[locale]/account/account-view';

/**
 * Logic-level tests for the /account page data assembly: entitlement wiring,
 * quota math, and the token-safety invariant (no token material in the view).
 */

const ACCESS_TOKEN = 'reco_live_abcdef1234567890_secret_material';

function cliSession(overrides: Partial<AccountCliSessionInput> = {}): AccountCliSessionInput {
  return {
    id: 'sess-1',
    deviceName: 'MacBook Pro',
    deviceType: 'cli',
    accessToken: ACCESS_TOKEN,
    createdAt: new Date('2026-08-01T10:00:00Z'),
    lastUsedAt: new Date('2026-08-02T10:00:00Z'),
    revokedAt: null,
    isActive: true,
    ...overrides,
  };
}

function apiKey(overrides: Partial<AccountApiKeyInput> = {}): AccountApiKeyInput {
  return {
    id: 'key-1',
    name: 'CI key',
    keyPrefix: 'sk_live_ab',
    createdAt: new Date('2026-07-01T00:00:00Z'),
    lastUsedAt: null,
    isActive: true,
    ...overrides,
  };
}

describe('cliTokenPrefix', () => {
  it('returns a short redacted prefix, never the full token', () => {
    const prefix = cliTokenPrefix(ACCESS_TOKEN);
    expect(prefix).toBe(`${ACCESS_TOKEN.slice(0, TOKEN_PREFIX_LENGTH)}…`);
    expect(prefix.length).toBeLessThan(ACCESS_TOKEN.length);
  });
});

describe('buildAccountView', () => {
  it('resolves plan/status/features from user + subscription (subscription wins)', () => {
    const view = buildAccountView({
      user: { subscriptionPlan: 'free', subscriptionStatus: 'active' },
      subscription: { planId: 'pro-monthly', status: 'active' },
      quota: null,
      cliSessions: [],
      apiKeys: [],
    });
    expect(view.plan.plan).toBe('pro');
    expect(view.plan.status).toBe('active');
    expect(view.plan.features.parallel_agents).toBe(8);
  });

  it('offers an upgrade for a non-top tier but not for enterprise', () => {
    const pro = buildAccountView({
      user: { subscriptionPlan: 'pro', subscriptionStatus: 'active' },
      subscription: null,
      quota: null,
      cliSessions: [],
      apiKeys: [],
    });
    expect(pro.canUpgrade).toBe(true);

    const enterprise = buildAccountView({
      user: { subscriptionPlan: 'enterprise', subscriptionStatus: 'active' },
      subscription: null,
      quota: null,
      cliSessions: [],
      apiKeys: [],
    });
    expect(enterprise.canUpgrade).toBe(false);
  });

  it('degrades a non-active subscription to free features while keeping the truthful status', () => {
    const view = buildAccountView({
      user: { subscriptionPlan: 'pro', subscriptionStatus: 'past_due' },
      subscription: null,
      quota: null,
      cliSessions: [],
      apiKeys: [],
    });
    expect(view.plan.plan).toBe('pro');
    expect(view.plan.status).toBe('past_due');
    expect(view.plan.features.parallel_agents).toBe(2);
  });

  it('computes usage numbers from the quota row and clamps remaining at zero', () => {
    const view = buildAccountView({
      user: null,
      subscription: null,
      quota: {
        sessionsPerDay: 6,
        sessionsUsedToday: 9,
        tokensPerSession: 10000,
        periodEnd: new Date('2026-08-02T23:59:59Z'),
      },
      cliSessions: [],
      apiKeys: [],
    });
    expect(view.usage).toEqual({
      sessionsUsedToday: 9,
      sessionsPerDay: 6,
      remaining: 0,
      tokensPerSession: 10000,
      periodEnd: '2026-08-02T23:59:59.000Z',
      // over-limit usage clamps the display bar at 100, never past it
      usedPercent: 100,
    });
  });

  it('derives a mid-range usedPercent and guards a zero limit against divide-by-zero', () => {
    const partial = buildAccountView({
      user: null,
      subscription: null,
      quota: {
        sessionsPerDay: 8,
        sessionsUsedToday: 2,
        tokensPerSession: 10000,
        periodEnd: new Date('2026-08-02T23:59:59Z'),
      },
      cliSessions: [],
      apiKeys: [],
    });
    expect(partial.usage?.usedPercent).toBe(25);

    const zeroLimit = buildAccountView({
      user: null,
      subscription: null,
      quota: {
        sessionsPerDay: 0,
        sessionsUsedToday: 3,
        tokensPerSession: 10000,
        periodEnd: new Date('2026-08-02T23:59:59Z'),
      },
      cliSessions: [],
      apiKeys: [],
    });
    expect(zeroLimit.usage?.usedPercent).toBe(0);
  });

  it('reports absent usage as null instead of faking zeros', () => {
    const view = buildAccountView({
      user: null,
      subscription: null,
      quota: null,
      cliSessions: [],
      apiKeys: [],
    });
    expect(view.usage).toBeNull();
  });

  it('maps device rows with prefix-only tokens and revoked flags', () => {
    const view = buildAccountView({
      user: null,
      subscription: null,
      quota: null,
      cliSessions: [
        cliSession(),
        cliSession({ id: 'sess-2', revokedAt: new Date('2026-08-03T00:00:00Z'), isActive: false }),
        cliSession({ id: 'sess-3', deviceName: null }),
      ],
      apiKeys: [apiKey()],
    });

    expect(view.devices).toHaveLength(3);
    expect(view.devices[0].revoked).toBe(false);
    expect(view.devices[1].revoked).toBe(true);
    expect(view.devices[2].deviceName).toBe('Unnamed device');
    expect(view.apiKeys[0].keyPrefix).toBe('sk_live_ab');

    // CRITICAL: the serialized view carries no token material anywhere.
    const raw = JSON.stringify(view);
    expect(raw).not.toContain(ACCESS_TOKEN);
    expect(raw).toContain(cliTokenPrefix(ACCESS_TOKEN));
  });
});
