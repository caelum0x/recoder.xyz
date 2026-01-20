/**
 * DodoPay Payment Integration
 * Alternative payment processor with lower fees for international customers
 */

export interface DodoPayConfig {
  merchantId: string;
  apiKey: string;
  secretKey: string;
  environment: 'sandbox' | 'production';
  webhookSecret: string;
}

export interface DodoPayPlan {
  planId: string;
  name: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
}

export const DODOPAY_PLANS: Record<string, DodoPayPlan> = {
  pro: {
    planId: 'dodo_bolt_pro',
    name: 'Pro',
    price: 20,
    currency: 'USD',
    interval: 'month'
  },
  team: {
    planId: 'dodo_bolt_team',
    name: 'Team',
    price: 50,
    currency: 'USD',
    interval: 'month'
  },
  enterprise: {
    planId: 'dodo_bolt_enterprise',
    name: 'Enterprise',
    price: 200,
    currency: 'USD',
    interval: 'month'
  }
};

/**
 * DodoPay Client
 */
export class DodoPayClient {
  private config: DodoPayConfig;
  private baseUrl: string;

  constructor(config: DodoPayConfig) {
    this.config = config;
    this.baseUrl = config.environment === 'sandbox'
      ? 'https://sandbox-api.dodopayments.com'
      : 'https://api.dodopayments.com';
  }

  /**
   * Create payment session
   */
  async createPaymentSession(params: {
    userId: string;
    email: string;
    planId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ paymentUrl: string; sessionId: string }> {
    const plan = DODOPAY_PLANS[params.planId];

    const response = await fetch(`${this.baseUrl}/v1/payment-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        merchant_id: this.config.merchantId,
        amount: plan.price * 100, // Convert to cents
        currency: plan.currency,
        customer_email: params.email,
        metadata: {
          userId: params.userId,
          planId: params.planId
        },
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        payment_method_types: ['card', 'alipay', 'wechat_pay'],
        mode: 'subscription',
        subscription_data: {
          plan_id: plan.planId,
          interval: plan.interval
        }
      })
    });

    if (!response.ok) {
      const error = await response.json() as { message?: string };
      throw new Error(`DodoPay session failed: ${error.message}`);
    }

    const data = await response.json() as {
      payment_url: string;
      session_id: string;
    };
    return {
      paymentUrl: data.payment_url,
      sessionId: data.session_id
    };
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/v1/subscriptions/${subscriptionId}`, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch subscription: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string, immediate: boolean = false): Promise<void> {
    const response = await fetch(`${this.baseUrl}/v1/subscriptions/${subscriptionId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        cancel_at_period_end: !immediate
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to cancel subscription: ${response.statusText}`);
    }
  }

  /**
   * Update subscription
   */
  async updateSubscription(subscriptionId: string, newPlanId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/v1/subscriptions/${subscriptionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        plan_id: newPlanId,
        proration_behavior: 'create_prorations'
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to update subscription: ${response.statusText}`);
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload: string, signature: string, timestamp: string): boolean {
    const crypto = require('crypto');

    // DodoPay uses timestamp + payload signature
    const signedPayload = `${timestamp}.${payload}`;
    const hmac = crypto.createHmac('sha256', this.config.webhookSecret);
    hmac.update(signedPayload);
    const expectedSignature = hmac.digest('hex');

    return signature === expectedSignature;
  }

  /**
   * Handle webhook events
   */
  async handleWebhook(event: DodoPayWebhookEvent): Promise<void> {
    switch (event.type) {
      case 'subscription.created':
        await this.onSubscriptionCreated(event.data);
        break;
      case 'subscription.updated':
        await this.onSubscriptionUpdated(event.data);
        break;
      case 'subscription.deleted':
        await this.onSubscriptionCancelled(event.data);
        break;
      case 'payment.succeeded':
        await this.onPaymentSucceeded(event.data);
        break;
      case 'payment.failed':
        await this.onPaymentFailed(event.data);
        break;
      case 'invoice.payment_succeeded':
        await this.onInvoicePaid(event.data);
        break;
      default:
        console.log('Unhandled DodoPay webhook:', event.type);
    }
  }

  private async onSubscriptionCreated(data: any): Promise<void> {
    const userId = data.metadata?.userId;
    console.log(`DodoPay subscription created for user ${userId}`);
    // Update database
  }

  private async onSubscriptionUpdated(data: any): Promise<void> {
    console.log('DodoPay subscription updated:', data);
  }

  private async onSubscriptionCancelled(data: any): Promise<void> {
    console.log('DodoPay subscription cancelled:', data);
  }

  private async onPaymentSucceeded(data: any): Promise<void> {
    console.log('DodoPay payment succeeded:', data);
    // Reset usage counters
  }

  private async onPaymentFailed(data: any): Promise<void> {
    console.log('DodoPay payment failed:', data);
    // Send notification to user
  }

  private async onInvoicePaid(data: any): Promise<void> {
    console.log('DodoPay invoice paid:', data);
  }

  /**
   * List all payment methods
   */
  async listPaymentMethods(customerId: string): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/v1/customers/${customerId}/payment-methods`, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to list payment methods');
    }

    const data = await response.json() as {
      payment_methods: any[];
    };
    return data.payment_methods;
  }

  /**
   * Create customer portal session (for managing subscriptions)
   */
  async createPortalSession(customerId: string, returnUrl: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/billing-portal/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        customer_id: customerId,
        return_url: returnUrl
      })
    });

    if (!response.ok) {
      throw new Error('Failed to create portal session');
    }

    const data = await response.json() as {
      url: string;
    };
    return data.url;
  }
}

export interface DodoPayWebhookEvent {
  id: string;
  type: string;
  data: any;
  created: number;
}

/**
 * Initialize DodoPay client from environment
 */
export function createDodoPayClient(env: any): DodoPayClient {
  const config: DodoPayConfig = {
    merchantId: env.DODOPAY_MERCHANT_ID,
    apiKey: env.DODOPAY_API_KEY,
    secretKey: env.DODOPAY_SECRET_KEY,
    environment: env.DODOPAY_ENVIRONMENT || 'sandbox',
    webhookSecret: env.DODOPAY_WEBHOOK_SECRET
  };

  return new DodoPayClient(config);
}
