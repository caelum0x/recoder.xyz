/**
 * Cross-provider degrade-safe + fail-closed contract for the four Merchant-of-
 * Record adapters (Polar / Creem / Paddle / Dodo). Two invariants, per provider:
 *
 *  1. DEGRADE-SAFE (missing key ⇒ deny-bias, never a faked success):
 *       - `createCheckout` throws a truthful `SERVICE_UNAVAILABLE` and never
 *         touches the network;
 *       - `getSubscription` / `cancel` return `null` and never touch the network;
 *       - `verifyWebhook` is `false` and `parseEvent` is `null` when no signing
 *         secret is configured.
 *  2. FAIL-CLOSED webhook gate (secret configured): a correctly-signed body
 *     verifies and parses into the normalized envelope, while a wrong signature
 *     or a body tampered after signing is rejected (`verifyWebhook=false`,
 *     `parseEvent=null` — drop + audit, never trust an unverified payload).
 *
 * NEVER Stripe: only the four MoR adapters are exercised.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { AppError, ErrorCode } from '../../../shared/errors.js';
import { sliceBillingConfig, type BillingConfigOverrides } from '../config.js';
import { createPlanCatalog } from '../services/plan-catalog.service.js';
import { createPolarAdapter } from '../adapters/polar.adapter.js';
import { createCreemAdapter } from '../adapters/creem.adapter.js';
import { createPaddleAdapter } from '../adapters/paddle.adapter.js';
import { createDodoAdapter } from '../adapters/dodo.adapter.js';
import type { BillingProviderPort } from '../ports/billing-provider.port.js';
import type { BillingProviderName, CheckoutIntent } from '../types.js';

const appConfig = { runtime: { isProduction: false } } as unknown as Parameters<
  typeof sliceBillingConfig
>[0];

type Factory = (deps: Parameters<typeof createPolarAdapter>[0]) => BillingProviderPort;

function build(factory: Factory, provider: BillingProviderName, overrides: BillingConfigOverrides[BillingProviderName]) {
  const config = sliceBillingConfig(appConfig, { [provider]: overrides });
  return factory({ credential: config[provider], catalog: createPlanCatalog(config) });
}

const INTENT: CheckoutIntent = {
  subject: { subjectId: 'u1', kind: 'user' },
  plan: 'pro',
  productId: 'prod_123',
  successUrl: 'https://recoder.xyz/thanks',
};

const WHSEC = `whsec_${Buffer.from('adapter-webhook-secret-value-01').toString('base64')}`;
const CREEM_SECRET = 'creem_whsec_hex_value';
const PADDLE_SECRET = 'pdl_ntfset_secret_value';

/** A signer produces the signature headers a provider expects for `rawBody`. */
type Signer = (rawBody: Buffer, eventId: string) => Record<string, string>;

/** Standard-Webhooks (Polar + Dodo): base64 HMAC of `${id}.${ts}.${body}`, fresh ts. */
const standardSigner = (rawBody: Buffer, eventId: string): Record<string, string> => {
  const ts = Math.floor(Date.now() / 1000);
  const key = Buffer.from(WHSEC.slice('whsec_'.length), 'base64');
  const sig = createHmac('sha256', key).update(`${eventId}.${ts}.${rawBody.toString('utf8')}`).digest('base64');
  return {
    'webhook-id': eventId,
    'webhook-timestamp': String(ts),
    'webhook-signature': `v1,${sig}`,
  };
};

interface Case {
  readonly name: BillingProviderName;
  readonly factory: Factory;
  readonly webhookSecret: string;
  readonly sign: Signer;
  readonly body: Record<string, unknown>;
  readonly expectedType: string;
}

const CASES: readonly Case[] = [
  {
    name: 'polar',
    factory: createPolarAdapter,
    webhookSecret: WHSEC,
    sign: standardSigner,
    body: { type: 'subscription.active', data: { id: 'sub_polar', status: 'active' } },
    expectedType: 'subscription.active',
  },
  {
    name: 'dodo',
    factory: createDodoAdapter,
    webhookSecret: WHSEC,
    sign: standardSigner,
    body: { type: 'subscription.active', data: { subscription_id: 'sub_dodo', status: 'active' } },
    expectedType: 'subscription.active',
  },
  {
    name: 'creem',
    factory: createCreemAdapter,
    webhookSecret: CREEM_SECRET,
    sign: (rawBody) => ({
      'creem-signature': createHmac('sha256', CREEM_SECRET).update(rawBody).digest('hex'),
    }),
    body: { eventType: 'subscription.active', object: { id: 'sub_creem', status: 'active' } },
    expectedType: 'subscription.active',
  },
  {
    name: 'paddle',
    factory: createPaddleAdapter,
    webhookSecret: PADDLE_SECRET,
    sign: (rawBody) => {
      const ts = Math.floor(Date.now() / 1000);
      const h1 = createHmac('sha256', PADDLE_SECRET).update(`${ts}:${rawBody.toString('utf8')}`).digest('hex');
      return { 'paddle-signature': `ts=${ts};h1=${h1}` };
    },
    body: { event_type: 'subscription.activated', data: { id: 'sub_paddle', status: 'active' } },
    expectedType: 'subscription.active',
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(CASES)('%s adapter — degrade-safe when unconfigured (no key)', ({ name, factory }) => {
  it('createCheckout throws a truthful SERVICE_UNAVAILABLE and never hits the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const adapter = build(factory, name, { apiKey: null });
    await expect(adapter.createCheckout(INTENT)).rejects.toBeInstanceOf(AppError);
    await expect(adapter.createCheckout(INTENT)).rejects.toMatchObject({ code: ErrorCode.SERVICE_UNAVAILABLE });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('getSubscription and cancel fail safe to null without touching the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const adapter = build(factory, name, { apiKey: null });
    await expect(adapter.getSubscription('sub_x')).resolves.toBeNull();
    await expect(adapter.cancel('sub_x')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('verifyWebhook is false and parseEvent is null when no webhook secret is configured', () => {
    // apiKey present but NO webhookSecret → the signature gate cannot pass.
    const adapter = build(factory, name, { apiKey: 'sk_live' });
    const rawBody = Buffer.from(JSON.stringify({ type: 'subscription.active' }));
    expect(adapter.verifyWebhook(rawBody, { 'webhook-id': 'e1' })).toBe(false);
    expect(adapter.parseEvent(rawBody, { 'webhook-id': 'e1' })).toBeNull();
  });
});

describe.each(CASES)('%s adapter — fail-closed webhook gate (secret configured)', ({ name, factory, webhookSecret, sign, body, expectedType }) => {
  const rawBody = Buffer.from(JSON.stringify(body));

  function adapter() {
    return build(factory, name, { apiKey: 'sk_live', webhookSecret });
  }

  it('verifies + parses a correctly-signed webhook into the normalized envelope', () => {
    const headers = sign(rawBody, 'evt_ok');
    const a = adapter();
    expect(a.verifyWebhook(rawBody, headers)).toBe(true);

    const parsed = a.parseEvent(rawBody, headers);
    expect(parsed).not.toBeNull();
    expect(parsed?.provider).toBe(name);
    expect(parsed?.type).toBe(expectedType);
    expect(parsed?.eventId).toBeTruthy();
  });

  it('rejects a body tampered after signing (verify=false, parse=null)', () => {
    const headers = sign(rawBody, 'evt_tamper');
    const tampered = Buffer.from(JSON.stringify({ ...body, __injected: 'grant-enterprise' }));
    const a = adapter();
    expect(a.verifyWebhook(tampered, headers)).toBe(false);
    expect(a.parseEvent(tampered, headers)).toBeNull();
  });

  it('rejects a wrong/garbage signature header (fail closed)', () => {
    const a = adapter();
    const garbage: Record<string, string> = {
      'webhook-id': 'evt_bad',
      'webhook-timestamp': String(Math.floor(Date.now() / 1000)),
      'webhook-signature': 'v1,not-a-valid-signature',
      'creem-signature': 'deadbeef',
      'paddle-signature': `ts=${Math.floor(Date.now() / 1000)};h1=deadbeef`,
    };
    expect(a.verifyWebhook(rawBody, garbage)).toBe(false);
    expect(a.parseEvent(rawBody, garbage)).toBeNull();
  });
});
