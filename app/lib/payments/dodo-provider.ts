/**
 * Dodo Payments behind the PaymentProvider contract (C6).
 *
 * Wraps the REAL server logic in lib/services/dodopayments.service.ts:
 * - createCheckout -> DodoPaymentsService.createCheckoutSession (SDK)
 * - cancelSubscription/changePlan -> the service's fetch-based operations.
 *   NOTE: the wrapped service resolves subscriptions by OUR internal
 *   subscriptions.id (it looks up providerId itself), so those two methods
 *   take internal ids — that is the real, existing call contract.
 * - getSubscription -> direct Dodo API GET by provider-side subscription id
 *   (the service has no read path; this mirrors its direct-fetch style).
 * - verifyWebhook -> real Dodo webhooks are signed per the Standard Webhooks
 *   spec (same scheme as Polar): headers `webhook-id` / `webhook-timestamp` /
 *   `webhook-signature`, signed message `${id}.${timestamp}.${rawBody}`,
 *   HMAC-SHA256 digested as BASE64 (not hex), secret is a `whsec_`-prefixed
 *   base64 value, `webhook-signature` is a space-delimited list of
 *   `v1,<base64sig>` entries (any match passes — key rotation), and a stale
 *   timestamp is rejected before the HMAC compare (replay defense). This
 *   mirrors `backend/src/domains/billing/adapters/shared.ts`'s
 *   `verifyStandardWebhook`, which already gets this right for Agent OS
 *   billing — this file previously reinvented an incorrect scheme (a single
 *   custom `x-dodo-signature` header, hex digest, raw-body-only message) that
 *   no real Dodo webhook ever satisfies, silently dropping every production
 *   billing event.
 *
 * Env: DODO_PAYMENTS_API_KEY/DODO_API_KEY (via resolveDodoApiKey),
 * DODO_WEBHOOK_SECRET, DODO_PRODUCT_<PLAN> product mapping. Missing keys
 * degrade truthfully — never throw at import.
 */

import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { resolveDodoApiKey } from '@/lib/billing-credentials';
import {
  degradedProvider,
  type CancelResult,
  type CheckoutInput,
  type CheckoutResult,
  type NormalizedWebhookEvent,
  type NormalizedWebhookEventType,
  type PaymentProvider,
  type ProviderSubscription,
  type SubscriptionResult,
  type WebhookVerifyResult,
} from './provider';

export const DODO_NOT_CONFIGURED = 'dodo_not_configured';
// Standard Webhooks headers (Dodo's real scheme — same as Polar).
export const DODO_SIGNATURE_HEADER = 'webhook-signature';
export const DODO_ID_HEADER = 'webhook-id';
export const DODO_TIMESTAMP_HEADER = 'webhook-timestamp';
/** Replay-defense tolerance for `webhook-timestamp`, per the Standard Webhooks spec. */
const DODO_WEBHOOK_TIMESTAMP_TOLERANCE_MS = 300_000;

const DODO_API_URL = 'https://api.dodopayments.com';

// Same plan -> product mapping (env first, legacy defaults) as api/dodo/payment
// and app/app/api/billing/create-checkout/route.ts's `planConfig` — all three
// must stay in sync. Previously missing `team` and `pro-annual`: a Team or
// Pro-annual checkout/change-plan through this provider returned
// `dodo_product_not_configured` unless the operator happened to set the
// right env var, which for `pro-annual` was not even reachable (see below).
const DEFAULT_PRODUCTS: Record<string, string> = {
  weekly: 'prod_weekly',
  monthly: 'prod_monthly',
  pro: 'prod_pro',
  'pro-annual': 'prod_pro_annual',
  team: 'prod_team',
  enterprise: 'prod_enterprise',
};

export function dodoProductIdForPlan(planId: string): string | null {
  const key = planId.toLowerCase();
  // Env var names use underscores (DODO_PRODUCT_PRO_ANNUAL, matching
  // create-checkout/route.ts and wrangler.toml's documented secrets) — a
  // hyphenated plan id like "pro-annual" must normalize to "_" before the
  // lookup, or `DODO_PRODUCT_PRO-ANNUAL` (an env var name no operator would
  // actually set) is checked instead and this always falls through to the
  // default.
  const envKey = `DODO_PRODUCT_${key.toUpperCase().replace(/-/g, '_')}`;
  return process.env[envKey] || DEFAULT_PRODUCTS[key] || null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// Raw Dodo webhook types (route + service shapes) -> normalized types.
const EVENT_TYPE_MAP: Record<string, NormalizedWebhookEventType> = {
  'subscription.created': 'subscription.created',
  'subscription.active': 'subscription.created',
  'subscription.updated': 'subscription.updated',
  'subscription.renewed': 'subscription.updated',
  'subscription.plan_changed': 'subscription.updated',
  'subscription.on_hold': 'subscription.updated',
  'subscription.cancelled': 'subscription.canceled',
  'subscription.canceled': 'subscription.canceled',
  'payment.succeeded': 'payment.succeeded',
  'payment.failed': 'payment.failed',
};

/**
 * Pure payload -> normalized event mapping for Dodo's `{ type, data }`
 * envelope. Returns null for event types we deliberately ignore
 * (refund.created stays a route-level audit concern).
 */
export function normalizeDodoEvent(payload: unknown): NormalizedWebhookEvent | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const envelope = payload as { type?: unknown; data?: unknown };
  const rawType = asString(envelope.type);
  if (!rawType) return null;
  const type = EVENT_TYPE_MAP[rawType];
  if (!type) return null;

  const data = (
    typeof envelope.data === 'object' && envelope.data !== null ? envelope.data : {}
  ) as Record<string, unknown>;

  // Real Dodo payloads have NO top-level `user_id` — subscriptions/payments
  // carry `customer: { customer_id, email, name }` and a `metadata` object
  // (see `DodoPaymentsService.createCheckoutSession`, which stamps
  // `metadata.userId` at checkout time so it round-trips here, matching the
  // same `metadata.userId` convention as the Creem normalizer). `data.user_id`
  // is kept as a harmless legacy fallback only.
  const metadata = (
    typeof data.metadata === 'object' && data.metadata !== null
      ? (data.metadata as Record<string, unknown>)
      : {}
  );
  const userId = asString(metadata.userId) ?? asString(data.user_id);
  let subscriptionId = asString(data.subscription_id);
  if (!subscriptionId) {
    if (type === 'payment.succeeded' || type === 'payment.failed') {
      // One-time payments carry no subscription; keep the event addressable
      // through userId and fall back to the payment/transaction reference.
      if (!userId) return null;
      subscriptionId =
        asString(data.payment_id) ?? asString(data.transaction_id) ?? '';
    } else {
      return null;
    }
  }

  return {
    type,
    subscriptionId,
    userId,
    planId: asString(data.plan) ?? asString(data.plan_id) ?? asString(data.product_id),
    status: rawType === 'subscription.on_hold' ? 'on_hold' : asString(data.status),
    // Explicit checkout metadata wins (matches the Creem normalizer's shape,
    // which `metadataOf()` callers read amount/currency/interval from), but
    // the full envelope stays accessible for any other field.
    metadata: { ...data, ...metadata },
    raw: payload,
  };
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * `DODO_WEBHOOK_SECRET` is issued as a `whsec_`-prefixed base64 value (the
 * Standard Webhooks convention) — the signing key is the DECODED bytes, not
 * the literal string. Falls back to raw UTF-8 bytes if it doesn't actually
 * round-trip as base64, so a plain test secret still works.
 */
function decodeDodoWebhookSecret(secret: string): Buffer {
  const stripped = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const decoded = Buffer.from(stripped, 'base64');
  const roundTrips =
    decoded.length > 0 && decoded.toString('base64').replace(/=+$/, '') === stripped.replace(/=+$/, '');
  return roundTrips ? decoded : Buffer.from(secret, 'utf8');
}

function isFreshDodoWebhookTimestamp(timestamp: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!timestamp) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return false;
  return Math.abs(nowMs - seconds * 1000) <= DODO_WEBHOOK_TIMESTAMP_TOLERANCE_MS;
}

/**
 * Standard Webhooks signature verification (Dodo's real scheme, same as
 * Polar). The signed content is `${id}.${timestamp}.${rawBody}`; the
 * `webhook-signature` header is a space-delimited list of `v1,<base64sig>`
 * entries — a match on ANY entry passes (key rotation). Rejects a stale
 * timestamp (replay defense) before the HMAC compare. Never throws on a
 * malformed/missing header.
 */
export function verifyDodoSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  id?: string | null,
  timestamp?: string | null
): boolean {
  if (!signatureHeader || !id || !timestamp) return false;
  if (!isFreshDodoWebhookTimestamp(timestamp)) return false;

  const key = decodeDodoWebhookSecret(secret);
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');

  for (const part of signatureHeader.split(' ')) {
    const [, sig] = part.split(',', 2);
    if (sig && timingSafeEqualStrings(sig, expected)) return true;
  }
  return false;
}

interface DodoProviderConfig {
  apiKey: string | null;
  webhookSecret?: string;
}

export class DodoProvider implements PaymentProvider {
  readonly name = 'dodo';
  readonly configured: boolean;
  private readonly apiKey: string | null;
  private readonly webhookSecret?: string;

  constructor(config: DodoProviderConfig) {
    this.apiKey = config.apiKey;
    this.webhookSecret = config.webhookSecret;
    this.configured = Boolean(config.apiKey);
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    if (!this.apiKey) {
      return { ok: false, reason: DODO_NOT_CONFIGURED };
    }
    const productId = dodoProductIdForPlan(input.planId);
    if (!productId) {
      return { ok: false, reason: `dodo_product_not_configured:${input.planId}` };
    }

    try {
      const { DodoPaymentsService } = await import('@/lib/services/dodopayments.service');
      const session = await DodoPaymentsService.createCheckoutSession(input.userId, productId);
      return { ok: true, id: session.sessionId, checkoutUrl: session.checkoutUrl };
    } catch (error) {
      logger.error('Dodo checkout create failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, reason: 'dodo_checkout_failed' };
    }
  }

  async getSubscription(providerSubscriptionId: string): Promise<SubscriptionResult> {
    if (!this.apiKey) {
      return { ok: false, reason: DODO_NOT_CONFIGURED };
    }
    try {
      const response = await fetch(
        `${DODO_API_URL}/subscriptions/${encodeURIComponent(providerSubscriptionId)}`,
        { headers: { Authorization: `Bearer ${this.apiKey}` } }
      );
      if (!response.ok) {
        return { ok: false, reason: 'dodo_subscription_fetch_failed' };
      }
      const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      const body = json ?? {};
      const periodEnd = body.current_period_end;
      return {
        ok: true,
        subscription: {
          id: asString(body.subscription_id) ?? asString(body.id) ?? providerSubscriptionId,
          status: asString(body.status) ?? 'unknown',
          planId: asString(body.product_id) ?? asString(body.plan_id),
          currentPeriodEnd:
            typeof periodEnd === 'number' ? new Date(periodEnd * 1000) : undefined,
          raw: json,
        } satisfies ProviderSubscription,
      };
    } catch (error) {
      logger.error('Dodo subscription fetch failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, reason: 'dodo_subscription_fetch_failed' };
    }
  }

  /** `id` is OUR internal subscriptions.id — the wrapped service resolves providerId itself. */
  async cancelSubscription(id: string): Promise<CancelResult> {
    if (!this.apiKey) {
      return { ok: false, reason: DODO_NOT_CONFIGURED };
    }
    try {
      const { DodoPaymentsService } = await import('@/lib/services/dodopayments.service');
      await DodoPaymentsService.cancelSubscription(id, true);
      return { ok: true, status: 'cancel_at_period_end' };
    } catch (error) {
      logger.error('Dodo cancel failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, reason: 'dodo_cancel_failed' };
    }
  }

  /** `id` is OUR internal subscriptions.id — the wrapped service resolves providerId itself. */
  async changePlan(id: string, newPlanId: string): Promise<SubscriptionResult> {
    if (!this.apiKey) {
      return { ok: false, reason: DODO_NOT_CONFIGURED };
    }
    const productId = dodoProductIdForPlan(newPlanId);
    if (!productId) {
      return { ok: false, reason: `dodo_product_not_configured:${newPlanId}` };
    }
    try {
      const { DodoPaymentsService } = await import('@/lib/services/dodopayments.service');
      const result = (await DodoPaymentsService.changePlan(
        id,
        productId,
        'prorated_immediately'
      )) as Record<string, unknown> | null;
      const body = result ?? {};
      return {
        ok: true,
        subscription: {
          id: asString(body.subscription_id) ?? id,
          // DB state lands via the subscription.plan_changed webhook; report
          // the provider response truthfully rather than assuming 'active'.
          status: asString(body.status) ?? 'unknown',
          planId: newPlanId,
          raw: result,
        },
      };
    } catch (error) {
      logger.error('Dodo plan change failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, reason: 'dodo_change_plan_failed' };
    }
  }

  verifyWebhook(
    rawBody: string,
    signatureHeader: string | null,
    extra?: { id?: string | null; timestamp?: string | null }
  ): WebhookVerifyResult {
    if (!this.webhookSecret) {
      return { ok: false, reason: DODO_NOT_CONFIGURED };
    }
    if (
      !verifyDodoSignature(rawBody, signatureHeader, this.webhookSecret, extra?.id, extra?.timestamp)
    ) {
      return { ok: false, reason: 'dodo_invalid_signature' };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: 'dodo_invalid_payload' };
    }

    const event = normalizeDodoEvent(payload);
    if (!event) {
      return { ok: false, reason: 'dodo_unhandled_event' };
    }
    return { ok: true, event };
  }
}

/**
 * Env is read per call (no singleton) so tests and rotated keys behave
 * predictably. With neither API key nor webhook secret -> fully degraded.
 */
export function getDodoProvider(): PaymentProvider {
  const apiKey = resolveDodoApiKey();
  const webhookSecret = process.env.DODO_WEBHOOK_SECRET || undefined;
  if (!apiKey && !webhookSecret) {
    return degradedProvider('dodo', DODO_NOT_CONFIGURED);
  }
  return new DodoProvider({ apiKey, webhookSecret });
}
