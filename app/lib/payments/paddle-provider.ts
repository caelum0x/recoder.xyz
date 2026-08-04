/**
 * Paddle behind the PaymentProvider contract (C6).
 *
 * Paddle's checkout runs client-side in the Paddle.js widget
 * (lib/payments/paddle.ts), so the server-side surface is thinner. This
 * provider implements only what is REAL in this codebase:
 * - createCheckout: truthful failure — checkout happens in the widget.
 * - getSubscription: our webhook-fed subscriptions row (there is no server
 *   read path against Paddle's API anywhere in the app).
 * - cancelSubscription: the Paddle Classic vendors API users_cancel call
 *   extracted from api/billing/subscription/cancel.
 * - changePlan: truthful failure — no server-side plan change exists.
 * - verifyWebhook: the HMAC-SHA256 hex check used by api/paddle/webhooks
 *   (header `paddle-signature`, PADDLE_WEBHOOK_SECRET) + Classic alert_name
 *   payload normalization.
 *
 * Env: PADDLE_WEBHOOK_SECRET, PADDLE_VENDOR_ID + PADDLE_AUTH_CODE/PADDLE_API_KEY
 * (via billing-credentials). Missing keys degrade truthfully — never throw.
 */

import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { resolvePaddleAuthCode, resolvePaddleVendorId } from '@/lib/billing-credentials';
import {
  type CancelResult,
  type CheckoutInput,
  type CheckoutResult,
  type NormalizedWebhookEvent,
  type NormalizedWebhookEventType,
  type PaymentProvider,
  type SubscriptionResult,
  type WebhookVerifyResult,
} from './provider';

export const PADDLE_NOT_CONFIGURED = 'paddle_not_configured';
export const PADDLE_SIGNATURE_HEADER = 'paddle-signature';
export const PADDLE_CHECKOUT_IS_CLIENT_SIDE = 'paddle_checkout_is_client_side';

const PADDLE_VENDORS_API_URL = 'https://vendors.paddle.com/api/2.0';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// Paddle Classic alert_name values -> normalized types.
const EVENT_TYPE_MAP: Record<string, NormalizedWebhookEventType> = {
  subscription_created: 'subscription.created',
  subscription_updated: 'subscription.updated',
  subscription_cancelled: 'subscription.canceled',
  subscription_payment_succeeded: 'payment.succeeded',
  payment_succeeded: 'payment.succeeded',
  subscription_payment_failed: 'payment.failed',
};

function parsePassthrough(value: unknown): Record<string, unknown> {
  const raw = asString(value);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Pure payload -> normalized event mapping for Paddle Classic's flat alert
 * payload (`alert_name` + JSON `passthrough` carrying our userId/plan).
 * Returns null for alert types we deliberately ignore (refunds, unknown).
 */
export function normalizePaddleEvent(payload: unknown): NormalizedWebhookEvent | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const body = payload as Record<string, unknown>;
  const rawType = asString(body.alert_name);
  if (!rawType) return null;
  const type = EVENT_TYPE_MAP[rawType];
  if (!type) return null;

  const passthrough = parsePassthrough(body.passthrough);
  // Both passthrough shapes exist in this repo: {userId} (paddle.ts widget)
  // and {user_id} (api/webhooks/paddle) — accept either.
  const userId = asString(passthrough.userId) ?? asString(passthrough.user_id);

  const subscriptionRef = body.subscription_id;
  let subscriptionId =
    asString(subscriptionRef) ??
    (typeof subscriptionRef === 'number' ? String(subscriptionRef) : undefined);
  if (!subscriptionId) {
    if (type === 'payment.succeeded' || type === 'payment.failed') {
      if (!userId) return null;
      subscriptionId = asString(body.order_id) ?? '';
    } else {
      return null;
    }
  }

  return {
    type,
    subscriptionId,
    userId,
    planId: asString(passthrough.plan) ?? asString(body.subscription_plan_id),
    status: asString(body.status),
    metadata: { ...passthrough },
    raw: payload,
  };
}

export class PaddleProvider implements PaymentProvider {
  readonly name = 'paddle';
  readonly configured: boolean;
  private readonly webhookSecret?: string;

  constructor(config: { webhookSecret?: string }) {
    this.webhookSecret = config.webhookSecret;
    this.configured = Boolean(config.webhookSecret);
  }

  async createCheckout(_input: CheckoutInput): Promise<CheckoutResult> {
    // Truthful: checkout happens in the Paddle.js widget, not on the server.
    return { ok: false, reason: PADDLE_CHECKOUT_IS_CLIENT_SIDE };
  }

  async getSubscription(providerSubscriptionId: string): Promise<SubscriptionResult> {
    const row = await prisma.subscriptions.findFirst({
      where: { providerId: providerSubscriptionId, provider: 'paddle' },
    });
    if (!row) {
      return { ok: false, reason: 'paddle_subscription_not_found' };
    }
    return {
      ok: true,
      subscription: {
        id: row.providerId ?? providerSubscriptionId,
        status: row.status,
        planId: row.planId ?? undefined,
        currentPeriodEnd: row.currentPeriodEnd ?? undefined,
        raw: row,
      },
    };
  }

  async cancelSubscription(providerSubscriptionId: string): Promise<CancelResult> {
    const vendorId = resolvePaddleVendorId();
    const authCode = resolvePaddleAuthCode();
    if (!vendorId || !authCode) {
      return { ok: false, reason: PADDLE_NOT_CONFIGURED };
    }

    try {
      const response = await fetch(`${PADDLE_VENDORS_API_URL}/subscription/users_cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          vendor_id: vendorId,
          vendor_auth_code: authCode,
          subscription_id: providerSubscriptionId.replace('paddle_', ''),
        }),
      });
      const data = (await response.json().catch(() => null)) as { success?: unknown } | null;
      if (!response.ok || data?.success !== true) {
        logger.error('Paddle cancellation failed', { status: response.status });
        return { ok: false, reason: 'paddle_cancel_failed' };
      }
      // Paddle Classic cancels take effect at period end; DB state lands via
      // the subscription_cancelled webhook.
      return { ok: true, status: 'cancel_at_period_end' };
    } catch (error) {
      logger.error('Paddle cancellation error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, reason: 'paddle_cancel_failed' };
    }
  }

  async changePlan(_id: string, _newPlanId: string): Promise<SubscriptionResult> {
    // Truthful: no server-side Paddle plan change exists in this codebase.
    return { ok: false, reason: 'paddle_change_plan_not_implemented' };
  }

  verifyWebhook(rawBody: string, signatureHeader: string | null): WebhookVerifyResult {
    if (!this.webhookSecret) {
      return { ok: false, reason: PADDLE_NOT_CONFIGURED };
    }
    if (!signatureHeader) {
      return { ok: false, reason: 'paddle_invalid_signature' };
    }

    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');
    const provided = Buffer.from(signatureHeader);
    const wanted = Buffer.from(expected);
    if (provided.length !== wanted.length || !crypto.timingSafeEqual(provided, wanted)) {
      return { ok: false, reason: 'paddle_invalid_signature' };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: 'paddle_invalid_payload' };
    }

    const event = normalizePaddleEvent(payload);
    if (!event) {
      return { ok: false, reason: 'paddle_unhandled_event' };
    }
    return { ok: true, event };
  }
}

/** Env is read per call (no singleton) so tests and rotated keys behave predictably. */
export function getPaddleProvider(): PaymentProvider {
  return new PaddleProvider({
    webhookSecret: process.env.PADDLE_WEBHOOK_SECRET || undefined,
  });
}
