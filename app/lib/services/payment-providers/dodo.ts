/**
 * DodoPayments Payment Provider
 *
 * Wraps the existing DodoPaymentsService into the PaymentProvider interface.
 * Activates when DODO_PAYMENTS_API_KEY (or fallbacks) is set.
 *
 * Webhook verification uses DODO_WEBHOOK_SECRET with HMAC-SHA256
 * (raw hex, no prefix).
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { logger } from '@/lib/logger';
import { resolveDodoApiKey } from '@/lib/billing-credentials';
import { resolveSafeCheckoutReturnUrl } from '@/lib/billing-return-url';
import type {
  PaymentProvider,
  CheckoutSessionParams,
  CheckoutSessionResult,
  SubscriptionInfo,
  WebhookEvent,
} from './types';

export class DodoPaymentProvider implements PaymentProvider {
  readonly name = 'dodo';

  private apiKey: string;
  private webhookSecret: string;
  private baseUrl = 'https://api.dodopayments.com';

  constructor(apiKey: string, webhookSecret?: string) {
    this.apiKey = apiKey;
    this.webhookSecret = webhookSecret || process.env.DODO_WEBHOOK_SECRET || '';
  }

  // ---------------------------------------------------------------------------
  // Checkout
  // ---------------------------------------------------------------------------

  async createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSessionResult> {
    const productId = this.resolveProductId(params.planId);
    if (!productId) {
      throw new Error(`No Dodo product ID configured for plan: ${params.planId}`);
    }

    // Use the existing DodoPayments SDK if available, fall back to direct API
    try {
      const DodoPayments = (await import('dodopayments')).default;
      const client = new DodoPayments({ bearerToken: this.apiKey });

      const session = await client.checkoutSessions.create({
        product_cart: [{ product_id: productId, quantity: 1 }],
        subscription_data: params.trialDays
          ? { trial_period_days: params.trialDays }
          : undefined,
        customer: {
          email: params.userEmail,
          name: params.userName || params.userEmail,
        },
        return_url: resolveSafeCheckoutReturnUrl(params.successUrl),
      });

      return {
        sessionId: session.session_id,
        checkoutUrl: session.checkout_url,
        provider: this.name,
      };
    } catch (sdkError) {
      // Fallback: direct HTTP call if the SDK is not available
      logger.warn('DodoPayments SDK unavailable, using direct API', {
        error: String(sdkError),
      });

      const res = await this.request('POST', '/checkout-sessions', {
        product_cart: [{ product_id: productId, quantity: 1 }],
        customer: {
          email: params.userEmail,
          name: params.userName || params.userEmail,
        },
        return_url: resolveSafeCheckoutReturnUrl(params.successUrl),
      });

      return {
        sessionId: res.session_id || res.id,
        checkoutUrl: res.checkout_url || res.url,
        provider: this.name,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  async getSubscription(providerSubscriptionId: string): Promise<SubscriptionInfo> {
    const res = await this.request('GET', `/subscriptions/${providerSubscriptionId}`);

    return {
      id: res.subscription_id || res.id,
      status: this.mapStatus(res.status),
      planId: res.product_id || res.plan_id || '',
      provider: this.name,
      currentPeriodStart: res.current_period_start
        ? new Date(res.current_period_start * 1000).toISOString()
        : undefined,
      currentPeriodEnd: res.current_period_end
        ? new Date(res.current_period_end * 1000).toISOString()
        : undefined,
      cancelAtPeriodEnd: res.cancel_at_period_end ?? false,
    };
  }

  async cancelSubscription(providerSubscriptionId: string, atPeriodEnd = true): Promise<void> {
    await this.request('PATCH', `/subscriptions/${providerSubscriptionId}`, {
      cancel_at_period_end: atPeriodEnd,
      ...(!atPeriodEnd && { status: 'cancelled' }),
    });
  }

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  async verifyAndParseWebhook(rawBody: string, signature: string): Promise<WebhookEvent | null> {
    if (!this.webhookSecret) {
      logger.error('DODO_WEBHOOK_SECRET is not configured');
      return null;
    }

    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');

    try {
      if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        logger.warn('Dodo webhook signature mismatch');
        return null;
      }
    } catch {
      logger.warn('Dodo webhook signature comparison failed');
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
      pro: process.env.DODO_PRODUCT_PRO,
      enterprise: process.env.DODO_PRODUCT_ENTERPRISE,
      monthly: process.env.DODO_PRODUCT_MONTHLY,
      weekly: process.env.DODO_PRODUCT_WEEKLY,
    };
    return map[planId];
  }

  private mapStatus(dodoStatus: string): SubscriptionInfo['status'] {
    const mapping: Record<string, SubscriptionInfo['status']> = {
      active: 'active',
      on_hold: 'on_hold',
      cancelled: 'cancelled',
      canceled: 'cancelled',
      expired: 'expired',
      pending: 'pending',
    };
    return mapping[dodoStatus] || 'active';
  }

  private normaliseEvent(payload: any): WebhookEvent {
    const rawType: string = payload.type || '';
    const data = payload.data || {};

    let type: WebhookEvent['type'] = 'unknown';
    if (rawType === 'subscription.active' || rawType === 'subscription.created') {
      type = 'subscription.created';
    } else if (rawType === 'subscription.updated' || rawType === 'subscription.plan_changed') {
      type = 'subscription.updated';
    } else if (rawType === 'subscription.cancelled' || rawType === 'subscription.canceled') {
      type = 'subscription.cancelled';
    } else if (rawType === 'subscription.renewed') {
      type = 'subscription.renewed';
    } else if (rawType === 'payment.succeeded') {
      type = 'payment.succeeded';
    } else if (rawType === 'payment.failed') {
      type = 'payment.failed';
    } else if (rawType === 'refund.created') {
      type = 'refund.created';
    }

    return {
      type,
      provider: this.name,
      rawPayload: payload,
      userId: data.user_id || data.customer_id || payload.user_id,
      planId: data.plan_id || data.product_id,
      subscriptionId: data.subscription_id,
      amount: data.amount,
      currency: data.currency || 'USD',
    };
  }

  private async request(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const init: RequestInit = { method, headers };
    if (body) {
      init.body = JSON.stringify(body);
    }

    const res = await fetch(url, init);

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      const msg = `Dodo API ${method} ${path} returned ${res.status}: ${errorBody}`;
      logger.error(msg);
      throw new Error(msg);
    }

    if (res.status === 204) return {};
    return res.json();
  }
}
