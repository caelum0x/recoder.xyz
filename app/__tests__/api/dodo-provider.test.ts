// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The provider wraps the REAL Dodo service; its own tests cover the SDK/HTTP
// internals, so here it is a seam.
const serviceMock = {
  createCheckoutSession: vi.fn(),
  cancelSubscription: vi.fn(),
  changePlan: vi.fn(),
};
vi.mock('@/lib/services/dodopayments.service', () => ({
  DodoPaymentsService: serviceMock,
}));

import {
  DODO_NOT_CONFIGURED,
  DodoProvider,
  dodoProductIdForPlan,
  getDodoProvider,
  normalizeDodoEvent,
} from '@/lib/payments/dodo-provider';

const SECRET = 'test-dodo-webhook-secret';
const FIXED_NOW_MS = 1_700_000_000_000;
const FIXED_TIMESTAMP = String(Math.floor(FIXED_NOW_MS / 1000));
const WEBHOOK_ID = 'msg_1';

/** Standard Webhooks signing: HMAC-SHA256(secret, `${id}.${timestamp}.${body}`), base64, `v1,` prefixed. */
function sign(
  payload: string,
  secret: string,
  id: string = WEBHOOK_ID,
  timestamp: string = FIXED_TIMESTAMP
): string {
  const digest = crypto
    .createHmac('sha256', secret)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');
  return `v1,${digest}`;
}

function provider() {
  return new DodoProvider({ apiKey: 'test_dodo_key', webhookSecret: SECRET });
}

function verify(p: DodoProvider, body: string, signature: string | null, id = WEBHOOK_ID, timestamp = FIXED_TIMESTAMP) {
  return p.verifyWebhook(body, signature, { id, timestamp });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW_MS);
  vi.stubEnv('DODO_API_KEY', 'test_dodo_key');
  vi.stubEnv('DODO_WEBHOOK_SECRET', SECRET);
  vi.stubEnv('DODO_PRODUCT_MONTHLY', 'prod_monthly_env');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('getDodoProvider — degraded when env is missing', () => {
  it('returns a fully degraded provider when neither API key nor webhook secret is set', async () => {
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
    const degraded = getDodoProvider();

    expect(degraded.configured).toBe(false);
    const failure = { ok: false, reason: DODO_NOT_CONFIGURED };
    await expect(
      degraded.createCheckout({
        userId: 'u1',
        email: 'u@example.com',
        planId: 'monthly',
        amount: 20,
        currency: 'USD',
        interval: 'month',
      })
    ).resolves.toEqual(failure);
    await expect(degraded.getSubscription('sub_1')).resolves.toEqual(failure);
    await expect(degraded.cancelSubscription('sub_1')).resolves.toEqual(failure);
    await expect(degraded.changePlan('sub_1', 'pro')).resolves.toEqual(failure);
    expect(degraded.verifyWebhook('{}', 'sig')).toEqual(failure);
  });

  it('still verifies webhooks when only the webhook secret is set, but API calls degrade', async () => {
    const p = new DodoProvider({ apiKey: null, webhookSecret: SECRET });
    const body = JSON.stringify({ type: 'subscription.created', data: { subscription_id: 's1' } });

    expect(p.configured).toBe(false);
    expect(verify(p, body, sign(body, SECRET)).ok).toBe(true);
    await expect(p.getSubscription('sub_1')).resolves.toEqual({
      ok: false,
      reason: DODO_NOT_CONFIGURED,
    });
  });
});

describe('dodoProductIdForPlan', () => {
  it('prefers env mapping, falls back to legacy defaults, null for unknown plans', () => {
    expect(dodoProductIdForPlan('monthly')).toBe('prod_monthly_env');
    expect(dodoProductIdForPlan('pro')).toBe('prod_pro');
    expect(dodoProductIdForPlan('gold')).toBeNull();
  });

  it('resolves team and pro-annual to their default product ids (previously missing)', () => {
    expect(dodoProductIdForPlan('team')).toBe('prod_team');
    expect(dodoProductIdForPlan('pro-annual')).toBe('prod_pro_annual');
  });

  it('normalizes a hyphenated plan id to an underscored env var name', () => {
    vi.stubEnv('DODO_PRODUCT_PRO_ANNUAL', 'pdt_real_pro_annual');
    expect(dodoProductIdForPlan('pro-annual')).toBe('pdt_real_pro_annual');
    // The un-normalized (hyphenated) env var name must NOT be consulted.
    vi.stubEnv('DODO_PRODUCT_PRO_ANNUAL', '');
    vi.stubEnv('DODO_PRODUCT_PRO-ANNUAL', 'should_never_be_read');
    expect(dodoProductIdForPlan('pro-annual')).toBe('prod_pro_annual');
  });

  it('resolves a configured team product id from env over the default', () => {
    vi.stubEnv('DODO_PRODUCT_TEAM', 'pdt_real_team');
    expect(dodoProductIdForPlan('team')).toBe('pdt_real_team');
  });
});

describe('DodoProvider.createCheckout — wraps the real service', () => {
  it('resolves the plan product and returns the session id/url', async () => {
    serviceMock.createCheckoutSession.mockResolvedValue({
      sessionId: 'sess_1',
      checkoutUrl: 'https://checkout.dodopayments.com/sess_1',
    });

    const result = await provider().createCheckout({
      userId: 'user_1',
      email: 'u@example.com',
      planId: 'monthly',
      amount: 20,
      currency: 'USD',
      interval: 'month',
    });

    expect(result).toEqual({
      ok: true,
      id: 'sess_1',
      checkoutUrl: 'https://checkout.dodopayments.com/sess_1',
    });
    expect(serviceMock.createCheckoutSession).toHaveBeenCalledWith('user_1', 'prod_monthly_env');
  });

  it('fails truthfully for unmapped plans and service throws', async () => {
    const input = {
      userId: 'user_1',
      email: 'u@example.com',
      planId: 'gold',
      amount: 20,
      currency: 'USD',
      interval: 'month',
    };
    await expect(provider().createCheckout(input)).resolves.toEqual({
      ok: false,
      reason: 'dodo_product_not_configured:gold',
    });
    expect(serviceMock.createCheckoutSession).not.toHaveBeenCalled();

    serviceMock.createCheckoutSession.mockRejectedValue(new Error('boom'));
    await expect(
      provider().createCheckout({ ...input, planId: 'monthly' })
    ).resolves.toEqual({ ok: false, reason: 'dodo_checkout_failed' });
  });
});

describe('DodoProvider.getSubscription — fake fetch', () => {
  it('GETs the Dodo subscription and normalizes it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        subscription_id: 'sub_1',
        status: 'active',
        product_id: 'prod_monthly_env',
        current_period_end: 1_800_000_000,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider().getSubscription('sub_1');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.dodopayments.com/subscriptions/sub_1',
      { headers: { Authorization: 'Bearer test_dodo_key' } }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.subscription.id).toBe('sub_1');
      expect(result.subscription.status).toBe('active');
      expect(result.subscription.planId).toBe('prod_monthly_env');
      expect(result.subscription.currentPeriodEnd).toEqual(new Date(1_800_000_000 * 1000));
    }
  });

  it('maps HTTP failures and network errors to a truthful reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => null }));
    await expect(provider().getSubscription('missing')).resolves.toEqual({
      ok: false,
      reason: 'dodo_subscription_fetch_failed',
    });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(provider().getSubscription('sub_1')).resolves.toEqual({
      ok: false,
      reason: 'dodo_subscription_fetch_failed',
    });
  });
});

describe('DodoProvider.cancelSubscription / changePlan — wrap the real service', () => {
  it('cancels at period end via the service', async () => {
    serviceMock.cancelSubscription.mockResolvedValue({ success: true });

    await expect(provider().cancelSubscription('internal_sub_1')).resolves.toEqual({
      ok: true,
      status: 'cancel_at_period_end',
    });
    expect(serviceMock.cancelSubscription).toHaveBeenCalledWith('internal_sub_1', true);

    serviceMock.cancelSubscription.mockRejectedValue(new Error('nope'));
    await expect(provider().cancelSubscription('internal_sub_1')).resolves.toEqual({
      ok: false,
      reason: 'dodo_cancel_failed',
    });
  });

  it('changes plan through the service with the mapped product id', async () => {
    serviceMock.changePlan.mockResolvedValue({ subscription_id: 'sub_9', status: 'active' });

    const result = await provider().changePlan('internal_sub_1', 'monthly');

    expect(serviceMock.changePlan).toHaveBeenCalledWith(
      'internal_sub_1',
      'prod_monthly_env',
      'prorated_immediately'
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.subscription.id).toBe('sub_9');
      expect(result.subscription.planId).toBe('monthly');
    }

    await expect(provider().changePlan('internal_sub_1', 'gold')).resolves.toEqual({
      ok: false,
      reason: 'dodo_product_not_configured:gold',
    });

    serviceMock.changePlan.mockRejectedValue(new Error('nope'));
    await expect(provider().changePlan('internal_sub_1', 'monthly')).resolves.toEqual({
      ok: false,
      reason: 'dodo_change_plan_failed',
    });
  });
});

describe('DodoProvider.verifyWebhook — real Standard Webhooks scheme', () => {
  // Real Dodo payloads: userId round-trips through checkout `metadata`, never
  // a top-level `user_id` (see `normalizeDodoEvent`'s doc comment).
  const body = JSON.stringify({
    type: 'subscription.created',
    data: {
      plan: 'monthly',
      subscription_id: 'sub_1',
      status: 'active',
      customer: { customer_id: 'cus_1', email: 'u@example.com' },
      metadata: { userId: 'user_1' },
    },
  });

  it('accepts a valid base64 v1 signature over id.timestamp.body and returns the normalized event', () => {
    const result = verify(provider(), body, sign(body, SECRET));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event).toMatchObject({
        type: 'subscription.created',
        subscriptionId: 'sub_1',
        userId: 'user_1',
        planId: 'monthly',
        status: 'active',
      });
    }
  });

  it('rejects wrong-secret, missing, and garbage signatures without throwing', () => {
    expect(verify(provider(), body, sign(body, 'wrong-secret'))).toEqual({
      ok: false,
      reason: 'dodo_invalid_signature',
    });
    expect(verify(provider(), body, null)).toEqual({
      ok: false,
      reason: 'dodo_invalid_signature',
    });
    // Truncated/garbage signature must reject, not throw.
    expect(verify(provider(), body, 'v1,abc')).toEqual({
      ok: false,
      reason: 'dodo_invalid_signature',
    });
  });

  it('rejects when webhook-id or webhook-timestamp is missing, even with a correctly-signed-looking value', () => {
    expect(provider().verifyWebhook(body, sign(body, SECRET))).toEqual({
      ok: false,
      reason: 'dodo_invalid_signature',
    });
    expect(provider().verifyWebhook(body, sign(body, SECRET), { id: WEBHOOK_ID })).toEqual({
      ok: false,
      reason: 'dodo_invalid_signature',
    });
  });

  it('rejects a stale webhook-timestamp outside the 5-minute replay window', () => {
    const staleTimestamp = String(Math.floor(FIXED_NOW_MS / 1000) - 600);
    const signature = sign(body, SECRET, WEBHOOK_ID, staleTimestamp);
    expect(verify(provider(), body, signature, WEBHOOK_ID, staleTimestamp)).toEqual({
      ok: false,
      reason: 'dodo_invalid_signature',
    });
  });

  it('accepts ANY matching entry in a space-delimited multi-signature header (key rotation)', () => {
    const real = sign(body, SECRET);
    const header = `v1,bogus-other-key-sig ${real}`;
    expect(verify(provider(), body, header).ok).toBe(true);
  });

  it('degrades truthfully when the webhook secret is missing', () => {
    const p = new DodoProvider({ apiKey: 'test_dodo_key' });
    expect(verify(p, body, sign(body, SECRET))).toEqual({
      ok: false,
      reason: DODO_NOT_CONFIGURED,
    });
  });

  it('rejects unparseable JSON and flags unhandled event types', () => {
    const junk = 'not-json';
    expect(verify(provider(), junk, sign(junk, SECRET))).toEqual({
      ok: false,
      reason: 'dodo_invalid_payload',
    });

    const refund = JSON.stringify({ type: 'refund.created', data: { metadata: { userId: 'u1' } } });
    expect(verify(provider(), refund, sign(refund, SECRET))).toEqual({
      ok: false,
      reason: 'dodo_unhandled_event',
    });
  });
});

describe('normalizeDodoEvent — fixture per payload shape', () => {
  it('maps subscription lifecycle raw types onto the normalized set', () => {
    expect(
      normalizeDodoEvent({ type: 'subscription.active', data: { subscription_id: 's1' } })?.type
    ).toBe('subscription.created');
    expect(
      normalizeDodoEvent({ type: 'subscription.renewed', data: { subscription_id: 's1' } })?.type
    ).toBe('subscription.updated');
    expect(
      normalizeDodoEvent({ type: 'subscription.plan_changed', data: { subscription_id: 's1' } })?.type
    ).toBe('subscription.updated');
    expect(
      normalizeDodoEvent({ type: 'subscription.cancelled', data: { subscription_id: 's1' } })?.type
    ).toBe('subscription.canceled');
  });

  it('marks on_hold as an update carrying the on_hold status', () => {
    const event = normalizeDodoEvent({
      type: 'subscription.on_hold',
      data: { subscription_id: 's1' },
    });
    expect(event).toMatchObject({ type: 'subscription.updated', status: 'on_hold' });
  });

  it('resolves userId from checkout metadata (the real Dodo shape — no top-level user_id)', () => {
    const event = normalizeDodoEvent({
      type: 'subscription.created',
      data: {
        subscription_id: 's1',
        plan: 'monthly',
        customer: { customer_id: 'cus_1', email: 'u@example.com' },
        metadata: { userId: 'user_1' },
      },
    });
    expect(event).toMatchObject({ userId: 'user_1', subscriptionId: 's1' });
  });

  it('falls back to legacy data.user_id when metadata.userId is absent', () => {
    const event = normalizeDodoEvent({
      type: 'subscription.created',
      data: { subscription_id: 's1', user_id: 'user_legacy' },
    });
    expect(event).toMatchObject({ userId: 'user_legacy' });
  });

  it('lets payment events without a subscription id through when a userId is present', () => {
    const event = normalizeDodoEvent({
      type: 'payment.succeeded',
      data: { metadata: { userId: 'user_1' }, transaction_id: 't1', amount: 20 },
    });
    expect(event).toMatchObject({
      type: 'payment.succeeded',
      subscriptionId: 't1',
      userId: 'user_1',
    });
    expect(
      normalizeDodoEvent({ type: 'payment.succeeded', data: { amount: 20 } })
    ).toBeNull();
  });

  it('returns null for unknown types, missing subscription ids, and non-object payloads', () => {
    expect(normalizeDodoEvent({ type: 'refund.created', data: { user_id: 'u1' } })).toBeNull();
    expect(normalizeDodoEvent({ type: 'subscription.created', data: {} })).toBeNull();
    expect(normalizeDodoEvent('nope')).toBeNull();
    expect(normalizeDodoEvent(null)).toBeNull();
  });
});
