/**
 * Billing Integration Service
 * Manages subscription tiers, payment processing, and billing enforcement
 */
import { Logger } from '@recoder/shared';
import { backendClient } from './backend-client';

export interface SubscriptionTier {
  name: 'free' | 'pro' | 'team' | 'enterprise';
  price: number; // Monthly price in cents
  requests_per_month: number;
  models: string[];
  features: string[];
  support_level: 'community' | 'email' | 'priority' | 'dedicated';
}

export interface BillingInfo {
  user_id: string;
  subscription: SubscriptionTier;
  current_usage: number;
  billing_period_start: Date;
  billing_period_end: Date;
  payment_status: 'active' | 'pending' | 'failed' | 'cancelled';
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
}

export class BillingIntegration {
  private logger = new Logger();
  
  // Subscription tier definitions
  private static readonly TIERS: Record<string, SubscriptionTier> = {
    free: {
      name: 'free',
      price: 0,
      requests_per_month: 500,
      models: ['gpt-3.5-turbo', 'claude-3-haiku'],
      features: ['basic_generation', 'web_search'],
      support_level: 'community'
    },
    pro: {
      name: 'pro',
      price: 2000, // $20.00
      requests_per_month: 5000,
      models: ['gpt-4o', 'claude-3.5-sonnet', 'gemini-pro'],
      features: ['advanced_generation', 'code_review', 'priority_queue'],
      support_level: 'email'
    },
    team: {
      name: 'team',
      price: 5000, // $50.00
      requests_per_month: 15000,
      models: ['gpt-4o', 'claude-3.5-sonnet', 'gemini-pro', 'o1-preview'],
      features: ['team_collaboration', 'shared_projects', 'analytics'],
      support_level: 'priority'
    },
    enterprise: {
      name: 'enterprise',
      price: 20000, // $200.00
      requests_per_month: -1, // Unlimited
      models: ['all'],
      features: ['custom_models', 'sso', 'audit_logs', 'dedicated_support'],
      support_level: 'dedicated'
    }
  };

  /**
   * Get user's current billing information
   */
  async getUserBilling(userId: string): Promise<BillingInfo | null> {
    try {
      // Use the internal axios client from backendClient
      const response = await (backendClient as any).client.get(`/api/billing/user/${userId}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch user billing info', { userId, error });
      return null;
    }
  }

  /**
   * Check if user can make a request based on quota
   */
  async canMakeRequest(userId: string, modelName: string): Promise<{
    allowed: boolean;
    reason?: string;
    upgrade_required?: boolean;
  }> {
    try {
      const billing = await this.getUserBilling(userId);
      
      if (!billing) {
        // Default to free tier for new users
        return { allowed: true };
      }

      // Check payment status
      if (billing.payment_status !== 'active' && billing.subscription.name !== 'free') {
        return {
          allowed: false,
          reason: 'Payment required - subscription inactive',
          upgrade_required: false
        };
      }

      // Check model access
      const tier = BillingIntegration.TIERS[billing.subscription.name];
      if (!tier.models.includes('all') && !tier.models.includes(modelName)) {
        return {
          allowed: false,
          reason: `Model ${modelName} not included in ${tier.name} plan`,
          upgrade_required: true
        };
      }

      // Check usage quota
      if (tier.requests_per_month > 0 && billing.current_usage >= tier.requests_per_month) {
        return {
          allowed: false,
          reason: `Monthly quota of ${tier.requests_per_month} requests exceeded`,
          upgrade_required: true
        };
      }

      return { allowed: true };
    } catch (error) {
      this.logger.error('Failed to check request permission', { userId, modelName, error });
      // Fail open for availability
      return { allowed: true };
    }
  }

  /**
   * Record a request usage
   */
  async recordUsage(userId: string, modelName: string, cost: number): Promise<void> {
    try {
      await (backendClient as any).client.post('/api/billing/usage', {
        user_id: userId,
        model_name: modelName,
        cost_cents: Math.round(cost * 100),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Failed to record usage', { userId, modelName, cost, error });
    }
  }

  /**
   * Get available subscription tiers
   */
  getSubscriptionTiers(): Record<string, SubscriptionTier> {
    return { ...BillingIntegration.TIERS };
  }

  /**
   * Get available subscription tiers (static method)
   */
  static getSubscriptionTiers(): Record<string, SubscriptionTier> {
    return { ...BillingIntegration.TIERS };
  }

  /**
   * Calculate cost savings for a user
   */
  async getCostSavings(userId: string): Promise<{
    current_plan_cost: number;
    api_cost_equivalent: number;
    monthly_savings: number;
    savings_percentage: number;
  }> {
    try {
      const response = await (backendClient as any).client.get(`/api/billing/savings/${userId}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to calculate cost savings', { userId, error });
      return {
        current_plan_cost: 0,
        api_cost_equivalent: 0,
        monthly_savings: 0,
        savings_percentage: 0
      };
    }
  }

  /**
   * Create Stripe checkout session for subscription upgrade
   */
  async createCheckoutSession(userId: string, tier: string): Promise<{
    checkout_url: string;
    session_id: string;
  }> {
    try {
      const response = await (backendClient as any).client.post('/api/billing/checkout', {
        user_id: userId,
        tier: tier
      });
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create checkout session', { userId, tier, error });
      throw new Error('Payment system temporarily unavailable');
    }
  }

  /**
   * Handle successful subscription upgrade
   */
  async handleSubscriptionSuccess(userId: string, stripeSessionId: string): Promise<void> {
    try {
      await (backendClient as any).client.post('/api/billing/subscription-success', {
        user_id: userId,
        stripe_session_id: stripeSessionId
      });
      this.logger.info('Subscription upgrade successful', { userId, stripeSessionId });
    } catch (error) {
      this.logger.error('Failed to handle subscription success', { userId, stripeSessionId, error });
    }
  }

  /**
   * Get usage analytics for user
   */
  async getUsageAnalytics(userId: string): Promise<{
    current_period_usage: number;
    daily_average: number;
    most_used_models: Array<{ model: string; count: number; cost: number }>;
    cost_breakdown: Array<{ date: string; cost: number }>;
  }> {
    try {
      const response = await (backendClient as any).client.get(`/api/billing/analytics/${userId}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get usage analytics', { userId, error });
      return {
        current_period_usage: 0,
        daily_average: 0,
        most_used_models: [],
        cost_breakdown: []
      };
    }
  }
}

export const billingIntegration = new BillingIntegration();