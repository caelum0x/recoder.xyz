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
 * - verifyWebhook -> the HMAC-SHA256 hex check extracted from
 *   app/api/webhooks/dodo (header `x-dodo-signature`, DODO_WEBHOOK_SECRET),
 *   hardened so a length-mismatched signature rejects instead of throwing.
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
export const DODO_SIGNATURE_HEADER = 'x-dodo-signature';

const DODO_API_URL = 'https://api.dodopayments.com';

// Same plan -> product mapping (env first, legacy defaults) as api/dodo/payment.
const DEFAULT_PRODUCTS: Record<string, string> = {
  weekly: 'prod_weekly',
  monthly: 'prod_monthly',
  pro: 'prod_pro',
  enterprise: 'prod_enterprise',
};

export function dodoProductIdForPlan(planId: string): string | null {
  const key = planId.toLowerCase();
  return process.env[`DODO_PRODUCT_${key.toUpperCase()}`] || DEFAULT_PRODUCTS[key] || null;
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

  const userId = asString(data.user_id);
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
    metadata: { ...data },
    raw: payload,
  };
}

export function verifyDodoSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = Buffer.from(signatureHeader);
  const wanted = Buffer.from(expected);
  return provided.length === wanted.length && crypto.timingSafeEqual(provided, wanted);
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

  verifyWebhook(rawBody: string, signatureHeader: string | null): WebhookVerifyResult {
    if (!this.webhookSecret) {
      return { ok: false, reason: DODO_NOT_CONFIGURED };
    }
    if (!verifyDodoSignature(rawBody, signatureHeader, this.webhookSecret)) {
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
