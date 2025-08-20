/**
 * DODO Payments Integration
 * Handles subscription creation, webhooks, and billing management for CLI users
 */

import { createHash, createHmac } from 'crypto';

interface DodoPaySubscription {
  business_id: string;
  external_customer_id: string;
  plan_id: string;
  success_url: string;
  cancel_url: string;
  metadata?: Record<string, any>;
}

interface DodoPayCheckoutSession {
  checkout_url: string;
  subscription_id: string;
  customer_id: string;
}

interface DodoPayWebhookEvent {
  event: string;
  data: {
    subscription_id: string;
    customer_id: string;
    plan_id: string;
    status: 'active' | 'cancelled' | 'past_due' | 'trialing';
    current_period_start: number;
    current_period_end: number;
    cancel_at_period_end: boolean;
  };
  timestamp: number;
}

// DODO Pay Plan IDs - these should match your DODO dashboard
const DODO_PLAN_IDS = {
  pro: 'plan_pro_20_monthly',
  team: 'plan_team_50_monthly', 
  enterprise: 'plan_enterprise_200_monthly'
};

export class DodoPayments {
  private apiKey: string;
  private baseUrl: string;
  private webhookSecret: string;

  constructor() {
    this.apiKey = process.env.DODO_PAYMENTS_API_KEY!;
    this.baseUrl = process.env.DODO_API_BASE_URL || 'https://api.dodopayments.com';
    this.webhookSecret = process.env.DODO_WEBHOOK_SECRET!;

    if (!this.apiKey) {
      throw new Error('DODO_PAYMENTS_API_KEY is required');
    }
  }

  /**
   * Create checkout session for CLI users
   */
  async createCheckoutSession(
    userId: string,
    planId: string,
    options: {
      source?: string;
      returnUrl?: string;
      cancelUrl?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<DodoPayCheckoutSession> {
    const {
      source = 'web',
      returnUrl = process.env.NEXT_PUBLIC_RETURN_URL,
      cancelUrl = process.env.NEXT_PUBLIC_CANCEL_URL,
      metadata = {}
    } = options;

    // Map internal plan IDs to DODO plan IDs
    const dodoplanId = DODO_PLAN_IDS[planId as keyof typeof DODO_PLAN_IDS];
    if (!dodoplanId) {
      throw new Error(`Invalid plan ID: ${planId}`);
    }

    const subscriptionData: DodoPaySubscription = {
      business_id: this.getBusinessId(),
      external_customer_id: userId,
      plan_id: dodoplanId,
      success_url: returnUrl!,
      cancel_url: cancelUrl!,
      metadata: {
        source: source,
        user_id: userId,
        internal_plan_id: planId,
        timestamp: Date.now(),
        ...metadata
      }
    };

    try {
      const response = await fetch(`${this.baseUrl}/v1/subscriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscriptionData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`DODO Pay API error: ${errorData.message || response.statusText}`);
      }

      const result = await response.json();
      
      return {
        checkout_url: result.checkout_url,
        subscription_id: result.subscription_id,
        customer_id: result.customer_id
      };

    } catch (error: any) {
      console.error('Failed to create DODO Pay checkout session:', error);
      throw new Error(`Payment processing failed: ${error.message}`);
    }
  }

  /**
   * Get subscription details from DODO
   */
  async getSubscription(subscriptionId: string) {
    try {
      const response = await fetch(`${this.baseUrl}/v1/subscriptions/${subscriptionId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch subscription: ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('Failed to fetch DODO subscription:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string, cancelAtPeriodEnd: boolean = true) {
    try {
      const response = await fetch(`${this.baseUrl}/v1/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cancel_at_period_end: cancelAtPeriodEnd
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to cancel subscription: ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('Failed to cancel DODO subscription:', error);
      throw error;
    }
  }

  /**
   * Get customer subscriptions
   */
  async getCustomerSubscriptions(customerId: string) {
    try {
      const response = await fetch(`${this.baseUrl}/v1/customers/${customerId}/subscriptions`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch customer subscriptions: ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('Failed to fetch customer subscriptions:', error);
      return { subscriptions: [] };
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      const expectedSignature = createHmac('sha256', this.webhookSecret)
        .update(payload)
        .digest('hex');
      
      const providedSignature = signature.replace('sha256=', '');
      
      return createHash('sha256')
        .update(expectedSignature)
        .digest('hex') === createHash('sha256')
        .update(providedSignature)
        .digest('hex');
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      return false;
    }
  }

  /**
   * Process webhook event
   */
  async processWebhookEvent(event: DodoPayWebhookEvent) {
    console.log('Processing DODO Pay webhook event:', event.event);

    switch (event.event) {
      case 'subscription.created':
        await this.handleSubscriptionCreated(event);
        break;
      case 'subscription.updated':
        await this.handleSubscriptionUpdated(event);
        break;
      case 'subscription.cancelled':
        await this.handleSubscriptionCancelled(event);
        break;
      case 'payment.succeeded':
        await this.handlePaymentSucceeded(event);
        break;
      case 'payment.failed':
        await this.handlePaymentFailed(event);
        break;
      default:
        console.log(`Unhandled webhook event: ${event.event}`);
    }
  }

  /**
   * Handle subscription created
   */
  private async handleSubscriptionCreated(event: DodoPayWebhookEvent) {
    // Update user subscription in database
    await this.updateUserSubscription(event.data.customer_id, {
      subscription_id: event.data.subscription_id,
      plan_id: this.mapDodoPlanToInternal(event.data.plan_id),
      status: event.data.status,
      current_period_start: new Date(event.data.current_period_start * 1000),
      current_period_end: new Date(event.data.current_period_end * 1000),
      cancel_at_period_end: event.data.cancel_at_period_end
    });

    console.log(`Subscription created for customer ${event.data.customer_id}`);
  }

  /**
   * Handle subscription updated
   */
  private async handleSubscriptionUpdated(event: DodoPayWebhookEvent) {
    await this.updateUserSubscription(event.data.customer_id, {
      subscription_id: event.data.subscription_id,
      plan_id: this.mapDodoPlanToInternal(event.data.plan_id),
      status: event.data.status,
      current_period_start: new Date(event.data.current_period_start * 1000),
      current_period_end: new Date(event.data.current_period_end * 1000),
      cancel_at_period_end: event.data.cancel_at_period_end
    });

    // Notify CLI users via session sync if they're connected
    await this.notifySessionUpdate(event.data.customer_id, 'subscription_updated');
    
    console.log(`Subscription updated for customer ${event.data.customer_id}`);
  }

  /**
   * Handle subscription cancelled
   */
  private async handleSubscriptionCancelled(event: DodoPayWebhookEvent) {
    await this.updateUserSubscription(event.data.customer_id, {
      subscription_id: event.data.subscription_id,
      status: 'cancelled',
      cancel_at_period_end: true
    });

    // Notify CLI users
    await this.notifySessionUpdate(event.data.customer_id, 'subscription_cancelled');
    
    console.log(`Subscription cancelled for customer ${event.data.customer_id}`);
  }

  /**
   * Handle payment succeeded
   */
  private async handlePaymentSucceeded(event: DodoPayWebhookEvent) {
    // Reset quota for the billing period
    await this.resetUserQuota(event.data.customer_id);
    
    // Notify CLI users about quota reset
    await this.notifySessionUpdate(event.data.customer_id, 'quota_reset');
    
    console.log(`Payment succeeded for customer ${event.data.customer_id}`);
  }

  /**
   * Handle payment failed
   */
  private async handlePaymentFailed(event: DodoPayWebhookEvent) {
    // Handle failed payment - could suspend service or send notifications
    console.log(`Payment failed for customer ${event.data.customer_id}`);
    
    // Notify user of payment failure
    await this.notifySessionUpdate(event.data.customer_id, 'payment_failed');
  }

  /**
   * Update user subscription in database
   */
  private async updateUserSubscription(customerId: string, subscriptionData: any) {
    // This would integrate with your database
    // For now, we'll use the backend API
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/billing/subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          user_id: customerId,
          ...subscriptionData
        })
      });
    } catch (error) {
      console.error('Failed to update user subscription in database:', error);
    }
  }

  /**
   * Reset user quota for new billing period
   */
  private async resetUserQuota(customerId: string) {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/billing/quota/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          user_id: customerId
        })
      });
    } catch (error) {
      console.error('Failed to reset user quota:', error);
    }
  }

  /**
   * Notify session sync about billing changes
   */
  private async notifySessionUpdate(userId: string, event: string) {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sessions/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          user_id: userId,
          event: event,
          timestamp: Date.now()
        })
      });
    } catch (error) {
      console.error('Failed to notify session update:', error);
    }
  }

  /**
   * Map DODO plan IDs to internal plan IDs
   */
  private mapDodoPlanToInternal(dodoplanId: string): string {
    const mapping = {
      'plan_pro_20_monthly': 'pro',
      'plan_team_50_monthly': 'team',
      'plan_enterprise_200_monthly': 'enterprise'
    };
    
    return mapping[dodoplanId as keyof typeof mapping] || 'free';
  }

  /**
   * Get business ID from environment or generate
   */
  private getBusinessId(): string {
    return process.env.DODO_BUSINESS_ID || 'recoder-cli-business';
  }

  /**
   * Create customer portal URL for subscription management
   */
  async createCustomerPortalUrl(customerId: string, returnUrl?: string) {
    try {
      const response = await fetch(`${this.baseUrl}/v1/customers/${customerId}/portal`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          return_url: returnUrl || process.env.NEXT_PUBLIC_WEB_URL
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to create portal URL: ${response.statusText}`);
      }

      const result = await response.json();
      return result.portal_url;
    } catch (error: any) {
      console.error('Failed to create customer portal URL:', error);
      throw error;
    }
  }

  /**
   * Get subscription tiers with DODO-specific information
   */
  getSubscriptionTiers() {
    return {
      free: {
        name: 'Free',
        price: 0,
        requests_per_month: 500,
        dodo_plan_id: null,
        features: ['Basic AI models', 'Community support', '500 requests/month']
      },
      pro: {
        name: 'Pro', 
        price: 2000, // $20.00
        requests_per_month: 5000,
        dodo_plan_id: DODO_PLAN_IDS.pro,
        features: ['All AI models', 'Priority support', '5,000 requests/month', 'Cost optimization']
      },
      team: {
        name: 'Team',
        price: 5000, // $50.00
        requests_per_month: 15000,
        dodo_plan_id: DODO_PLAN_IDS.team,
        features: ['Team collaboration', 'Advanced analytics', '15,000 requests/month', 'Custom models']
      },
      enterprise: {
        name: 'Enterprise',
        price: 20000, // $200.00
        requests_per_month: -1, // unlimited
        dodo_plan_id: DODO_PLAN_IDS.enterprise,
        features: ['Unlimited requests', 'Custom deployment', '24/7 support', 'SLA guarantees']
      }
    };
  }
}

// Export singleton instance
export const dodoPayments = new DodoPayments();