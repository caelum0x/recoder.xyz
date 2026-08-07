import { getDodoProvider } from '@/lib/payments/dodo-provider';
import { getProvider } from '@/lib/payments/registry';
import { degradedProvider } from '@/lib/payments/provider';
import { detectBillingHealth } from '@/lib/billing-health';
import { resolveEntitlements } from '@/lib/entitlements';

/**
 * Billing FAIL-SAFE e2e — proves the money path degrades safe when keys are
 * absent: a provider with no configured key never throws at import and never
 * fakes success — its methods return the degraded `{ ok: false, reason }`. The
 * entitlements resolver never 500s on an unknown plan; it returns free.
 *
 * Repo billing law: fail safe, never fake success, never crash at import.
 */

const DODO_ENV_KEYS = [
  'DODO_PAYMENTS_API_KEY',
  'DODO_API_KEY',
  'DODO_API_KEY_LIVE',
  'DODO_API_KEY_TEST',
  'DODO_PAY_API_KEY',
  'DODO_WEBHOOK_SECRET',
];

describe('billing degrades safe when no provider key is configured', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of DODO_ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of DODO_ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it('an unconfigured provider reports configured=false and never fakes a checkout', async () => {
    const provider = getDodoProvider();
    expect(provider.configured).toBe(false);

    const checkout = await provider.createCheckout({
      userId: 'u1',
      email: 'user@example.com',
      planId: 'pro',
      amount: 999,
      currency: 'usd',
      interval: 'month',
    });

    // Degraded, truthful reason — NOT a fabricated checkoutUrl.
    expect(checkout.ok).toBe(false);
    expect((checkout as { reason?: string }).reason).toBe('dodo_not_configured');
  });

  it('every degraded method returns {ok:false} without throwing', async () => {
    const provider = getDodoProvider();

    const results = [
      await provider.getSubscription('sub_1'),
      await provider.cancelSubscription('sub_1'),
      await provider.changePlan('sub_1', 'pro'),
    ];
    for (const result of results) {
      expect(result.ok).toBe(false);
    }

    // verifyWebhook is sync; a missing secret must reject, never accept blindly.
    const verify = provider.verifyWebhook('{}', 'sig');
    expect(verify.ok).toBe(false);
  });

  it('the registry resolves an unknown provider to a degraded stub (no throw)', async () => {
    const provider = getProvider('does-not-exist');
    expect(provider.configured).toBe(false);

    const checkout = await provider.createCheckout({
      userId: 'u1',
      email: 'user@example.com',
      planId: 'pro',
      amount: 0,
      currency: 'usd',
      interval: 'month',
    });
    expect(checkout.ok).toBe(false);
    expect((checkout as { reason?: string }).reason).toBe('unknown_provider:does-not-exist');
  });

  it('the shared degradedProvider stub never throws and never returns ok:true', async () => {
    const provider = degradedProvider('paddle', 'paddle_not_configured');
    expect(provider.configured).toBe(false);
    expect((await provider.createCheckout({} as never)).ok).toBe(false);
    expect((await provider.getSubscription('x')).ok).toBe(false);
    expect((await provider.cancelSubscription('x')).ok).toBe(false);
    expect((await provider.changePlan('x', 'pro')).ok).toBe(false);
    expect(provider.verifyWebhook('', null).ok).toBe(false);
  });
});

describe('billing health reports truthfully with no keys (never throws)', () => {
  it('an empty env yields activeProvider=none and configured=false', () => {
    const health = detectBillingHealth({} as NodeJS.ProcessEnv);
    expect(health.configured).toBe(false);
    expect(health.activeProvider).toBe('none');
    expect(health.dodo.configured).toBe(false);
    expect(health.polar.configured).toBe(false);
    expect(health.paddle.configured).toBe(false);
  });

  it('treats placeholder secrets as unconfigured (no fake readiness)', () => {
    const health = detectBillingHealth({
      NODE_ENV: 'test',
      DODO_API_KEY: 'your_live_api_key_here # obtained from dashboard',
      POLAR_API_KEY: 'REPLACE_ME',
    } as NodeJS.ProcessEnv);
    expect(health.configured).toBe(false);
    expect(health.activeProvider).toBe('none');
  });
});

describe('entitlements resolver never 500s on bad input (returns free)', () => {
  it('an unknown stored plan degrades to free features, not a throw', () => {
    const resolved = resolveEntitlements({
      subscriptionPlan: 'legacy-platinum',
      subscriptionStatus: 'active',
    });
    expect(resolved.plan).toBe('free');
    expect(resolved.features.assisted_synthesize).toBe(false);
    expect(resolved.features.parallel_agents).toBe(2);
  });

  it('a null user resolves to free/inactive without throwing', () => {
    const resolved = resolveEntitlements(null);
    expect(resolved.plan).toBe('free');
    expect(resolved.status).toBe('inactive'); // fail-safe: absent status is not active
  });
});
