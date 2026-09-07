/**
 * Creem billing provider (api.creem.io) behind the PaymentProvider contract.
 *
 * API-shape assumptions (each covered by a test fixture so the module is
 * trivially correctable against Creem's docs):
 * - Auth: `x-api-key` header on every request.
 * - Checkout: POST /v1/checkouts { product_id, success_url, customer.email,
 *   metadata } -> { id, checkout_url }.
 * - Subscriptions: GET /v1/subscriptions/{id};
 *   POST /v1/subscriptions/{id}/cancel -> { id, status };
 *   plan change: POST /v1/subscriptions/{id}/upgrade { product_id }.
 * - Webhooks: header `creem-signature` = hex HMAC-SHA256 of the raw body
 *   keyed with CREEM_WEBHOOK_SECRET; payload { id, eventType, object }.
 *
 * Env: CREEM_API_KEY (required), CREEM_WEBHOOK_SECRET (required for webhook
 * verify), CREEM_PRODUCT_<PLANID> per purchasable plan, optional
 * CREEM_API_URL override. Missing keys degrade — never throw at import.
 */

import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { PLANS } from '@/lib/pricing-config';
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
} from '@/lib/payments/provider';

export const CREEM_NOT_CONFIGURED = 'creem_not_configured';
export const CREEM_SIGNATURE_HEADER = 'creem-signature';

export interface CreemHttpResponse {
  ok: boolean;
  status: number;
  json: unknown;
}

/**
 * Thin HTTP seam: all Creem I/O funnels through here so tests inject a fake
 * and doc corrections touch exactly one function.
 */
export interface CreemHttp {
  request(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown }
  ): Promise<CreemHttpResponse>;
}

function fetchCreemHttp(apiKey: string): CreemHttp {
  const baseUrl = process.env.CREEM_API_URL || 'https://api.creem.io';
  return {
    async request(path, init) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: init.method,
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      const json = await response.json().catch(() => null);
      return { ok: response.ok, status: response.status, json };
    },
  };
}

/** Plan -> Creem product mapping lives in env, one var per purchasable plan. */
export function creemProductIdForPlan(planId: string): string | null {
  return process.env[`CREEM_PRODUCT_${planId.toUpperCase()}`] || null;
}

function planIdForCreemProduct(productId: string | undefined): string | undefined {
  if (!productId) return undefined;
  return Object.keys(PLANS).find((planId) => creemProductIdForPlan(planId) === productId);
}

// Assumption fixture-covered: Creem emits these eventType strings.
const EVENT_TYPE_MAP: Record<string, NormalizedWebhookEventType> = {
  'checkout.completed': 'subscription.created',
  'subscription.active': 'subscription.created',
  'subscription.trialing': 'subscription.updated',
  'subscription.update': 'subscription.updated',
  'subscription.updated': 'subscription.updated',
  'subscription.canceled': 'subscription.canceled',
  'subscription.cancelled': 'subscription.canceled',
  'subscription.expired': 'subscription.canceled',
  'subscription.paid': 'payment.succeeded',
  'payment.succeeded': 'payment.succeeded',
  'subscription.unpaid': 'payment.failed',
  'subscription.past_due': 'payment.failed',
  'payment.failed': 'payment.failed',
  // Refunds / chargebacks / disputes revoke access — treat like a cancel so the
  // entitlement is withdrawn (conservative, fail-safe). When the payload carries
  // no resolvable subscription id the normalizer no-ops, same as before.
  'refund.created': 'subscription.canceled',
  'refund.succeeded': 'subscription.canceled',
  'subscription.refunded': 'subscription.canceled',
  'dispute.created': 'subscription.canceled',
  'chargeback.created': 'subscription.canceled',
};

interface CreemWebhookObject {
  id?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  product?: string | { id?: string };
  // checkout.completed nests the subscription on the checkout object.
  subscription?: string | { id?: string; status?: string; metadata?: Record<string, unknown> };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Pure payload -> normalized event mapping. Returns null for event types we
 * deliberately ignore (refunds, disputes, unknown future types).
 */
export function normalizeCreemEvent(payload: unknown): NormalizedWebhookEvent | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const envelope = payload as {
    id?: unknown;
    eventType?: unknown;
    type?: unknown;
    object?: unknown;
    data?: unknown;
  };
  const rawType = asString(envelope.eventType) ?? asString(envelope.type);
  if (!rawType) return null;
  const type = EVENT_TYPE_MAP[rawType];
  if (!type) return null;

  const object = ((envelope.object ?? envelope.data) || {}) as CreemWebhookObject;
  const nestedSubscription =
    typeof object.subscription === 'object' && object.subscription !== null
      ? object.subscription
      : undefined;

  const subscriptionId =
    asString(object.subscription) ?? asString(nestedSubscription?.id) ??
    (rawType === 'checkout.completed' ? undefined : asString(object.id));
  if (!subscriptionId) return null;

  const metadata = { ...(object.metadata ?? {}), ...(nestedSubscription?.metadata ?? {}) };
  const productId =
    typeof object.product === 'object' && object.product !== null
      ? asString(object.product.id)
      : asString(object.product);

  return {
    type,
    eventId: asString(envelope.id),
    subscriptionId,
    userId: asString(metadata.userId),
    planId: asString(metadata.planId) ?? planIdForCreemProduct(productId),
    status: asString(nestedSubscription?.status) ?? asString(object.status),
    metadata,
    raw: payload,
  };
}

interface CreemProviderConfig {
  http: CreemHttp;
  webhookSecret?: string;
}

export class CreemProvider implements PaymentProvider {
  readonly name = 'creem';
  readonly configured = true;
  private readonly http: CreemHttp;
  private readonly webhookSecret?: string;

  constructor(config: CreemProviderConfig) {
    this.http = config.http;
    this.webhookSecret = config.webhookSecret;
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const productId = creemProductIdForPlan(input.planId);
    if (!productId) {
      return { ok: false, reason: `creem_product_not_configured:${input.planId}` };
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz';
    const response = await this.http.request('/v1/checkouts', {
      method: 'POST',
      body: {
        product_id: productId,
        success_url: `${appUrl}/billing/success`,
        customer: { email: input.email },
        // Round-tripped back to us on webhooks; the webhook route relies on
        // userId/planId here, so keep this shape stable.
        metadata: {
          userId: input.userId,
          planId: input.planId,
          amount: input.amount,
          currency: input.currency,
          interval: input.interval,
        },
      },
    });

    if (!response.ok) {
      logger.error('Creem checkout create failed', { status: response.status });
      return { ok: false, reason: 'creem_checkout_failed' };
    }

    const body = response.json as { id?: unknown; checkout_url?: unknown } | null;
    const id = asString(body?.id);
    const checkoutUrl = asString(body?.checkout_url);
    if (!id || !checkoutUrl) {
      logger.error('Creem checkout response missing id/checkout_url');
      return { ok: false, reason: 'creem_checkout_malformed_response' };
    }
    return { ok: true, id, checkoutUrl };
  }

  async getSubscription(id: string): Promise<SubscriptionResult> {
    const response = await this.http.request(`/v1/subscriptions/${encodeURIComponent(id)}`, {
      method: 'GET',
    });
    if (!response.ok) {
      return { ok: false, reason: 'creem_subscription_fetch_failed' };
    }
    return { ok: true, subscription: this.toSubscription(id, response.json) };
  }

  async cancelSubscription(id: string): Promise<CancelResult> {
    const response = await this.http.request(
      `/v1/subscriptions/${encodeURIComponent(id)}/cancel`,
      { method: 'POST' }
    );
    if (!response.ok) {
      logger.error('Creem cancel failed', { status: response.status });
      return { ok: false, reason: 'creem_cancel_failed' };
    }
    const body = response.json as { status?: unknown } | null;
    return { ok: true, status: asString(body?.status) ?? 'canceled' };
  }

  async changePlan(id: string, newPlanId: string): Promise<SubscriptionResult> {
    const productId = creemProductIdForPlan(newPlanId);
    if (!productId) {
      return { ok: false, reason: `creem_product_not_configured:${newPlanId}` };
    }
    const response = await this.http.request(
      `/v1/subscriptions/${encodeURIComponent(id)}/upgrade`,
      { method: 'POST', body: { product_id: productId } }
    );
    if (!response.ok) {
      logger.error('Creem plan change failed', { status: response.status });
      return { ok: false, reason: 'creem_change_plan_failed' };
    }
    return { ok: true, subscription: this.toSubscription(id, response.json) };
  }

  verifyWebhook(rawBody: string, signatureHeader: string | null): WebhookVerifyResult {
    if (!this.webhookSecret) {
      return { ok: false, reason: CREEM_NOT_CONFIGURED };
    }
    if (!signatureHeader) {
      return { ok: false, reason: 'creem_invalid_signature' };
    }

    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');
    const provided = Buffer.from(signatureHeader);
    const wanted = Buffer.from(expected);
    if (provided.length !== wanted.length || !crypto.timingSafeEqual(provided, wanted)) {
      return { ok: false, reason: 'creem_invalid_signature' };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: 'creem_invalid_payload' };
    }

    const event = normalizeCreemEvent(payload);
    if (!event) {
      return { ok: false, reason: 'creem_unhandled_event' };
    }
    return { ok: true, event };
  }

  private toSubscription(id: string, json: unknown): ProviderSubscription {
    const body = (json ?? {}) as CreemWebhookObject & { current_period_end_date?: unknown };
    const productId =
      typeof body.product === 'object' && body.product !== null
        ? asString(body.product.id)
        : asString(body.product);
    const periodEnd = asString(body.current_period_end_date);
    return {
      id: asString(body.id) ?? id,
      status: asString(body.status) ?? 'unknown',
      planId: planIdForCreemProduct(productId),
      currentPeriodEnd: periodEnd ? new Date(periodEnd) : undefined,
      raw: json,
    };
  }
}

/**
 * Env is read per call (no singleton) so tests and rotated keys behave
 * predictably. Missing CREEM_API_KEY -> fully degraded provider.
 */
export function getCreemProvider(http?: CreemHttp): PaymentProvider {
  const apiKey = process.env.CREEM_API_KEY;
  const webhookSecret = process.env.CREEM_WEBHOOK_SECRET || undefined;
  if (!apiKey && !http) {
    return degradedProvider('creem', CREEM_NOT_CONFIGURED);
  }
  return new CreemProvider({
    http: http ?? fetchCreemHttp(apiKey as string),
    webhookSecret,
  });
}
