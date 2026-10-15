/**
 * Dodo Payments integration for Recoder Connect.
 *
 * Dodo is the sole Merchant of Record for Connect (plan's "Dodo only going
 * forward" — see ../../../docs/RECODER-T3CODE-COMPOSITION.md §11). Checkout
 * is a hosted `payment_link`; lifecycle events arrive as Standard-Webhooks
 * signed payloads (`webhook-id`/`webhook-timestamp`/`webhook-signature`),
 * verified here with Web Crypto (Workers-native — no node:crypto dependency),
 * mirroring the verification scheme already proven in
 * backend/src/domains/billing/adapters/shared.ts (`verifyStandardWebhook`)
 * and backend/src/domains/billing/adapters/dodo.adapter.ts.
 *
 * Fail-safe throughout: an absent API key never throws at import time;
 * `createCheckout` throws a typed, caught-by-the-route error; `verifyWebhook`
 * is `false` when unconfigured — never a faked "verified".
 */
import type { DodoCredential, DodoProductMap } from '../env.js';
import type { ConnectPlanTier } from '../db/schema.js';

export class DodoNotConfiguredError extends Error {
  constructor(what: string) {
    super(`dodo_not_configured:${what}`);
    this.name = 'DodoNotConfiguredError';
  }
}

export interface CheckoutIntent {
  readonly plan: Exclude<ConnectPlanTier, 'free'>;
  readonly interval: 'monthly' | 'annual';
  readonly customerEmail: string;
  readonly accountId: string;
  readonly successUrl: string;
}

export interface CheckoutResult {
  readonly checkoutUrl: string;
  readonly dodoSubscriptionId: string;
}

/** Resolves the Dodo product id for a (plan, interval) pair. `team` only has
 * a monthly price per the plan (Team $99/mo) — annual team is not offered. */
export function productIdFor(products: DodoProductMap, plan: CheckoutIntent['plan'], interval: CheckoutIntent['interval']): string | null {
  if (plan === 'pro') return interval === 'annual' ? products.pro_annual : products.pro_monthly;
  if (plan === 'team') return interval === 'monthly' ? products.team_monthly : null;
  return null;
}

export async function createDodoCheckout(
  credential: DodoCredential,
  products: DodoProductMap,
  intent: CheckoutIntent,
): Promise<CheckoutResult> {
  if (!credential.present || !credential.apiKey) {
    throw new DodoNotConfiguredError('api_key');
  }
  const productId = productIdFor(products, intent.plan, intent.interval);
  if (!productId) {
    throw new DodoNotConfiguredError(`product:${intent.plan}:${intent.interval}`);
  }
  const baseUrl = credential.testMode ? 'https://test.dodopayments.com' : 'https://live.dodopayments.com';
  const response = await fetch(`${baseUrl}/subscriptions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${credential.apiKey}`,
    },
    body: JSON.stringify({
      product_id: productId,
      payment_link: true,
      return_url: intent.successUrl,
      quantity: 1,
      customer: { email: intent.customerEmail },
      metadata: {
        account_id: intent.accountId,
        plan: intent.plan,
        interval: intent.interval,
      },
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`dodo_checkout_failed:${response.status}:${body.slice(0, 300)}`);
  }
  const json = (await response.json()) as { subscription_id?: string; payment_link?: string };
  if (!json.subscription_id || !json.payment_link) {
    throw new Error('dodo_checkout_missing_fields');
  }
  return { checkoutUrl: json.payment_link, dodoSubscriptionId: json.subscription_id };
}

/** Standard Webhooks verification: HMAC-SHA256 over `{id}.{timestamp}.{body}`
 * with the base64-decoded secret (after its `whsec_` prefix), base64-encoded,
 * constant-time compared against any `v1,` signature in the (possibly
 * space-separated, multi-signature) `webhook-signature` header. */
export async function verifyDodoWebhook(
  rawBody: string,
  headers: { id: string; timestamp: string; signature: string },
  webhookSecret: string,
): Promise<boolean> {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const secretB64 = webhookSecret.startsWith('whsec_') ? webhookSecret.slice('whsec_'.length) : webhookSecret;
  const secretBytes = base64Decode(secretB64);
  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const macBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent)));
  const expected = base64Encode(macBytes);

  const candidates = headers.signature
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.includes(',') ? part.split(',')[1] : part))
    .filter((v): v is string => Boolean(v));

  return candidates.some((candidate) => timingSafeEqual(candidate, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function base64Decode(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export interface DodoSubscriptionPayload {
  subscription_id?: string;
  status?: string;
  product_id?: string;
  next_billing_date?: string;
  cancel_at_next_billing_date?: boolean;
  customer?: { customer_id?: string; email?: string } | string;
  metadata?: Record<string, unknown>;
}

export interface ParsedDodoEvent {
  readonly eventId: string;
  readonly type: string;
  readonly accountId: string | undefined;
  readonly subscription: DodoSubscriptionPayload | undefined;
  readonly raw: Record<string, unknown>;
}

/** Parses an ALREADY-VERIFIED webhook body. Callers must call
 * `verifyDodoWebhook` first — this function does not re-verify. */
export function parseDodoEvent(webhookId: string, rawBody: string): ParsedDodoEvent {
  const payload = JSON.parse(rawBody) as Record<string, unknown>;
  const type = typeof payload.type === 'string' ? payload.type : 'unknown';
  const data = (payload.data ?? {}) as DodoSubscriptionPayload;
  const accountId =
    typeof data.metadata?.account_id === 'string' ? (data.metadata.account_id as string) : undefined;
  return { eventId: webhookId, type, accountId, subscription: data, raw: payload };
}

/** Normalizes Dodo's ~10 event type strings down to the 4 states Connect's
 * entitlement table tracks. Unknown types map to `null` (caller skips the
 * entitlement write but still records the inbox row — never guesses). */
export function statusForEventType(type: string): 'active' | 'past_due' | 'canceled' | null {
  switch (type) {
    case 'subscription.active':
    case 'subscription.renewed':
      return 'active';
    case 'subscription.on_hold':
    case 'subscription.failed':
      return 'past_due';
    case 'subscription.cancelled':
    case 'subscription.canceled':
    case 'subscription.expired':
      return 'canceled';
    default:
      return null;
  }
}

export function planForProductId(products: DodoProductMap, productId: string | undefined): ConnectPlanTier {
  if (!productId) return 'free';
  if (productId === products.pro_monthly || productId === products.pro_annual) return 'pro';
  if (productId === products.team_monthly) return 'team';
  return 'free';
}
