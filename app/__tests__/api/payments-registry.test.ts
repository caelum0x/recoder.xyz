// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The paddle provider (imported by the registry) touches prisma at call time;
// keep the module graph import-safe in tests.
vi.mock('@/lib/prisma', () => ({ prisma: { subscriptions: { findFirst: vi.fn() } } }));

import { getProvider } from '@/lib/payments/registry';

beforeEach(() => {
  vi.stubEnv('CREEM_API_KEY', 'creem_key');
  vi.stubEnv('DODO_API_KEY', 'dodo_key');
  vi.stubEnv('PADDLE_WEBHOOK_SECRET', 'paddle_secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getProvider — registry resolution', () => {
  it('resolves each configured provider by name', () => {
    expect(getProvider('creem').name).toBe('creem');
    expect(getProvider('creem').configured).toBe(true);
    expect(getProvider('dodo').name).toBe('dodo');
    expect(getProvider('dodo').configured).toBe(true);
    expect(getProvider('paddle').name).toBe('paddle');
    expect(getProvider('paddle').configured).toBe(true);
  });

  it('returns degraded (never-throwing) providers when env keys are missing', async () => {
    vi.stubEnv('CREEM_API_KEY', '');
    for (const key of [
      'DODO_PAYMENTS_API_KEY',
      'DODO_API_KEY',
      'DODO_API_KEY_TEST',
      'DODO_API_KEY_LIVE',
      'DODO_PAY_API_KEY',
      'DODO_WEBHOOK_SECRET',
    ]) {
      vi.stubEnv(key, '');
    }

    const creem = getProvider('creem');
    expect(creem.configured).toBe(false);
    await expect(creem.getSubscription('sub_1')).resolves.toEqual({
      ok: false,
      reason: 'creem_not_configured',
    });

    const dodo = getProvider('dodo');
    expect(dodo.configured).toBe(false);
    expect(dodo.verifyWebhook('{}', 'sig')).toEqual({
      ok: false,
      reason: 'dodo_not_configured',
    });
  });

  it('returns a truthful degraded stub for unknown provider names', async () => {
    const unknown = getProvider('stripe');
    expect(unknown.name).toBe('stripe');
    expect(unknown.configured).toBe(false);
    await expect(unknown.cancelSubscription('sub_1')).resolves.toEqual({
      ok: false,
      reason: 'unknown_provider:stripe',
    });
    expect(unknown.verifyWebhook('{}', null)).toEqual({
      ok: false,
      reason: 'unknown_provider:stripe',
    });
  });
});
