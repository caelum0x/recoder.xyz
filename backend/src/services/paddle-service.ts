/**
 * Paddle Payment Service
 * Handles Paddle Billing integration for credit card payments
 */

import { logger } from '../utils/logger';
import * as crypto from 'crypto';

const PADDLE_VENDOR_ID = process.env.PADDLE_VENDOR_ID || '';
const PADDLE_API_KEY = process.env.PADDLE_API_KEY || '';
const PADDLE_PUBLIC_KEY = process.env.PADDLE_PUBLIC_KEY || '';
const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET || '';
const PADDLE_ENVIRONMENT = process.env.PADDLE_ENVIRONMENT || 'sandbox'; // 'sandbox' or 'production'

// Paddle Price IDs (set these in your Paddle dashboard)
const PADDLE_PRICE_IDS = {
  'pro-monthly': process.env.PADDLE_PRO_MONTHLY_PRICE_ID || 'pri_01hs',
  'pro-yearly': process.env.PADDLE_PRO_YEARLY_PRICE_ID || 'pri_01ht',
  'enterprise': process.env.PADDLE_ENTERPRISE_PRICE_ID || 'pri_01hu'
};

interface PaddleCheckoutOptions {
  userId: string;
  planId: string;
  email: string;
  successUrl?: string;
  cancelUrl?: string;
}

interface PaddleWebhookEvent {
  event_type: string;
  subscription_id?: string;
  customer_id?: string;
  status?: string;
  custom_data?: any;
  next_billed_at?: string;
  current_billing_period?: {
    starts_at: string;
    ends_at: string;
  };
}

export class PaddleService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = PADDLE_ENVIRONMENT === 'production'
      ? 'https://api.paddle.com'
      : 'https://sandbox-api.paddle.com';
  }

  /**
   * Create a checkout session for subscription
   */
  async createCheckout(options: PaddleCheckoutOptions): Promise<{ url: string; checkoutId: string }> {
    try {
      const priceId = PADDLE_PRICE_IDS[options.planId as keyof typeof PADDLE_PRICE_IDS];
      
      if (!priceId) {
        throw new Error(`No Paddle price ID found for plan: ${options.planId}`);
      }

      const checkoutData = {
        items: [
          {
            price_id: priceId,
            quantity: 1
          }
        ],
        customer: {
          email: options.email
        },
        custom_data: {
          userId: options.userId,
          planId: options.planId
        },
        settings: {
          success_url: options.successUrl || `${process.env.NEXT_PUBLIC_WEB_URL}/checkout/success`,
          cancel_url: options.cancelUrl || `${process.env.NEXT_PUBLIC_WEB_URL}/pricing`
        }
      };

      const response = await fetch(`${this.baseUrl}/checkouts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PADDLE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(checkoutData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Paddle checkout failed: ${JSON.stringify(error)}`);
      }

      const data = await response.json();

      logger.info('Paddle checkout created', {
        userId: options.userId,
        planId: options.planId,
        checkoutId: data.data.id
      });

      return {
        url: data.data.url,
        checkoutId: data.data.id
      };
    } catch (error) {
      logger.error('Failed to create Paddle checkout', { error, options });
      throw error;
    }
  }

  /**
   * Verify Paddle webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      if (!PADDLE_WEBHOOK_SECRET) {
        logger.warn('Paddle webhook secret not configured');
        return false;
      }

      // Paddle uses HMAC SHA256 for webhook signatures
      const hmac = crypto.createHmac('sha256', PADDLE_WEBHOOK_SECRET);
      const digest = hmac.update(payload).digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(digest)
      );
    } catch (error) {
      logger.error('Failed to verify Paddle webhook signature', { error });
      return false;
    }
  }

  /**
   * Parse webhook event
   */
  parseWebhookEvent(body: any): PaddleWebhookEvent {
    return {
      event_type: body.event_type,
      subscription_id: body.data?.subscription_id,
      customer_id: body.data?.customer_id,
      status: body.data?.status,
      custom_data: body.data?.custom_data,
      next_billed_at: body.data?.next_billed_at,
      current_billing_period: body.data?.current_billing_period
    };
  }

  /**
   * Cancel subscription in Paddle
   */
  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/subscriptions/${subscriptionId}/cancel`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PADDLE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            effective_from: 'end_of_billing_period'
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to cancel Paddle subscription: ${JSON.stringify(error)}`);
      }

      logger.info('Paddle subscription cancelled', { subscriptionId });
      return true;
    } catch (error) {
      logger.error('Failed to cancel Paddle subscription', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Pause subscription in Paddle
   */
  async pauseSubscription(subscriptionId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/subscriptions/${subscriptionId}/pause`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PADDLE_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to pause Paddle subscription: ${JSON.stringify(error)}`);
      }

      logger.info('Paddle subscription paused', { subscriptionId });
      return true;
    } catch (error) {
      logger.error('Failed to pause Paddle subscription', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Resume subscription in Paddle
   */
  async resumeSubscription(subscriptionId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/subscriptions/${subscriptionId}/resume`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PADDLE_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to resume Paddle subscription: ${JSON.stringify(error)}`);
      }

      logger.info('Paddle subscription resumed', { subscriptionId });
      return true;
    } catch (error) {
      logger.error('Failed to resume Paddle subscription', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Get subscription details from Paddle
   */
  async getSubscription(subscriptionId: string): Promise<any> {
    try {
      const response = await fetch(
        `${this.baseUrl}/subscriptions/${subscriptionId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${PADDLE_API_KEY}`
          }
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get Paddle subscription: ${JSON.stringify(error)}`);
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      logger.error('Failed to get Paddle subscription', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Update payment method URL
   */
  getUpdatePaymentMethodUrl(subscriptionId: string): string {
    return `${this.baseUrl.replace('api.', '')}/subscriptions/${subscriptionId}/update-payment-method`;
  }

  /**
   * Get customer portal URL
   */
  getCustomerPortalUrl(customerId: string): string {
    return `${this.baseUrl.replace('api.', '')}/customers/${customerId}/portal`;
  }
}

export const paddleService = new PaddleService();
