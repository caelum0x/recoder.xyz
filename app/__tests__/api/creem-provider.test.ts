// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  CREEM_NOT_CONFIGURED,
  CreemProvider,
  getCreemProvider,
  normalizeCreemEvent,
  type CreemHttp,
  type CreemHttpResponse,
} from '@/lib/services/creem.service';

const SECRET = 'test-creem-secret';

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

interface RecordedCall {
  path: string;
  method: 'GET' | 'POST';
  body?: unknown;
}

function fakeHttp(response: CreemHttpResponse): { http: CreemHttp; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  return {
    calls,
    http: {
      async request(path, init) {
        calls.push({ path, method: init.method, body: init.body });
        return response;
      },
    },
  };
}

beforeEach(() => {
  vi.stubEnv('CREEM_API_KEY', 'test_api_key');
  vi.stubEnv('CREEM_WEBHOOK_SECRET', SECRET);
  vi.stubEnv('CREEM_PRODUCT_MONTHLY', 'prod_monthly_creem');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getCreemProvider — degraded when env is missing', () => {
  it('returns a degraded provider that never throws when CREEM_API_KEY is absent', async () => {
    vi.stubEnv('CREEM_API_KEY', '');
    const provider = getCreemProvider();

    expect(provider.configured).toBe(false);
    const failure = { ok: false, reason: CREEM_NOT_CONFIGURED };
    await expect(
      provider.createCheckout({
        userId: 'u1',
        email: 'u@example.com',
        planId: 'monthly',
        amount: 20,
        currency: 'USD',
        interval: 'month',
      })
    ).resolves.toEqual(failure);
    await expect(provider.getSubscription('sub_1')).resolves.toEqual(failure);
    await expect(provider.cancelSubscription('sub_1')).resolves.toEqual(failure);
    await expect(provider.changePlan('sub_1', 'pro')).resolves.toEqual(failure);
    expect(provider.verifyWebhook('{}', 'sig')).toEqual(failure);
  });

  it('verifyWebhook degrades to creem_not_configured when only the webhook secret is missing', () => {
    vi.stubEnv('CREEM_WEBHOOK_SECRET', '');
    const provider = getCreemProvider(fakeHttp({ ok: true, status: 200, json: {} }).http);
    expect(provider.verifyWebhook('{}', 'sig')).toEqual({
      ok: false,
      reason: CREEM_NOT_CONFIGURED,
    });
  });
});

describe('CreemProvider.createCheckout', () => {
  it('POSTs /v1/checkouts with the env-mapped product and userId metadata', async () => {
    const { http, calls } = fakeHttp({
      ok: true,
      status: 200,
      json: { id: 'ch_1', checkout_url: 'https://creem.io/checkout/ch_1' },
    });
    const provider = getCreemProvider(http);

    const result = await provider.createCheckout({
      userId: 'user_1',
      email: 'u@example.com',
      planId: 'monthly',
      amount: 20,
      currency: 'USD',
      interval: 'month',
    });

    expect(result).toEqual({
      ok: true,
      id: 'ch_1',
      checkoutUrl: 'https://creem.io/checkout/ch_1',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe('/v1/checkouts');
    expect(calls[0].method).toBe('POST');
    const body = calls[0].body as Record<string, any>;
    expect(body.product_id).toBe('prod_monthly_creem');
    expect(body.customer).toEqual({ email: 'u@example.com' });
    expect(body.metadata).toEqual({
      userId: 'user_1',
      planId: 'monthly',
      amount: 20,
      currency: 'USD',
      interval: 'month',
    });
    expect(typeof body.success_url).toBe('string');
  });

  it('fails truthfully when the plan has no CREEM_PRODUCT_* mapping', async () => {
    const { http, calls } = fakeHttp({ ok: true, status: 200, json: {} });
    const provider = getCreemProvider(http);

    const result = await provider.createCheckout({
      userId: 'user_1',
      email: 'u@example.com',
      planId: 'weekly',
      amount: 10,
      currency: 'USD',
      interval: 'week',
    });

    expect(result).toEqual({ ok: false, reason: 'creem_product_not_configured:weekly' });
    expect(calls).toHaveLength(0);
  });

  it('maps HTTP failure and malformed responses to distinct reasons', async () => {
    const failing = getCreemProvider(fakeHttp({ ok: false, status: 402, json: null }).http);
    const malformed = getCreemProvider(fakeHttp({ ok: true, status: 200, json: { nope: 1 } }).http);
    const input = {
      userId: 'user_1',
      email: 'u@example.com',
      planId: 'monthly',
      amount: 20,
      currency: 'USD',
      interval: 'month',
    };

    await expect(failing.createCheckout(input)).resolves.toEqual({
      ok: false,
      reason: 'creem_checkout_failed',
    });
    await expect(malformed.createCheckout(input)).resolves.toEqual({
      ok: false,
      reason: 'creem_checkout_malformed_response',
    });
  });
});

describe('CreemProvider subscription operations', () => {
  it('getSubscription GETs /v1/subscriptions/{id} and normalizes the result', async () => {
    const { http, calls } = fakeHttp({
      ok: true,
      status: 200,
      json: {
        id: 'sub_1',
        status: 'active',
        product: { id: 'prod_monthly_creem' },
        current_period_end_date: '2026-09-01T00:00:00.000Z',
      },
    });
    const provider = getCreemProvider(http);

    const result = await provider.getSubscription('sub_1');

    expect(calls[0]).toEqual({ path: '/v1/subscriptions/sub_1', method: 'GET', body: undefined });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.subscription.id).toBe('sub_1');
      expect(result.subscription.status).toBe('active');
      expect(result.subscription.planId).toBe('monthly');
      expect(result.subscription.currentPeriodEnd).toEqual(new Date('2026-09-01T00:00:00.000Z'));
    }
  });

  it('cancelSubscription POSTs the cancel path and returns the provider status', async () => {
    const { http, calls } = fakeHttp({ ok: true, status: 200, json: { id: 'sub_1', status: 'canceled' } });
    const provider = getCreemProvider(http);

    await expect(provider.cancelSubscription('sub_1')).resolves.toEqual({
      ok: true,
      status: 'canceled',
    });
    expect(calls[0].path).toBe('/v1/subscriptions/sub_1/cancel');
    expect(calls[0].method).toBe('POST');
  });

  it('reactivateSubscription POSTs the reactivate path and returns the provider status', async () => {
    const { http, calls } = fakeHttp({ ok: true, status: 200, json: { id: 'sub_1', status: 'active' } });
    const provider = getCreemProvider(http);

    await expect(provider.reactivateSubscription!('sub_1')).resolves.toEqual({
      ok: true,
      status: 'active',
    });
    expect(calls[0].path).toBe('/v1/subscriptions/sub_1/reactivate');
    expect(calls[0].method).toBe('POST');
  });

  it('reactivateSubscription maps an HTTP failure to a truthful reason', async () => {
    const provider = getCreemProvider(fakeHttp({ ok: false, status: 402, json: null }).http);
    await expect(provider.reactivateSubscription!('sub_1')).resolves.toEqual({
      ok: false,
      reason: 'creem_reactivate_failed',
    });
  });

  it('changePlan POSTs the upgrade path with the mapped product id', async () => {
    const { http, calls } = fakeHttp({
      ok: true,
      status: 200,
      json: { id: 'sub_1', status: 'active', product: 'prod_monthly_creem' },
    });
    const provider = getCreemProvider(http);

    const result = await provider.changePlan('sub_1', 'monthly');

    expect(calls[0].path).toBe('/v1/subscriptions/sub_1/upgrade');
    expect(calls[0].body).toEqual({ product_id: 'prod_monthly_creem' });
    expect(result.ok).toBe(true);

    await expect(provider.changePlan('sub_1', 'weekly')).resolves.toEqual({
      ok: false,
      reason: 'creem_product_not_configured:weekly',
    });
  });
});

describe('CreemProvider.verifyWebhook', () => {
  function provider() {
    return getCreemProvider(fakeHttp({ ok: true, status: 200, json: {} }).http);
  }

  const body = JSON.stringify({
    eventType: 'subscription.active',
    object: { id: 'sub_1', status: 'active', metadata: { userId: 'user_1', planId: 'monthly' } },
  });

  it('accepts a valid HMAC-SHA256 hex signature and returns the normalized event', () => {
    const result = provider().verifyWebhook(body, sign(body, SECRET));
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

  it('rejects a signature computed with the wrong secret', () => {
    expect(provider().verifyWebhook(body, sign(body, 'wrong-secret'))).toEqual({
      ok: false,
      reason: 'creem_invalid_signature',
    });
  });

  it('rejects a missing or truncated signature header without throwing', () => {
    expect(provider().verifyWebhook(body, null)).toEqual({
      ok: false,
      reason: 'creem_invalid_signature',
    });
    expect(provider().verifyWebhook(body, 'abc')).toEqual({
      ok: false,
      reason: 'creem_invalid_signature',
    });
  });

  it('rejects unparseable JSON and flags unhandled event types', () => {
    const junk = 'not-json';
    expect(provider().verifyWebhook(junk, sign(junk, SECRET))).toEqual({
      ok: false,
      reason: 'creem_invalid_payload',
    });

    const unhandled = JSON.stringify({ eventType: 'dispute.created', object: { id: 'dp_1' } });
    expect(provider().verifyWebhook(unhandled, sign(unhandled, SECRET))).toEqual({
      ok: false,
      reason: 'creem_unhandled_event',
    });
  });
});

describe('normalizeCreemEvent — fixture per assumed payload shape', () => {
  it('maps subscription.active to subscription.created', () => {
    const event = normalizeCreemEvent({
      eventType: 'subscription.active',
      object: { id: 'sub_1', status: 'active', metadata: { userId: 'user_1', planId: 'pro' } },
    });
    expect(event).toMatchObject({
      type: 'subscription.created',
      subscriptionId: 'sub_1',
      userId: 'user_1',
      planId: 'pro',
      status: 'active',
    });
  });

  it('maps checkout.completed using the nested subscription object', () => {
    const event = normalizeCreemEvent({
      eventType: 'checkout.completed',
      object: {
        id: 'ch_1',
        metadata: { userId: 'user_1', planId: 'monthly' },
        subscription: { id: 'sub_2', status: 'active' },
      },
    });
    expect(event).toMatchObject({
      type: 'subscription.created',
      subscriptionId: 'sub_2',
      userId: 'user_1',
      planId: 'monthly',
      status: 'active',
    });
  });

  it('resolves planId from the env product mapping when metadata omits it', () => {
    const event = normalizeCreemEvent({
      eventType: 'subscription.active',
      object: { id: 'sub_1', status: 'active', product: { id: 'prod_monthly_creem' } },
    });
    expect(event?.planId).toBe('monthly');
  });

  it('maps cancellation and payment events to the normalized types', () => {
    expect(
      normalizeCreemEvent({ eventType: 'subscription.canceled', object: { id: 'sub_1' } })?.type
    ).toBe('subscription.canceled');
    expect(
      normalizeCreemEvent({ eventType: 'subscription.expired', object: { id: 'sub_1' } })?.type
    ).toBe('subscription.canceled');
    expect(
      normalizeCreemEvent({ eventType: 'subscription.paid', object: { id: 'sub_1' } })?.type
    ).toBe('payment.succeeded');
    expect(
      normalizeCreemEvent({ eventType: 'subscription.unpaid', object: { id: 'sub_1' } })?.type
    ).toBe('payment.failed');
  });

  it('returns null for unknown types, missing ids, and non-object payloads', () => {
    expect(normalizeCreemEvent({ eventType: 'refund.created', object: { id: 'r_1' } })).toBeNull();
    expect(normalizeCreemEvent({ eventType: 'subscription.active', object: {} })).toBeNull();
    expect(normalizeCreemEvent('nope')).toBeNull();
    expect(normalizeCreemEvent(null)).toBeNull();
  });
});

describe('CreemProvider construction', () => {
  it('is constructible directly with an injected http seam (no env reads at import)', () => {
    const provider = new CreemProvider({
      http: fakeHttp({ ok: true, status: 200, json: {} }).http,
      webhookSecret: SECRET,
    });
    expect(provider.name).toBe('creem');
    expect(provider.configured).toBe(true);
  });
});
