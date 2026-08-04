// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const prismaMock = vi.hoisted(() => ({
  subscriptions: { findFirst: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

const credentialsMock = vi.hoisted(() => ({
  resolvePaddleVendorId: vi.fn(),
  resolvePaddleAuthCode: vi.fn(),
}));
vi.mock('@/lib/billing-credentials', () => credentialsMock);

import {
  PADDLE_CHECKOUT_IS_CLIENT_SIDE,
  PADDLE_NOT_CONFIGURED,
  PaddleProvider,
  getPaddleProvider,
  normalizePaddleEvent,
} from '@/lib/payments/paddle-provider';

const SECRET = 'test-paddle-webhook-secret';

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function provider() {
  return new PaddleProvider({ webhookSecret: SECRET });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.subscriptions.findFirst.mockResolvedValue(null);
  credentialsMock.resolvePaddleVendorId.mockReturnValue('12345');
  credentialsMock.resolvePaddleAuthCode.mockReturnValue('auth_code');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('PaddleProvider truthful-degrade shapes', () => {
  it('createCheckout is truthfully client-side', async () => {
    await expect(
      provider().createCheckout({
        userId: 'u1',
        email: 'u@example.com',
        planId: 'pro',
        amount: 100,
        currency: 'USD',
        interval: 'month',
      } as any)
    ).resolves.toEqual({ ok: false, reason: PADDLE_CHECKOUT_IS_CLIENT_SIDE });
  });

  it('changePlan is truthfully unimplemented server-side', async () => {
    await expect(provider().changePlan('sub_1', 'pro')).resolves.toEqual({
      ok: false,
      reason: 'paddle_change_plan_not_implemented',
    });
  });

  it('cancelSubscription degrades when vendor credentials are missing', async () => {
    credentialsMock.resolvePaddleVendorId.mockReturnValue(null);
    await expect(provider().cancelSubscription('sub_1')).resolves.toEqual({
      ok: false,
      reason: PADDLE_NOT_CONFIGURED,
    });
  });

  it('verifyWebhook degrades when PADDLE_WEBHOOK_SECRET is unset', () => {
    vi.stubEnv('PADDLE_WEBHOOK_SECRET', '');
    const p = getPaddleProvider();
    expect(p.configured).toBe(false);
    expect(p.verifyWebhook('{}', 'sig')).toEqual({ ok: false, reason: PADDLE_NOT_CONFIGURED });
  });
});

describe('PaddleProvider.getSubscription — webhook-fed local state', () => {
  it('returns the subscriptions row mapped to the provider shape', async () => {
    const periodEnd = new Date('2026-09-01T00:00:00.000Z');
    prismaMock.subscriptions.findFirst.mockResolvedValue({
      id: 'row_1',
      providerId: 'sub_77',
      provider: 'paddle',
      status: 'active',
      planId: 'pro',
      currentPeriodEnd: periodEnd,
    });

    const result = await provider().getSubscription('sub_77');

    expect(prismaMock.subscriptions.findFirst).toHaveBeenCalledWith({
      where: { providerId: 'sub_77', provider: 'paddle' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.subscription).toMatchObject({
        id: 'sub_77',
        status: 'active',
        planId: 'pro',
        currentPeriodEnd: periodEnd,
      });
    }
  });

  it('fails truthfully for unknown subscriptions', async () => {
    await expect(provider().getSubscription('missing')).resolves.toEqual({
      ok: false,
      reason: 'paddle_subscription_not_found',
    });
  });
});

describe('PaddleProvider.cancelSubscription — Classic vendors API', () => {
  it('POSTs users_cancel form-encoded and reports period-end cancellation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider().cancelSubscription('paddle_998');

    expect(result).toEqual({ ok: true, status: 'cancel_at_period_end' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://vendors.paddle.com/api/2.0/subscription/users_cancel');
    const params = init.body as URLSearchParams;
    expect(params.get('vendor_id')).toBe('12345');
    expect(params.get('vendor_auth_code')).toBe('auth_code');
    expect(params.get('subscription_id')).toBe('998');
  });

  it('fails truthfully when Paddle reports failure or the request errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: false }) })
    );
    await expect(provider().cancelSubscription('sub_1')).resolves.toEqual({
      ok: false,
      reason: 'paddle_cancel_failed',
    });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(provider().cancelSubscription('sub_1')).resolves.toEqual({
      ok: false,
      reason: 'paddle_cancel_failed',
    });
  });
});

describe('PaddleProvider.verifyWebhook', () => {
  const body = JSON.stringify({
    alert_name: 'subscription_created',
    subscription_id: 445566,
    subscription_plan_id: 'plan_9',
    status: 'active',
    passthrough: JSON.stringify({ userId: 'user_1', plan: 'pro' }),
  });

  it('accepts a valid HMAC-SHA256 hex signature and normalizes the alert', () => {
    const result = provider().verifyWebhook(body, sign(body, SECRET));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event).toMatchObject({
        type: 'subscription.created',
        subscriptionId: '445566',
        userId: 'user_1',
        planId: 'pro',
        status: 'active',
      });
    }
  });

  it('rejects wrong-secret, missing, and length-mismatched signatures without throwing', () => {
    expect(provider().verifyWebhook(body, sign(body, 'wrong-secret'))).toEqual({
      ok: false,
      reason: 'paddle_invalid_signature',
    });
    expect(provider().verifyWebhook(body, null)).toEqual({
      ok: false,
      reason: 'paddle_invalid_signature',
    });
    expect(provider().verifyWebhook(body, 'abc')).toEqual({
      ok: false,
      reason: 'paddle_invalid_signature',
    });
  });

  it('rejects unparseable JSON and flags unhandled alerts', () => {
    const junk = 'not-json';
    expect(provider().verifyWebhook(junk, sign(junk, SECRET))).toEqual({
      ok: false,
      reason: 'paddle_invalid_payload',
    });

    const refunded = JSON.stringify({
      alert_name: 'subscription_payment_refunded',
      subscription_id: 1,
    });
    expect(provider().verifyWebhook(refunded, sign(refunded, SECRET))).toEqual({
      ok: false,
      reason: 'paddle_unhandled_event',
    });
  });
});

describe('normalizePaddleEvent — fixture per alert shape', () => {
  it('accepts both passthrough key spellings (userId / user_id)', () => {
    const snakeCase = normalizePaddleEvent({
      alert_name: 'subscription_updated',
      subscription_id: '7',
      passthrough: JSON.stringify({ user_id: 'user_2', plan: 'monthly' }),
    });
    expect(snakeCase).toMatchObject({
      type: 'subscription.updated',
      subscriptionId: '7',
      userId: 'user_2',
      planId: 'monthly',
    });
  });

  it('maps cancellation and payment alerts onto the normalized set', () => {
    expect(
      normalizePaddleEvent({ alert_name: 'subscription_cancelled', subscription_id: '7' })?.type
    ).toBe('subscription.canceled');
    expect(
      normalizePaddleEvent({
        alert_name: 'subscription_payment_succeeded',
        subscription_id: '7',
      })?.type
    ).toBe('payment.succeeded');
    expect(
      normalizePaddleEvent({ alert_name: 'subscription_payment_failed', subscription_id: '7' })?.type
    ).toBe('payment.failed');
  });

  it('lets one-time payment alerts through on userId alone, otherwise null', () => {
    const oneTime = normalizePaddleEvent({
      alert_name: 'payment_succeeded',
      order_id: 'order_1',
      passthrough: JSON.stringify({ userId: 'user_1' }),
    });
    expect(oneTime).toMatchObject({
      type: 'payment.succeeded',
      subscriptionId: 'order_1',
      userId: 'user_1',
    });
    expect(normalizePaddleEvent({ alert_name: 'payment_succeeded' })).toBeNull();
  });

  it('returns null for unknown alerts, malformed passthrough on subscription alerts, and non-objects', () => {
    expect(normalizePaddleEvent({ alert_name: 'transfer_created' })).toBeNull();
    expect(normalizePaddleEvent({ alert_name: 'subscription_created' })).toBeNull();
    expect(normalizePaddleEvent('nope')).toBeNull();
    expect(normalizePaddleEvent(null)).toBeNull();
  });
});
