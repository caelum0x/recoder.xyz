/**
 * Paddle Payment Integration
 * Official Paddle SDK integration for subscription management
 */

import { Paddle } from '@paddle/paddle-node-sdk';

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PaddlePaymentServer');

interface PaddleConfig {
  apiKey: string;
  environment: 'sandbox' | 'production';
  webhookSecret: string;
}

interface CreateCheckoutOptions {
  priceId: string;
  customerId?: string;
  email: string;
  userId: string;
  successUrl: string;
  cancelUrl?: string;
}

export class PaddleClient {
  private paddle: Paddle;
  private config: PaddleConfig;

  constructor(config: PaddleConfig) {
    this.config = config;
    this.paddle = new Paddle(config.apiKey, {
      environment: config.environment as any,
    });
  }

  /**
   * Create a checkout session for subscription
   */
  async createCheckout(options: CreateCheckoutOptions) {
    try {
      const checkoutData: any = {
        items: [
          {
            priceId: options.priceId,
            quantity: 1,
          },
        ],
        customerEmail: options.email,
        customData: {
          userId: options.userId,
        },
        successUrl: options.successUrl,
      };

      if (options.customerId) {
        checkoutData.customerId = options.customerId;
      }

      if (options.cancelUrl) {
        checkoutData.cancelUrl = options.cancelUrl;
      }

      const checkout = await (this.paddle as any).checkout.create(checkoutData) as any;

      return {
        checkoutUrl: checkout.url,
        checkoutId: checkout.id,
      };
    } catch (error) {
      logger.error('Paddle checkout creation failed:', error);
      throw new Error(`Failed to create Paddle checkout: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId: string) {
    try {
      const subscription = await this.paddle.subscriptions.get(subscriptionId) as any;
      return subscription;
    } catch (error) {
      logger.error('Failed to get Paddle subscription:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string, immediate: boolean = false) {
    try {
      if (immediate) {
        const result = await this.paddle.subscriptions.cancel(subscriptionId, {
          effectiveFrom: 'immediately' as any,
        }) as any;
        return result;
      } else {
        const result = await this.paddle.subscriptions.cancel(subscriptionId, {
          effectiveFrom: 'next_billing_period' as any,
        }) as any;
        return result;
      }
    } catch (error) {
      logger.error('Failed to cancel Paddle subscription:', error);
      throw error;
    }
  }

  /**
   * Create a billing portal session for self-service management
   */
  async createBillingPortalSession(customerId: string) {
    try {
      const portal = await (this.paddle as any).customers.createAuthToken(customerId) as any;
      return { url: portal.url || portal.customer_auth_token };
    } catch (error) {
      logger.error('Failed to create Paddle billing portal session:', error);
      throw new Error(`Failed to create billing portal: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload: string, signature: string): boolean {
    try {
      const crypto = require('crypto');
      const hmac = crypto.createHmac('sha256', this.config.webhookSecret);
      hmac.update(payload);
      const expectedSignature = hmac.digest('hex');

      return signature === expectedSignature;
    } catch (error) {
      logger.error('Webhook verification failed:', error);
      return false;
    }
  }
}

/**
 * Initialize Paddle client
 */
export function getPaddleClient(env: Env): PaddleClient {
  if (!env.PADDLE_API_KEY) {
    throw new Error('PADDLE_API_KEY not configured');
  }

  if (!env.PADDLE_WEBHOOK_SECRET) {
    throw new Error('PADDLE_WEBHOOK_SECRET not configured');
  }

  return new PaddleClient({
    apiKey: env.PADDLE_API_KEY,
    environment: env.PADDLE_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
    webhookSecret: env.PADDLE_WEBHOOK_SECRET,
  });
}
