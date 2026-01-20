/**
 * Paddle Payment Integration
 * Handles subscription management, webhooks, and billing
 */

export interface PaddleConfig {
  vendorId: string;
  apiKey: string;
  publicKey: string;
  environment: 'sandbox' | 'production';
  webhookSecret: string;
}

export interface SubscriptionPlan {
  planId: string;
  name: string;
  price: number;
  currency: string;
  billingCycle: 'monthly' | 'yearly';
  features: string[];
}

export const PADDLE_PLANS: Record<string, SubscriptionPlan> = {
  free: {
    planId: 'free',
    name: 'Free',
    price: 0,
    currency: 'USD',
    billingCycle: 'monthly',
    features: ['5 generations/month', 'Basic templates', 'Community support']
  },
  pro: {
    planId: 'prod_bolt_pro_monthly',
    name: 'Pro',
    price: 20,
    currency: 'USD',
    billingCycle: 'monthly',
    features: [
      '100 generations/month',
      'All templates',
      'Priority support',
      'Custom deployments',
      'Advanced AI models'
    ]
  },
  team: {
    planId: 'prod_bolt_team_monthly',
    name: 'Team',
    price: 50,
    currency: 'USD',
    billingCycle: 'monthly',
    features: [
      '500 generations/month',
      'Team collaboration',
      'Private templates',
      'Dedicated support',
      'SSO integration'
    ]
  },
  enterprise: {
    planId: 'prod_bolt_enterprise_monthly',
    name: 'Enterprise',
    price: 200,
    currency: 'USD',
    billingCycle: 'monthly',
    features: [
      '2000 generations/month',
      'Custom integrations',
      'On-premise deployment',
      'SLA guarantee',
      'Custom AI model training'
    ]
  }
};

/**
 * Paddle Client Wrapper
 */
export class PaddleClient {
  private config: PaddleConfig;
  private baseUrl: string;

  constructor(config: PaddleConfig) {
    this.config = config;
    this.baseUrl = config.environment === 'sandbox'
      ? 'https://sandbox-api.paddle.com'
      : 'https://api.paddle.com';
  }

  /**
   * Initialize Paddle checkout
   */
  async createCheckoutSession(params: {
    userId: string;
    email: string;
    planId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ checkoutUrl: string; sessionId: string }> {
    const response = await fetch(`${this.baseUrl}/checkout/custom`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        vendor_id: this.config.vendorId,
        product_id: params.planId,
        customer_email: params.email,
        passthrough: JSON.stringify({ userId: params.userId }),
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        marketing_consent: false
      })
    });

    if (!response.ok) {
      throw new Error(`Paddle checkout failed: ${response.statusText}`);
    }

    const data = await response.json() as {
      url: string;
      id: string;
    };
    return {
      checkoutUrl: data.url,
      sessionId: data.id
    };
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}`, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch subscription: ${response.statusText}`);
    }

    return response.json() as Promise<any>;
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to cancel subscription: ${response.statusText}`);
    }
  }

  /**
   * Update subscription plan
   */
  async updateSubscription(subscriptionId: string, newPlanId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        plan_id: newPlanId,
        prorate: true
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to update subscription: ${response.statusText}`);
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload: string, signature: string): boolean {
    // Implement Paddle webhook signature verification
    // Uses HMAC SHA256 with webhook secret
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', this.config.webhookSecret);
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');

    return signature === expectedSignature;
  }

  /**
   * Handle webhook events
   */
  async handleWebhook(event: PaddleWebhookEvent): Promise<void> {
    switch (event.alert_name) {
      case 'subscription_created':
        await this.onSubscriptionCreated(event);
        break;
      case 'subscription_updated':
        await this.onSubscriptionUpdated(event);
        break;
      case 'subscription_cancelled':
        await this.onSubscriptionCancelled(event);
        break;
      case 'subscription_payment_succeeded':
        await this.onPaymentSucceeded(event);
        break;
      case 'subscription_payment_failed':
        await this.onPaymentFailed(event);
        break;
      default:
        console.log('Unhandled webhook event:', event.alert_name);
    }
  }

  private async onSubscriptionCreated(event: any): Promise<void> {
    console.log('Paddle: Subscription created', event);
    // Handled by webhook route with DB integration
  }

  private async onSubscriptionUpdated(event: any): Promise<void> {
    console.log('Paddle: Subscription updated', event);
    // Handled by webhook route with DB integration
  }

  private async onSubscriptionCancelled(event: any): Promise<void> {
    console.log('Paddle: Subscription cancelled', event);
    // Handled by webhook route with DB integration
  }

  private async onPaymentSucceeded(event: any): Promise<void> {
    console.log('Paddle: Payment succeeded', event);
    // Handled by webhook route with DB integration
  }

  private async onPaymentFailed(event: any): Promise<void> {
    console.log('Paddle: Payment failed', event);
    // Handled by webhook route with DB integration
  }
}

export interface PaddleWebhookEvent {
  alert_name: string;
  alert_id: string;
  subscription_id?: string;
  subscription_plan_id?: string;
  status?: string;
  passthrough?: string;
  [key: string]: any;
}

/**
 * Initialize Paddle client from environment
 */
export function createPaddleClient(env: any): PaddleClient {
  const config: PaddleConfig = {
    vendorId: env.PADDLE_VENDOR_ID,
    apiKey: env.PADDLE_API_KEY,
    publicKey: env.PADDLE_PUBLIC_KEY,
    environment: env.PADDLE_ENVIRONMENT || 'sandbox',
    webhookSecret: env.PADDLE_WEBHOOK_SECRET
  };

  return new PaddleClient(config);
}
