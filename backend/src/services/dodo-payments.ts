// DODO Payments Integration for Recoder.xyz
// Handles subscription billing with multiple pricing tiers

import axios, { AxiosResponse } from 'axios';
import { logger } from '../utils/logger';

// DODO Payments API Configuration
interface DodoPaymentsConfig {
  apiKey: string;
  baseUrl: string;
  webhookSecret: string;
}

// Subscription Plans
export enum SubscriptionPlan {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly', 
  ENTERPRISE = 'enterprise'
}

export const SUBSCRIPTION_PLANS = {
  [SubscriptionPlan.WEEKLY]: {
    id: 'recoder-weekly',
    name: 'Recoder Weekly',
    price: 1000, // $10.00 in cents
    currency: 'USD',
    interval: 'Week',
    intervalCount: 1,
    description: 'Weekly subscription to Recoder.xyz AI development platform',
    features: [
      '500k AI tokens per week',
      '5k API requests per week',
      'Multi-provider AI access (Claude, Groq, Gemini)',
      'Real-time collaboration',
      'Basic support'
    ]
  },
  [SubscriptionPlan.MONTHLY]: {
    id: 'recoder-monthly',
    name: 'Recoder Monthly',
    price: 2000, // $20.00 in cents
    currency: 'USD',
    interval: 'Month',
    intervalCount: 1,
    description: 'Monthly subscription to Recoder.xyz AI development platform',
    features: [
      '2.5M AI tokens per month',
      '25k API requests per month',
      'Multi-provider AI access (Claude, Groq, Gemini)',
      'Real-time collaboration',
      'Advanced AI features',
      'Priority support',
      'Usage analytics'
    ]
  },
  [SubscriptionPlan.ENTERPRISE]: {
    id: 'recoder-enterprise',
    name: 'Recoder Enterprise',
    price: 10000, // $100.00 in cents
    currency: 'USD',
    interval: 'Month',
    intervalCount: 1,
    description: 'Enterprise subscription to Recoder.xyz with high-volume access',
    features: [
      '20M AI tokens per month',
      '200k API requests per month',
      'All AI providers (Claude, Groq, Gemini, OpenAI, DeepSeek)',
      'Real-time collaboration',
      'Advanced AI features',
      'White-label solutions',
      'Dedicated support',
      'Custom integrations',
      'SLA guarantee',
      'Advanced analytics'
    ]
  }
};

// DODO Payments Types
interface DodoCustomer {
  customer_id?: string;
  name: string;
  email: string;
  phone_number?: string;
}

interface DodoBillingAddress {
  country: string;
  state: string;
  city: string;
  street: string;
  zipcode: string;
}

interface DodoSubscriptionRequest {
  product_id: string;
  quantity: number;
  customer: DodoCustomer;
  billing: DodoBillingAddress;
  trial_period_days?: number;
  metadata?: Record<string, string>;
  return_url?: string;
  payment_link?: boolean;
}

interface DodoSubscriptionResponse {
  subscription_id: string;
  payment_id: string;
  recurring_pre_tax_amount: number;
  customer: {
    customer_id: string;
    name: string;
    email: string;
  };
  payment_link?: string;
  client_secret?: string;
  metadata: Record<string, string>;
}

interface DodoSubscriptionListItem {
  subscription_id: string;
  product_id: string;
  status: 'pending' | 'active' | 'on_hold' | 'cancelled' | 'failed' | 'expired';
  recurring_pre_tax_amount: number;
  currency: string;
  customer: {
    customer_id: string;
    name: string;
    email: string;
  };
  created_at: string;
  next_billing_date: string;
  cancel_at_next_billing_date: boolean;
}

class DodoPaymentsService {
  private config: DodoPaymentsConfig;
  private axios;

  constructor(config: DodoPaymentsConfig) {
    this.config = config;
    this.axios = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Create a new subscription
   */
  async createSubscription(params: {
    planId: string;
    customerName: string;
    customerEmail: string;
    billingAddress: DodoBillingAddress;
    trialDays?: number;
    metadata?: Record<string, string>;
    returnUrl?: string;
  }): Promise<DodoSubscriptionResponse> {
    try {
      const plan = this.getPlanById(params.planId);
      if (!plan) {
        throw new Error(`Invalid plan ID: ${params.planId}`);
      }

      const request: DodoSubscriptionRequest = {
        product_id: plan.id,
        quantity: 1,
        customer: {
          name: params.customerName,
          email: params.customerEmail
        },
        billing: params.billingAddress,
        trial_period_days: params.trialDays || 0,
        metadata: {
          plan: params.planId,
          service: 'recoder.xyz',
          ...params.metadata
        },
        return_url: params.returnUrl,
        payment_link: true
      };

      logger.info('Creating DODO subscription', { planId: params.planId, customerEmail: params.customerEmail });

      const response: AxiosResponse<DodoSubscriptionResponse> = await this.axios.post('/subscriptions', request);
      
      logger.info('DODO subscription created successfully', { 
        subscriptionId: response.data.subscription_id,
        paymentId: response.data.payment_id 
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to create DODO subscription', { error: error.message, params });
      throw new Error(`Subscription creation failed: ${error.message}`);
    }
  }

  /**
   * List subscriptions for a customer
   */
  async listSubscriptions(customerId?: string): Promise<DodoSubscriptionListItem[]> {
    try {
      const params: any = {};
      if (customerId) {
        params.customer_id = customerId;
      }

      const response: AxiosResponse<{ items: DodoSubscriptionListItem[] }> = await this.axios.get('/subscriptions', { params });
      
      return response.data.items;
    } catch (error) {
      logger.error('Failed to list DODO subscriptions', { error: error.message, customerId });
      throw new Error(`Failed to list subscriptions: ${error.message}`);
    }
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId: string): Promise<DodoSubscriptionListItem> {
    try {
      const response: AxiosResponse<DodoSubscriptionListItem> = await this.axios.get(`/subscriptions/${subscriptionId}`);
      
      return response.data;
    } catch (error) {
      logger.error('Failed to get DODO subscription', { error: error.message, subscriptionId });
      throw new Error(`Failed to get subscription: ${error.message}`);
    }
  }

  /**
   * Update subscription (change plan)
   */
  async updateSubscription(subscriptionId: string, newPlanId: string): Promise<DodoSubscriptionResponse> {
    try {
      const plan = this.getPlanById(newPlanId);
      if (!plan) {
        throw new Error(`Invalid plan ID: ${newPlanId}`);
      }

      const response: AxiosResponse<DodoSubscriptionResponse> = await this.axios.post(`/subscriptions/${subscriptionId}/change-plan`, {
        product_id: plan.id
      });
      
      logger.info('DODO subscription plan changed', { subscriptionId, newPlanId });

      return response.data;
    } catch (error) {
      logger.error('Failed to update DODO subscription', { error: error.message, subscriptionId, newPlanId });
      throw new Error(`Failed to update subscription: ${error.message}`);
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string, cancelAtPeriodEnd: boolean = true): Promise<void> {
    try {
      await this.axios.patch(`/subscriptions/${subscriptionId}`, {
        cancel_at_next_billing_date: cancelAtPeriodEnd
      });
      
      logger.info('DODO subscription cancelled', { subscriptionId, cancelAtPeriodEnd });
    } catch (error) {
      logger.error('Failed to cancel DODO subscription', { error: error.message, subscriptionId });
      throw new Error(`Failed to cancel subscription: ${error.message}`);
    }
  }

  /**
   * Create on-demand charge
   */
  async createCharge(subscriptionId: string, amount: number, description: string): Promise<{ payment_id: string }> {
    try {
      const response: AxiosResponse<{ payment_id: string }> = await this.axios.post(`/subscriptions/${subscriptionId}/charges`, {
        amount,
        description
      });
      
      logger.info('DODO on-demand charge created', { subscriptionId, amount, paymentId: response.data.payment_id });

      return response.data;
    } catch (error) {
      logger.error('Failed to create DODO charge', { error: error.message, subscriptionId, amount });
      throw new Error(`Failed to create charge: ${error.message}`);
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      // DODO Payments webhook signature verification
      // This would depend on their specific signature algorithm
      // For now, we'll do a simple secret comparison
      return signature === this.config.webhookSecret;
    } catch (error) {
      logger.error('Failed to verify DODO webhook signature', { error: error.message });
      return false;
    }
  }

  /**
   * Get plan by ID
   */
  private getPlanById(planId: string) {
    return Object.values(SUBSCRIPTION_PLANS).find(plan => plan.id === planId);
  }

  /**
   * Get all available plans
   */
  static getAvailablePlans() {
    return SUBSCRIPTION_PLANS;
  }

  /**
   * Calculate usage-based pricing
   */
  static calculateUsage(plan: SubscriptionPlan, tokensUsed: number, requestsMade: number): {
    basePrice: number;
    overage: number;
    total: number;
  } {
    const planConfig = SUBSCRIPTION_PLANS[plan];
    let overage = 0;

    // Define usage limits
    const limits = {
      [SubscriptionPlan.WEEKLY]: {
        tokens: 500000,    // 500k tokens per week
        requests: 5000     // 5k requests per week
      },
      [SubscriptionPlan.MONTHLY]: {
        tokens: 2500000,   // 2.5M tokens per month
        requests: 25000    // 25k requests per month
      },
      [SubscriptionPlan.ENTERPRISE]: {
        tokens: 20000000,  // 20M tokens per month (high limit, not unlimited)
        requests: 200000   // 200k requests per month
      }
    };

    const limit = limits[plan];

    // Calculate overage for tokens (per 1000 tokens = $0.01)
    if (tokensUsed > limit.tokens) {
      const excessTokens = tokensUsed - limit.tokens;
      overage += Math.ceil(excessTokens / 1000) * 1; // $0.01 per 1000 tokens
    }

    // Calculate overage for requests (per request = $0.001)
    if (requestsMade > limit.requests) {
      const excessRequests = requestsMade - limit.requests;
      overage += excessRequests * 0.1; // $0.001 per request (in cents)
    }

    return {
      basePrice: planConfig.price,
      overage: Math.round(overage),
      total: planConfig.price + Math.round(overage)
    };
  }
}

// Export the service and types
export { DodoPaymentsService };
export type { DodoSubscriptionResponse, DodoSubscriptionListItem, DodoBillingAddress };

// Create singleton instance
let dodoPaymentsInstance: DodoPaymentsService | null = null;

export function getDodoPaymentsInstance(): DodoPaymentsService {
  if (!dodoPaymentsInstance) {
    const config: DodoPaymentsConfig = {
      apiKey: process.env.DODO_PAYMENTS_API_KEY!,
      baseUrl: process.env.DODO_API_BASE_URL || 'https://api.dodopayments.com',
      webhookSecret: process.env.DODO_WEBHOOK_SECRET!
    };

    if (!config.apiKey || !config.webhookSecret) {
      throw new Error('DODO Payments configuration missing. Please set DODO_PAYMENTS_API_KEY and DODO_WEBHOOK_SECRET environment variables.');
    }

    dodoPaymentsInstance = new DodoPaymentsService(config);
  }

  return dodoPaymentsInstance;
}