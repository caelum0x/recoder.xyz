/**
 * DODO Payments Integration Service
 * Mock implementation for DODO Payments API
 */

import { logger } from '../utils/logger';
import * as crypto from 'crypto';

export interface DodoCustomer {
  email: string;
  name: string;
}

export interface DodoProduct {
  id: string;
  name: string;
  price: number;
  currency: string;
  type: 'subscription' | 'one_time' | 'usage';
}

export interface DodoCheckoutRequest {
  customer: DodoCustomer;
  product: DodoProduct;
  metadata?: Record<string, any>;
  successUrl?: string;
  cancelUrl?: string;
}

export interface DodoCheckoutResponse {
  success: boolean;
  checkoutId?: string;
  checkoutUrl?: string;
  error?: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: 'weekly' | 'monthly' | 'yearly';
  intervalCount: number;
  features: string[];
}

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlan> = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'USD',
    interval: 'monthly',
    intervalCount: 1,
    features: ['100 AI requests/month', '5 projects', 'Basic templates', 'Community support']
  },
  weekly: {
    id: 'weekly',
    name: 'Weekly',
    price: 1000, // $10 in cents
    currency: 'USD',
    interval: 'weekly',
    intervalCount: 1,
    features: ['1,000 AI requests/week', '10 projects', 'All templates', 'Email support']
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 2000, // $20 in cents
    currency: 'USD',
    interval: 'monthly',
    intervalCount: 1,
    features: ['5,000 AI requests/month', '25 projects', 'All templates', 'Priority support']
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    price: 10000, // $100 in cents
    currency: 'USD',
    interval: 'monthly',
    intervalCount: 1,
    features: ['25,000 AI requests/month', 'Unlimited projects', 'Advanced features', 'Premium support', 'API access']
  },
  business: {
    id: 'business',
    name: 'Business',
    price: 20000, // $200 in cents
    currency: 'USD',
    interval: 'monthly',
    intervalCount: 1,
    features: ['100,000 AI requests/month', 'Team collaboration', 'Advanced analytics', 'Dedicated support', 'Custom integrations']
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 0, // Usage-based pricing
    currency: 'USD',
    interval: 'monthly',
    intervalCount: 1,
    features: ['Usage-based pricing', 'Unlimited everything', 'Custom deployment', 'SLA guarantees', 'White-label options']
  }
};

export interface DodoCancelResponse {
  success: boolean;
  error?: string;
}

class DodoPaymentsService {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = process.env.DODO_PAYMENTS_URL || 'https://api.dodopayments.com/v1';
    this.apiKey = process.env.DODO_API_KEY || 'mock-api-key';
  }

  /**
   * Create a checkout session with real DODO Payments API
   */
  async createCheckout(request: DodoCheckoutRequest): Promise<DodoCheckoutResponse> {
    try {
      logger.info('Creating DODO checkout session', {
        customerEmail: request.customer.email,
        productId: request.product.id,
        amount: request.product.price
      });

      // Prepare DODO API request
      const dodoRequest = {
        customer: {
          email: request.customer.email,
          name: request.customer.name
        },
        product: {
          name: request.product.name,
          price: request.product.price,
          currency: request.product.currency || 'USD',
          type: request.product.type || 'subscription'
        },
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        metadata: request.metadata || {}
      };

      // Make actual API call to DODO Payments
      const response = await fetch(`${this.baseUrl}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'Recoder-Backend/1.0'
        },
        body: JSON.stringify(dodoRequest)
      });

      if (!response.ok) {
        const errorData = await response.text();
        logger.error('DODO API error', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        
        // Log error and fail fast in all environments
        logger.error('DODO API is unavailable - payment system disabled', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        
        return {
          success: false,
          error: `DODO API error: ${response.status} ${response.statusText}`
        };
      }

      const data = await response.json() as { id?: string; checkout_url?: string };
      
      logger.info('DODO checkout created successfully', {
        checkoutId: data.id,
        checkoutUrl: data.checkout_url
      });

      return {
        success: true,
        checkoutId: data.id,
        checkoutUrl: data.checkout_url
      };

    } catch (error) {
      logger.error('DODO checkout creation failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        request 
      });

      // Log critical error - payment system must be reliable
      logger.error('Critical payment system failure - DODO API unreachable', { error });

      return {
        success: false,
        error: 'Failed to create checkout session'
      };
    }
  }

  /**
   * Cancel a subscription with real DODO Payments API
   */
  async cancelSubscription(subscriptionId: string, cancelImmediately: boolean = false): Promise<DodoCancelResponse> {
    try {
      logger.info('Cancelling DODO subscription', {
        subscriptionId,
        cancelImmediately
      });

      // Make actual API call to DODO Payments
      const response = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'Recoder-Backend/1.0'
        },
        body: JSON.stringify({
          cancel_immediately: cancelImmediately
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        logger.error('DODO subscription cancellation API error', {
          status: response.status,
          error: errorData
        });
        return {
          success: false,
          error: `API error: ${response.status}`
        };
      }

      const data = await response.json();
      logger.info('DODO subscription cancelled successfully', { subscriptionId });

      return {
        success: true
      };

    } catch (error) {
      logger.error('DODO subscription cancellation failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        subscriptionId 
      });

      return {
        success: false,
        error: 'Failed to cancel subscription'
      };
    }
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId: string): Promise<any> {
    try {
      logger.info('Retrieving DODO subscription', { subscriptionId });

      const response = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'Recoder-Backend/1.0'
        }
      });

      if (!response.ok) {
        const errorData = await response.text();
        logger.error('DODO subscription retrieval API error', {
          status: response.status,
          error: errorData
        });
        return null;
      }

      const data = await response.json();
      logger.info('DODO subscription retrieved successfully', { subscriptionId });
      
      return data;

    } catch (error) {
      logger.error('DODO subscription retrieval failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        subscriptionId 
      });

      return null;
    }
  }

  /**
   * Get payment details
   */
  async getPayment(paymentId: string): Promise<any> {
    try {
      logger.info('Retrieving DODO payment', { paymentId });

      const response = await fetch(`${this.baseUrl}/payments/${paymentId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'Recoder-Backend/1.0'
        }
      });

      if (!response.ok) {
        const errorData = await response.text();
        logger.error('DODO payment retrieval API error', {
          status: response.status,
          error: errorData
        });
        return null;
      }

      const data = await response.json();
      logger.info('DODO payment retrieved successfully', { paymentId });
      
      return data;

    } catch (error) {
      logger.error('DODO payment retrieval failed', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        paymentId 
      });

      return null;
    }
  }

  /**
   * Create a subscription
   */
  async createSubscription(data: any): Promise<any> {
    try {
      logger.info('Creating DODO subscription', { planId: data.planId });

      const response = await fetch(`${this.baseUrl}/subscriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'Recoder-Backend/1.0'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.text();
        logger.error('DODO subscription creation API error', {
          status: response.status,
          error: errorData
        });
        return null;
      }

      const result = await response.json() as { id?: string };
      logger.info('DODO subscription created successfully', { subscriptionId: result.id });
      
      return result;
    } catch (error) {
      logger.error('DODO subscription creation failed', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * List subscriptions
   */
  async listSubscriptions(customerId?: string): Promise<any> {
    try {
      const url = customerId 
        ? `${this.baseUrl}/subscriptions?customer=${customerId}`
        : `${this.baseUrl}/subscriptions`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'Recoder-Backend/1.0'
        }
      });

      if (!response.ok) {
        return { data: [] };
      }

      return await response.json();
    } catch (error) {
      logger.error('DODO subscription listing failed', { error });
      return { data: [] };
    }
  }

  /**
   * Update subscription
   */
  async updateSubscription(subscriptionId: string, data: any): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'Recoder-Backend/1.0'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      logger.error('DODO subscription update failed', { error });
      return null;
    }
  }

  /**
   * Create a charge
   */
  async createCharge(data: any): Promise<any> {
    try {
      logger.info('Creating DODO charge', { amount: data.amount });

      const response = await fetch(`${this.baseUrl}/charges`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'Recoder-Backend/1.0'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.text();
        logger.error('DODO charge creation API error', {
          status: response.status,
          error: errorData
        });
        return null;
      }

      const result = await response.json() as { id?: string };
      logger.info('DODO charge created successfully', { chargeId: result.id });
      
      return result;
    } catch (error) {
      logger.error('DODO charge creation failed', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Calculate usage for billing
   */
  static calculateUsage(planId: string, tokens?: number, requests?: number): number {
    // Simple usage calculation logic
    return tokens || requests || 0;
  }

  // Get rate limits based on subscription plan
  static getRateLimits(planId: string): { requests: number; tokens: number } {
    const limits: Record<string, { requests: number; tokens: number }> = {
      free: { requests: 100, tokens: 10000 },
      weekly: { requests: 1000, tokens: 100000 },
      starter: { requests: 5000, tokens: 500000 },
      professional: { requests: 25000, tokens: 2500000 },
      business: { requests: 100000, tokens: 10000000 },
      enterprise: { requests: -1, tokens: -1 } // Unlimited (usage-based)
    };
    
    return limits[planId] || limits.free;
  }
}

// Export singleton instance
export const dodoPayments = new DodoPaymentsService();

// Export class for direct usage
export { DodoPaymentsService };

// Export getter function for compatibility
export const getDodoPaymentsInstance = () => dodoPayments;