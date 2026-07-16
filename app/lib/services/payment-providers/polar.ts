/**
 * Polar.sh Payment Provider
 *
 * Integration with the Polar.sh API for subscription billing.
 * Docs: https://docs.polar.sh
 *
 * Activates when POLAR_API_KEY is set. Product/price mapping uses env vars:
 *   POLAR_PRODUCT_PRO, POLAR_PRODUCT_MONTHLY, POLAR_PRODUCT_WEEKLY, POLAR_PRODUCT_ENTERPRISE
 *
 * Webhook verification uses POLAR_WEBHOOK_SECRET with HMAC-SHA256 ("sha256=<hex>" format).
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { logger } from '@/lib/logger';
import type {
  PaymentProvider,
  CheckoutSessionParams,
  CheckoutSessionResult,
  SubscriptionInfo,
  WebhookEvent,
} from './types';

export class PolarPaymentProvider implements PaymentProvider {
  readonly name = 'polar';

  private apiKey: string;
  private webhookSecret: string;
  private baseUrl = 'https://api.polar.sh/v1';

  constructor(apiKey: string, webhookSecret?: string) {
    this.apiKey = apiKey;
    this.webhookSecret = webhookSecret || process.env.POLAR_WEBHOOK_SECRET || '';
  }

  // ---------------------------------------------------------------------------
  // Checkout
  // ---------------------------------------------------------------------------

  async createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult> {
    const productId = this.resolveProductId(params.planId);
    if (!productId) {
      throw new Error(`No Polar product ID configured for plan: ${params.planId}`);
    }

    const body: Record<string, any> = {
      product_price_id: productId,
      success_url: params.successUrl,
      customer_email: params.userEmail,
      metadata: {
        user_id: params.userId,
        plan_id: params.planId,
      },
    };

    if (params.userName) {
      body.customer_name = params.userName;
    }

    const res = await this.request('POST', '/checkouts/custom', body);

    return {
      sessionId: res.id,
      checkoutUrl: res.url,
      provider: this.name,
    };
  }

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  async getSubscription(providerSubscriptionId: string): Promise<SubscriptionInfo> {
    const res = await this.request('GET', `/subscriptions/${providerSubscriptionId}`);

    return {
      id: res.id,
      status: this.mapStatus(res.status),
      planId: res.product_id || res.price_id || '',
      provider: this.name,
      currentPeriodStart: res.current_period_start,
      currentPeriodEnd: res.current_period_end,
      cancelAtPeriodEnd: res.cancel_at_period_end ?? false,
    };
  }

  async cancelSubscription(providerSubscriptionId: string, atPeriodEnd = true): Promise<void> {
    if (atPeriodEnd) {
      await this.request('PATCH', `/subscriptions/${providerSubscriptionId}`, {
        cancel_at_period_end: true,
      });
    } else {
      await this.request('DELETE', `/subscriptions/${providerSubscriptionId}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  async verifyAndParseWebhook(rawBody: string, signature: string): Promise<WebhookEvent | null> {
    if (!this.webhookSecret) {
      logger.error('POLAR_WEBHOOK_SECRET is not configured');
      return null;
    }

    // Polar uses "sha256=<hex>" format
    const parts = signature.split('=');
    if (parts.length !== 2 || parts[0] !== 'sha256') {
      logger.warn('Invalid Polar webhook signature format');
      return null;
    }

    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    try {
      if (!timingSafeEqual(Buffer.from(parts[1]!), Buffer.from(expected))) {
        logger.warn('Polar webhook signature mismatch');
        return null;
      }
    } catch {
      logger.warn('Polar webhook signature comparison failed');
      return null;
    }

    const payload = JSON.parse(rawBody);
    return this.normaliseEvent(payload);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private resolveProductId(planId: string): string | undefined {
    const map: Record<string, string | undefined> = {
      pro: process.env.POLAR_PRODUCT_PRO,
      enterprise: process.env.POLAR_PRODUCT_ENTERPRISE,
      monthly: process.env.POLAR_PRODUCT_MONTHLY,
      weekly: process.env.POLAR_PRODUCT_WEEKLY,
      tier_2_20: process.env.POLAR_PRODUCT_PLUS,
      tier_6_50: process.env.POLAR_PRODUCT_PRO,
      tier_25_200: process.env.POLAR_PRODUCT_ULTRA,
    };
    return map[planId];
  }

  private mapStatus(
    polarStatus: string
  ): SubscriptionInfo['status'] {
    const mapping: Record<string, SubscriptionInfo['status']> = {
      active: 'active',
      canceled: 'cancelled',
      cancelled: 'cancelled',
      incomplete: 'pending',
      incomplete_expired: 'expired',
      past_due: 'past_due',
      trialing: 'trialing',
      unpaid: 'past_due',
    };
    return mapping[polarStatus] || 'active';
  }

  private normaliseEvent(payload: any): WebhookEvent {
    const rawType: string = payload.type || payload.event || '';
    const data = payload.data || {};

    let type: WebhookEvent['type'] = 'unknown';
    if (rawType.includes('subscription.created') || rawType.includes('subscription.active')) {
      type = 'subscription.created';
    } else if (rawType.includes('subscription.updated')) {
      type = 'subscription.updated';
    } else if (rawType.includes('subscription.canceled') || rawType.includes('subscription.cancelled')) {
      type = 'subscription.cancelled';
    } else if (rawType.includes('subscription.renewed') || rawType.includes('subscription.renewed')) {
      type = 'subscription.renewed';
    } else if (rawType.includes('order.created') || rawType.includes('checkout.completed') || rawType.includes('payment.succeeded')) {
      type = 'payment.succeeded';
    } else if (rawType.includes('payment.failed')) {
      type = 'payment.failed';
    } else if (rawType.includes('refund')) {
      type = 'refund.created';
    }

    return {
      type,
      provider: this.name,
      rawPayload: payload,
      userId: data.metadata?.user_id || data.customer_id,
      planId: data.metadata?.plan_id || data.product_id,
      subscriptionId: data.subscription_id || data.id,
      amount: data.amount,
      currency: data.currency,
    };
  }

  private async request(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const init: RequestInit = { method, headers };
    if (body) {
      init.body = JSON.stringify(body);
    }

    const res = await fetch(url, init);

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      const msg = `Polar API ${method} ${path} returned ${res.status}: ${errorBody}`;
      logger.error(msg);
      throw new Error(msg);
    }

    // DELETE may return 204 No Content
    if (res.status === 204) return {};
    return res.json();
  }
}
