import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createDodoCheckout,
  DodoNotConfiguredError,
  parseDodoEvent,
  planForProductId,
  productIdFor,
  statusForEventType,
  verifyDodoWebhook,
} from '../src/billing/dodo.js';
import type { DodoCredential, DodoProductMap } from '../src/env.js';

const PRODUCTS: DodoProductMap = {
  pro_monthly: 'pdt_pro_monthly',
  pro_annual: 'pdt_pro_annual',
  team_monthly: 'pdt_team_monthly',
};

const CONFIGURED_CREDENTIAL: DodoCredential = {
  apiKey: 'sk_test_123',
  present: true,
  webhookSecret: 'whsec_dGVzdC1zZWNyZXQ', // base64("test-secret") with the whsec_ prefix
  webhookSecretPresent: true,
  testMode: true,
};

describe('productIdFor', () => {
  it('resolves pro monthly/annual and team monthly', () => {
    expect(productIdFor(PRODUCTS, 'pro', 'monthly')).toBe('pdt_pro_monthly');
    expect(productIdFor(PRODUCTS, 'pro', 'annual')).toBe('pdt_pro_annual');
    expect(productIdFor(PRODUCTS, 'team', 'monthly')).toBe('pdt_team_monthly');
  });

  it('team has no annual price', () => {
    expect(productIdFor(PRODUCTS, 'team', 'annual')).toBeNull();
  });

  it('returns null when a product id is not configured', () => {
    expect(productIdFor({ pro_monthly: null, pro_annual: null, team_monthly: null }, 'pro', 'monthly')).toBeNull();
  });
});

describe('createDodoCheckout', () => {
  const unconfigured: DodoCredential = { apiKey: null, present: false, webhookSecret: null, webhookSecretPresent: false, testMode: true };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws DodoNotConfiguredError when no API key is present', async () => {
    await expect(
      createDodoCheckout(unconfigured, PRODUCTS, {
        plan: 'pro',
        interval: 'monthly',
        customerEmail: 'a@example.com',
        accountId: 'acct_1',
        successUrl: 'https://recoder.xyz/connect/success',
      }),
    ).rejects.toBeInstanceOf(DodoNotConfiguredError);
  });

  it('throws DodoNotConfiguredError when the plan/interval has no product id', async () => {
    await expect(
      createDodoCheckout(CONFIGURED_CREDENTIAL, PRODUCTS, {
        plan: 'team',
        interval: 'annual',
        customerEmail: 'a@example.com',
        accountId: 'acct_1',
        successUrl: 'https://recoder.xyz/connect/success',
      }),
    ).rejects.toBeInstanceOf(DodoNotConfiguredError);
  });

  it('posts to the Dodo subscriptions endpoint and returns the hosted checkout url', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ subscription_id: 'sub_123', payment_link: 'https://checkout.dodopayments.com/sub_123' }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await createDodoCheckout(CONFIGURED_CREDENTIAL, PRODUCTS, {
      plan: 'pro',
      interval: 'monthly',
      customerEmail: 'dev@example.com',
      accountId: 'acct_1',
      successUrl: 'https://recoder.xyz/connect/success',
    });

    expect(result).toEqual({ checkoutUrl: 'https://checkout.dodopayments.com/sub_123', dodoSubscriptionId: 'sub_123' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://test.dodopayments.com/subscriptions');
    const body = JSON.parse(init.body as string);
    expect(body.product_id).toBe('pdt_pro_monthly');
    expect(body.metadata.account_id).toBe('acct_1');
  });

  it('uses the live base URL when testMode is false', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ subscription_id: 's', payment_link: 'https://x' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await createDodoCheckout({ ...CONFIGURED_CREDENTIAL, testMode: false }, PRODUCTS, {
      plan: 'pro',
      interval: 'monthly',
      customerEmail: 'a@b.com',
      accountId: 'acct_1',
      successUrl: 'https://x',
    });
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe('https://live.dodopayments.com/subscriptions');
  });

  it('throws when Dodo responds with a non-2xx status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad request', { status: 400 })));
    await expect(
      createDodoCheckout(CONFIGURED_CREDENTIAL, PRODUCTS, {
        plan: 'pro',
        interval: 'monthly',
        customerEmail: 'a@b.com',
        accountId: 'acct_1',
        successUrl: 'https://x',
      }),
    ).rejects.toThrow(/dodo_checkout_failed:400/);
  });

  it('throws when Dodo responds 200 but omits subscription_id/payment_link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    await expect(
      createDodoCheckout(CONFIGURED_CREDENTIAL, PRODUCTS, {
        plan: 'pro',
        interval: 'monthly',
        customerEmail: 'a@b.com',
        accountId: 'acct_1',
        successUrl: 'https://x',
      }),
    ).rejects.toThrow('dodo_checkout_missing_fields');
  });
});

describe('verifyDodoWebhook (Standard Webhooks HMAC-SHA256)', () => {
  const secret = 'whsec_dGVzdC1zZWNyZXQ'; // base64("test-secret")

  async function sign(id: string, timestamp: string, body: string): Promise<string> {
    const secretBytes = Uint8Array.from(atob('dGVzdC1zZWNyZXQ'), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
    let binary = '';
    for (const byte of mac) binary += String.fromCharCode(byte);
    return `v1,${btoa(binary)}`;
  }

  it('accepts a correctly signed payload', async () => {
    const body = JSON.stringify({ type: 'subscription.active' });
    const signature = await sign('msg_1', '1700000000', body);
    const ok = await verifyDodoWebhook(body, { id: 'msg_1', timestamp: '1700000000', signature }, secret);
    expect(ok).toBe(true);
  });

  it('rejects a tampered body', async () => {
    const signature = await sign('msg_1', '1700000000', JSON.stringify({ type: 'subscription.active' }));
    const ok = await verifyDodoWebhook(JSON.stringify({ type: 'subscription.canceled' }), { id: 'msg_1', timestamp: '1700000000', signature }, secret);
    expect(ok).toBe(false);
  });

  it('rejects a signature computed with the wrong secret', async () => {
    const body = JSON.stringify({ type: 'subscription.active' });
    const wrongKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('wrong-secret-bytes'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', wrongKey, new TextEncoder().encode(`msg_1.1700000000.${body}`)));
    let binary = '';
    for (const byte of mac) binary += String.fromCharCode(byte);
    const badSignature = `v1,${btoa(binary)}`;
    const ok = await verifyDodoWebhook(body, { id: 'msg_1', timestamp: '1700000000', signature: badSignature }, secret);
    expect(ok).toBe(false);
  });

  it('rejects when any header is missing', async () => {
    expect(await verifyDodoWebhook('{}', { id: '', timestamp: '1', signature: 'v1,abc' }, secret)).toBe(false);
    expect(await verifyDodoWebhook('{}', { id: 'a', timestamp: '', signature: 'v1,abc' }, secret)).toBe(false);
    expect(await verifyDodoWebhook('{}', { id: 'a', timestamp: '1', signature: '' }, secret)).toBe(false);
  });

  it('is replay-safe only in combination with the idempotency inbox (verification alone accepts a resent valid payload)', async () => {
    const body = JSON.stringify({ type: 'subscription.active' });
    const signature = await sign('msg_1', '1700000000', body);
    const first = await verifyDodoWebhook(body, { id: 'msg_1', timestamp: '1700000000', signature }, secret);
    const second = await verifyDodoWebhook(body, { id: 'msg_1', timestamp: '1700000000', signature }, secret);
    expect(first).toBe(true);
    expect(second).toBe(true); // dedupe is webhook-events.ts's job, not this function's
  });
});

describe('parseDodoEvent', () => {
  it('extracts type, account id (from metadata), and the subscription payload', () => {
    const raw = JSON.stringify({
      type: 'subscription.active',
      data: { subscription_id: 'sub_1', product_id: 'pdt_pro_monthly', metadata: { account_id: 'acct_42' } },
    });
    const event = parseDodoEvent('msg_1', raw);
    expect(event.eventId).toBe('msg_1');
    expect(event.type).toBe('subscription.active');
    expect(event.accountId).toBe('acct_42');
    expect(event.subscription?.subscription_id).toBe('sub_1');
  });

  it('leaves accountId undefined when metadata is missing', () => {
    const event = parseDodoEvent('msg_2', JSON.stringify({ type: 'subscription.active', data: {} }));
    expect(event.accountId).toBeUndefined();
  });
});

describe('statusForEventType', () => {
  it.each([
    ['subscription.active', 'active'],
    ['subscription.renewed', 'active'],
    ['subscription.on_hold', 'past_due'],
    ['subscription.failed', 'past_due'],
    ['subscription.cancelled', 'canceled'],
    ['subscription.canceled', 'canceled'],
    ['subscription.expired', 'canceled'],
  ] as const)('%s -> %s', (type, expected) => {
    expect(statusForEventType(type)).toBe(expected);
  });

  it('returns null for an unmapped event type', () => {
    expect(statusForEventType('payment.succeeded')).toBeNull();
  });
});

describe('planForProductId', () => {
  it('maps known product ids to their plan tier', () => {
    expect(planForProductId(PRODUCTS, 'pdt_pro_monthly')).toBe('pro');
    expect(planForProductId(PRODUCTS, 'pdt_pro_annual')).toBe('pro');
    expect(planForProductId(PRODUCTS, 'pdt_team_monthly')).toBe('team');
  });

  it('falls back to free for an unknown or missing product id', () => {
    expect(planForProductId(PRODUCTS, 'pdt_unknown')).toBe('free');
    expect(planForProductId(PRODUCTS, undefined)).toBe('free');
  });
});
