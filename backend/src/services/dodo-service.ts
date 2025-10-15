/**
 * DODO Pay Service
 * Handles cryptocurrency payment integration
 */

import { logger } from '../utils/logger';
import * as crypto from 'crypto';

const DODO_API_KEY = process.env.DODO_API_KEY || '';
const DODO_WEBHOOK_SECRET = process.env.DODO_WEBHOOK_SECRET || '';
const DODO_ENVIRONMENT = process.env.DODO_ENVIRONMENT || 'testnet'; // 'testnet' or 'mainnet'

interface DodoOrderOptions {
  userId: string;
  planId: string;
  email: string;
  amount: number;
  currency?: string;
  successUrl?: string;
  cancelUrl?: string;
}

interface DodoWebhookEvent {
  event: string;
  order_id: string;
  status: string;
  amount: number;
  currency: string;
  metadata?: any;
  transaction_hash?: string;
  blockchain?: string;
  created_at: string;
  completed_at?: string;
}

export class DodoService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = DODO_ENVIRONMENT === 'mainnet'
      ? 'https://api.dodo.ac/v1'
      : 'https://testnet-api.dodo.ac/v1';
  }

  /**
   * Create a crypto payment order
   */
  async createOrder(options: DodoOrderOptions): Promise<{ url: string; orderId: string }> {
    try {
      const orderData = {
        amount: options.amount,
        currency: options.currency || 'USD',
        metadata: {
          userId: options.userId,
          planId: options.planId,
          email: options.email
        },
        success_url: options.successUrl || `${process.env.NEXT_PUBLIC_WEB_URL}/checkout/success`,
        cancel_url: options.cancelUrl || `${process.env.NEXT_PUBLIC_WEB_URL}/pricing`,
        webhook_url: `${process.env.BACKEND_URL}/api/webhooks/dodo`
      };

      const response = await fetch(`${this.baseUrl}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DODO_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`DODO order creation failed: ${JSON.stringify(error)}`);
      }

      const data = await response.json();

      logger.info('DODO order created', {
        userId: options.userId,
        planId: options.planId,
        orderId: data.order_id
      });

      return {
        url: data.checkout_url,
        orderId: data.order_id
      };
    } catch (error) {
      logger.error('Failed to create DODO order', { error, options });
      throw error;
    }
  }

  /**
   * Create a subscription order (recurring payment)
   */
  async createSubscription(options: DodoOrderOptions): Promise<{ url: string; subscriptionId: string }> {
    try {
      const subscriptionData = {
        plan_id: options.planId,
        amount: options.amount,
        currency: options.currency || 'USD',
        interval: 'monthly', // or 'yearly'
        metadata: {
          userId: options.userId,
          email: options.email
        },
        success_url: options.successUrl || `${process.env.NEXT_PUBLIC_WEB_URL}/checkout/success`,
        cancel_url: options.cancelUrl || `${process.env.NEXT_PUBLIC_WEB_URL}/pricing`,
        webhook_url: `${process.env.BACKEND_URL}/api/webhooks/dodo`
      };

      const response = await fetch(`${this.baseUrl}/subscriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DODO_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(subscriptionData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`DODO subscription creation failed: ${JSON.stringify(error)}`);
      }

      const data = await response.json();

      logger.info('DODO subscription created', {
        userId: options.userId,
        planId: options.planId,
        subscriptionId: data.subscription_id
      });

      return {
        url: data.checkout_url,
        subscriptionId: data.subscription_id
      };
    } catch (error) {
      logger.error('Failed to create DODO subscription', { error, options });
      throw error;
    }
  }

  /**
   * Verify DODO webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      if (!DODO_WEBHOOK_SECRET) {
        logger.warn('DODO webhook secret not configured');
        return false;
      }

      // DODO uses HMAC SHA256 for webhook signatures
      const hmac = crypto.createHmac('sha256', DODO_WEBHOOK_SECRET);
      const digest = hmac.update(payload).digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(digest)
      );
    } catch (error) {
      logger.error('Failed to verify DODO webhook signature', { error });
      return false;
    }
  }

  /**
   * Parse webhook event
   */
  parseWebhookEvent(body: any): DodoWebhookEvent {
    return {
      event: body.event,
      order_id: body.order_id || body.subscription_id,
      status: body.status,
      amount: body.amount,
      currency: body.currency,
      metadata: body.metadata,
      transaction_hash: body.transaction_hash,
      blockchain: body.blockchain,
      created_at: body.created_at,
      completed_at: body.completed_at
    };
  }

  /**
   * Get order details
   */
  async getOrder(orderId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/orders/${orderId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${DODO_API_KEY}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get DODO order: ${JSON.stringify(error)}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      logger.error('Failed to get DODO order', { error, orderId });
      throw error;
    }
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${DODO_API_KEY}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get DODO subscription: ${JSON.stringify(error)}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      logger.error('Failed to get DODO subscription', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DODO_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to cancel DODO subscription: ${JSON.stringify(error)}`);
      }

      logger.info('DODO subscription cancelled', { subscriptionId });
      return true;
    } catch (error) {
      logger.error('Failed to cancel DODO subscription', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Get supported cryptocurrencies
   */
  async getSupportedCurrencies(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/currencies`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${DODO_API_KEY}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to get supported currencies');
      }

      const data = await response.json();
      return data.currencies || ['BTC', 'ETH', 'USDT', 'USDC'];
    } catch (error) {
      logger.error('Failed to get supported currencies', { error });
      // Return default currencies
      return ['BTC', 'ETH', 'USDT', 'USDC'];
    }
  }

  /**
   * Get conversion rate
   */
  async getConversionRate(from: string, to: string = 'USD'): Promise<number> {
    try {
      const response = await fetch(
        `${this.baseUrl}/rates?from=${from}&to=${to}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${DODO_API_KEY}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to get conversion rate');
      }

      const data = await response.json();
      return data.rate || 1;
    } catch (error) {
      logger.error('Failed to get conversion rate', { error, from, to });
      return 1;
    }
  }
}

export const dodoService = new DodoService();
