/**
 * Dodo Pay Integration for Recoder.xyz
 * Handles subscription management and payments
 */

export interface DodoPayConfig {
  apiKey: string;
  baseUrl: string;
  webhookSecret: string;
  returnUrl: string;
}

export interface SubscriptionPlan {
  id: string;
  name: 'FREE' | 'PREMIUM' | 'EXTRA PREMIUM' | 'ENTERPRISE';
  price: number;
  currency: 'USD';
  interval: 'month' | 'week';
  features: {
    cliRequests: number | 'unlimited';
    webProjects: number | 'unlimited';
    chatMessages: number | 'unlimited';
    extensionSuggestions: number | 'unlimited';
    storage: string;
    support: 'community' | 'email' | 'priority';
  };
}

export interface CustomerData {
  email: string;
  name: string;
  phoneNumber?: string;
}

export interface BillingData {
  street: string;
  city: string;
  state: string;
  zipcode: string;
  country: string;
}

export interface SubscriptionRequest {
  customer: CustomerData;
  billing: BillingData;
  productId: string;
  quantity: number;
  returnUrl?: string;
}

export interface SubscriptionResponse {
  subscriptionId: string;
  paymentLink: string;
  clientSecret: string;
  customer: {
    customerId: string;
    email: string;
    name: string;
  };
  recurringPreTaxAmount: number;
  metadata: Record<string, any>;
}

export interface WebhookEvent {
  businessId: string;
  timestamp: string;
  type: 'subscription.active' | 'subscription.on_hold' | 'subscription.failed' | 'subscription.renewed' | 'payment.succeeded' | 'payment.failed';
  data: {
    subscriptionId: string;
    customerId: string;
    productId: string;
    status: string;
    amount?: number;
    currency?: string;
    metadata?: Record<string, any>;
  };
}

export class DodoPayService {
  private config: DodoPayConfig;

  constructor(config: DodoPayConfig) {
    this.config = config;
  }

  /**
   * Subscription Plans for Recoder.xyz
   * PROFIT-FOCUSED LIMITS - Ensuring 60%+ profit margins
   * 
   * COST BREAKDOWN PER USER:
   * Infrastructure: ~$40/month base + per-user scaling
   * Smart Routing: 70% cheap models ($0.002), 30% Claude ($0.021)
   * Average cost per request: ~$0.007 with smart routing
   * 
   * PROFIT TARGETS:
   * - FREE: Loss leader for conversion (max $2 cost)
   * - PREMIUM: $12+ profit margin (60% margin)
   * - EXTRA PREMIUM: $60+ profit margin (60% margin)  
   * - ENTERPRISE: $25+ profit margin (62% margin)
   */
  static readonly PLANS: SubscriptionPlan[] = [
    {
      id: 'free',
      name: 'FREE',
      price: 0,
      currency: 'USD',
      interval: 'month',
      features: {
        cliRequests: 20, // ~$0.14 cost (mostly local/Groq)
        webProjects: 2,
        chatMessages: 30, // ~$0.21 cost 
        extensionSuggestions: 50, // ~$0.35 cost
        storage: '50MB', // ~$0.01 cost
        support: 'community' // Total: ~$0.71 cost - acceptable loss leader
      }
    },
    {
      id: 'premium',
      name: 'PREMIUM', 
      price: 20,
      currency: 'USD',
      interval: 'month',
      features: {
        cliRequests: 500, // ~$3.50 cost with smart routing
        webProjects: 15, // Minimal storage impact
        chatMessages: 800, // ~$5.60 cost (mixed models)
        extensionSuggestions: 1000, // ~$7.00 cost (fast models)
        storage: '2GB', // ~$0.20 cost
        support: 'email' // Total: ~$8 cost → $12 profit (60% margin)
      }
    },
    {
      id: 'extra-premium',
      name: 'EXTRA PREMIUM',
      price: 100,
      currency: 'USD', 
      interval: 'month',
      features: {
        cliRequests: 3000, // ~$21 cost with smart routing  
        webProjects: 100, // Minimal storage impact
        chatMessages: 5000, // ~$35 cost (balanced models)
        extensionSuggestions: 8000, // ~$56 cost (mostly fast models)
        storage: '50GB', // ~$5 cost
        support: 'priority' // Total: ~$40 cost → $60 profit (60% margin)
      }
    },
    {
      id: 'enterprise-weekly',
      name: 'ENTERPRISE',
      price: 10,
      currency: 'USD', 
      interval: 'week',
      features: {
        cliRequests: 400, // ~$2.80/week ($11.20/month) cost
        webProjects: 'unlimited',
        chatMessages: 600, // ~$4.20/week ($16.80/month) cost  
        extensionSuggestions: 1000, // ~$7/week ($28/month) cost
        storage: '200GB', // ~$2/week ($8/month) cost
        support: 'priority' // Total: ~$15/week ($60/month) cost → $25/month profit
      }
    }
  ];

  /**
   * Create a subscription payment link
   */
  async createSubscription(request: SubscriptionRequest): Promise<SubscriptionResponse> {
    try {
      const response = await fetch(`${this.config.baseUrl}/subscriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          billing: {
            city: request.billing.city,
            country: request.billing.country,
            state: request.billing.state,
            street: request.billing.street,
            zipcode: parseInt(request.billing.zipcode)
          },
          customer: {
            email: request.customer.email,
            name: request.customer.name,
            phone_number: request.customer.phoneNumber
          },
          product_id: request.productId,
          quantity: request.quantity,
          payment_link: true,
          return_url: request.returnUrl || this.config.returnUrl
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(`Dodo Pay API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      
      return {
        subscriptionId: data.subscription_id,
        paymentLink: data.payment_link,
        clientSecret: data.client_secret,
        customer: {
          customerId: data.customer.customer_id,
          email: data.customer.email,
          name: data.customer.name
        },
        recurringPreTaxAmount: data.recurring_pre_tax_amount,
        metadata: data.metadata || {}
      };
    } catch (error) {
      console.error('Error creating Dodo Pay subscription:', error);
      throw error;
    }
  }

  /**
   * Change subscription plan
   */
  async changeSubscriptionPlan(
    subscriptionId: string, 
    newProductId: string, 
    proration: 'prorated_immediately' | 'full_immediately' = 'prorated_immediately'
  ): Promise<any> {
    try {
      const response = await fetch(`${this.config.baseUrl}/subscriptions/change-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          subscription_id: subscriptionId,
          product_id: newProductId,
          proration_option: proration
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(`Dodo Pay plan change error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error changing subscription plan:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<any> {
    try {
      const response = await fetch(`${this.config.baseUrl}/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(`Dodo Pay cancellation error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error canceling subscription:', error);
      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    // Implement webhook signature verification
    // This would typically use HMAC with the webhook secret
    try {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', this.config.webhookSecret)
        .update(payload)
        .digest('hex');
      
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      console.error('Error verifying webhook signature:', error);
      return false;
    }
  }

  /**
   * Handle webhook events
   */
  async handleWebhook(event: WebhookEvent): Promise<void> {
    console.log(`Processing Dodo Pay webhook: ${event.type}`, event.data);

    switch (event.type) {
      case 'subscription.active':
        await this.handleSubscriptionActive(event.data);
        break;
      
      case 'subscription.on_hold':
        await this.handleSubscriptionOnHold(event.data);
        break;
      
      case 'subscription.failed':
        await this.handleSubscriptionFailed(event.data);
        break;
      
      case 'subscription.renewed':
        await this.handleSubscriptionRenewed(event.data);
        break;
      
      case 'payment.succeeded':
        await this.handlePaymentSucceeded(event.data);
        break;
      
      case 'payment.failed':
        await this.handlePaymentFailed(event.data);
        break;
      
      default:
        console.warn(`Unhandled webhook event type: ${event.type}`);
    }
  }

  private async handleSubscriptionActive(data: any): Promise<void> {
    // Update user subscription status to active
    // This would integrate with your user management system
    console.log('Subscription activated:', data.subscriptionId);
  }

  private async handleSubscriptionOnHold(data: any): Promise<void> {
    // Handle subscription on hold (payment failed)
    console.log('Subscription on hold:', data.subscriptionId);
  }

  private async handleSubscriptionFailed(data: any): Promise<void> {
    // Handle subscription creation failure
    console.log('Subscription failed:', data.subscriptionId);
  }

  private async handleSubscriptionRenewed(data: any): Promise<void> {
    // Handle successful renewal
    console.log('Subscription renewed:', data.subscriptionId);
  }

  private async handlePaymentSucceeded(data: any): Promise<void> {
    // Handle successful payment
    console.log('Payment succeeded:', data);
  }

  private async handlePaymentFailed(data: any): Promise<void> {
    // Handle failed payment
    console.log('Payment failed:', data);
  }

  /**
   * Get plan by ID
   */
  static getPlanById(planId: string): SubscriptionPlan | undefined {
    return this.PLANS.find(plan => plan.id === planId);
  }

  /**
   * Get plan by name
   */
  static getPlanByName(planName: 'FREE' | 'PRO' | 'ENTERPRISE'): SubscriptionPlan | undefined {
    return this.PLANS.find(plan => plan.name === planName);
  }
}

// Export singleton instance
export const dodoPayService = new DodoPayService({
  apiKey: process.env.DODO_PAYMENTS_API_KEY!,
  baseUrl: process.env.DODO_API_BASE_URL || 'https://api.dodopayments.com',
  webhookSecret: process.env.DODO_WEBHOOK_SECRET!,
  returnUrl: process.env.NEXT_PUBLIC_RETURN_URL || 'https://recoder.xyz/subscription/success'
});

export default dodoPayService;