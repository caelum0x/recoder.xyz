/**
 * Dodo Pay Integration
 * Alternative payment processor for regions where Stripe/Paddle aren't available
 */

export interface DodoConfig {
  apiKey: string;
  environment: 'test' | 'live';
}

export interface DodoPaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  metadata?: Record<string, any>;
}

export class DodoPayService {
  private apiKey: string;
  private environment: 'test' | 'live';
  private baseUrl: string;

  constructor(config: DodoConfig) {
    this.apiKey = config.apiKey;
    this.environment = config.environment;
    this.baseUrl = config.environment === 'live' 
      ? 'https://api.dodopay.com/v1'
      : 'https://api-test.dodopay.com/v1';
  }

  /**
   * Create a payment intent
   */
  async createPaymentIntent(params: {
    amount: number;
    currency: string;
    userId: string;
    plan: string;
    email: string;
  }): Promise<DodoPaymentIntent> {
    const response = await fetch(`${this.baseUrl}/payment-intents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: params.amount,
        currency: params.currency,
        metadata: {
          userId: params.userId,
          plan: params.plan,
          email: params.email
        }
      })
    });

    if (!response.ok) {
      throw new Error('Failed to create payment intent');
    }

    return response.json();
  }

  /**
   * Confirm payment
   */
  async confirmPayment(paymentIntentId: string): Promise<DodoPaymentIntent> {
    const response = await fetch(`${this.baseUrl}/payment-intents/${paymentIntentId}/confirm`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to confirm payment');
    }

    return response.json();
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentIntentId: string): Promise<DodoPaymentIntent> {
    const response = await fetch(`${this.baseUrl}/payment-intents/${paymentIntentId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to get payment status');
    }

    return response.json();
  }

  /**
   * Create subscription
   */
  async createSubscription(params: {
    userId: string;
    email: string;
    plan: string;
    amount: number;
    interval: 'week' | 'month';
  }) {
    const response = await fetch(`${this.baseUrl}/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      throw new Error('Failed to create subscription');
    }

    return response.json();
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string) {
    const response = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to cancel subscription');
    }

    return response.json();
  }
}

// Singleton instance
let dodoService: DodoPayService | null = null;

export function getDodoPayService(): DodoPayService {
  if (!dodoService) {
    dodoService = new DodoPayService({
      apiKey: process.env.DODO_API_KEY || '',
      environment: process.env.NODE_ENV === 'production' ? 'live' : 'test'
    });
  }
  return dodoService;
}
