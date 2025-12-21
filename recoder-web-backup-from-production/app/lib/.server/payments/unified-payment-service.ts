/**
 * Unified Payment Service
 * Handles both Paddle and DodoPay integrations
 * Automatically selects best payment processor based on user location/preference
 */

import { PaddleClient, createPaddleClient, PADDLE_PLANS } from './paddle-integration';
import { DodoPayClient, createDodoPayClient, DODOPAY_PLANS } from './dodopay-integration';

export type PaymentProvider = 'paddle' | 'dodopay';

export interface PaymentConfig {
  preferredProvider?: PaymentProvider;
  userCountry?: string;
  userCurrency?: string;
}

/**
 * Unified Payment Service
 * Abstracts payment provider details
 */
export class UnifiedPaymentService {
  private paddleClient: PaddleClient;
  private dodoPayClient: DodoPayClient;

  constructor(env: any) {
    this.paddleClient = createPaddleClient(env);
    this.dodoPayClient = createDodoPayClient(env);
  }

  /**
   * Select best payment provider based on user context
   */
  selectProvider(config: PaymentConfig): PaymentProvider {
    // DodoPay is better for:
    // - Asian markets (China, Japan, Korea) - supports Alipay, WeChat Pay
    // - Lower fees for international transactions
    // - Better crypto payment support

    const asianCountries = ['CN', 'JP', 'KR', 'SG', 'HK', 'TW', 'MY', 'TH', 'VN'];

    if (config.preferredProvider) {
      return config.preferredProvider;
    }

    if (config.userCountry && asianCountries.includes(config.userCountry)) {
      return 'dodopay';
    }

    // Paddle is better for:
    // - US/EU markets
    // - VAT/tax handling
    // - Traditional payment methods
    return 'paddle';
  }

  /**
   * Create checkout session
   */
  async createCheckout(params: {
    userId: string;
    email: string;
    planId: string;
    successUrl: string;
    cancelUrl: string;
    config?: PaymentConfig;
  }): Promise<{ checkoutUrl: string; provider: PaymentProvider }> {
    const provider = this.selectProvider(params.config || {});

    console.log(`Creating checkout with ${provider} for plan ${params.planId}`);

    if (provider === 'paddle') {
      const session = await this.paddleClient.createCheckoutSession({
        userId: params.userId,
        email: params.email,
        planId: PADDLE_PLANS[params.planId]?.planId || params.planId,
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl
      });

      return {
        checkoutUrl: session.checkoutUrl,
        provider: 'paddle'
      };
    } else {
      const session = await this.dodoPayClient.createPaymentSession({
        userId: params.userId,
        email: params.email,
        planId: params.planId,
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl
      });

      return {
        checkoutUrl: session.paymentUrl,
        provider: 'dodopay'
      };
    }
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId: string, provider: PaymentProvider): Promise<any> {
    if (provider === 'paddle') {
      return this.paddleClient.getSubscription(subscriptionId);
    } else {
      return this.dodoPayClient.getSubscription(subscriptionId);
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string, provider: PaymentProvider, immediate: boolean = false): Promise<void> {
    if (provider === 'paddle') {
      await this.paddleClient.cancelSubscription(subscriptionId);
    } else {
      await this.dodoPayClient.cancelSubscription(subscriptionId, immediate);
    }
  }

  /**
   * Update subscription plan
   */
  async updateSubscription(subscriptionId: string, provider: PaymentProvider, newPlanId: string): Promise<void> {
    if (provider === 'paddle') {
      const paddlePlanId = PADDLE_PLANS[newPlanId]?.planId || newPlanId;
      await this.paddleClient.updateSubscription(subscriptionId, paddlePlanId);
    } else {
      const dodoPlanId = DODOPAY_PLANS[newPlanId]?.planId || newPlanId;
      await this.dodoPayClient.updateSubscription(subscriptionId, dodoPlanId);
    }
  }

  /**
   * Handle webhook (auto-detect provider)
   */
  async handleWebhook(
    provider: PaymentProvider,
    payload: string,
    signature: string,
    timestamp?: string
  ): Promise<void> {
    if (provider === 'paddle') {
      const isValid = this.paddleClient.verifyWebhook(payload, signature);
      if (!isValid) {
        throw new Error('Invalid Paddle webhook signature');
      }

      const event = JSON.parse(payload);
      await this.paddleClient.handleWebhook(event);
    } else {
      if (!timestamp) {
        throw new Error('Timestamp required for DodoPay webhooks');
      }

      const isValid = this.dodoPayClient.verifyWebhook(payload, signature, timestamp);
      if (!isValid) {
        throw new Error('Invalid DodoPay webhook signature');
      }

      const event = JSON.parse(payload);
      await this.dodoPayClient.handleWebhook(event);
    }
  }

  /**
   * Create customer portal session
   */
  async createPortalSession(
    customerId: string,
    provider: PaymentProvider,
    returnUrl: string
  ): Promise<string> {
    if (provider === 'paddle') {
      // Paddle has built-in customer portal
      return `https://pay.paddle.com/customer/${customerId}`;
    } else {
      return this.dodoPayClient.createPortalSession(customerId, returnUrl);
    }
  }

  /**
   * Get pricing for all plans
   */
  getPricing(): Array<{
    id: string;
    name: string;
    price: number;
    currency: string;
    features: string[];
    popular?: boolean;
  }> {
    return [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        currency: 'USD',
        features: [
          '5 AI generations/month',
          'Basic templates',
          'Community support',
          'Public projects'
        ]
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 20,
        currency: 'USD',
        popular: true,
        features: [
          '100 AI generations/month',
          'All templates & components',
          'Priority support',
          'Private projects',
          'Custom deployments',
          'Advanced AI models',
          'Code export'
        ]
      },
      {
        id: 'team',
        name: 'Team',
        price: 50,
        currency: 'USD',
        features: [
          '500 AI generations/month',
          'Everything in Pro',
          'Team collaboration (5 seats)',
          'Private template library',
          'Shared projects',
          'SSO integration',
          'Dedicated support'
        ]
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: 200,
        currency: 'USD',
        features: [
          '2000 AI generations/month',
          'Everything in Team',
          'Unlimited seats',
          'Custom integrations',
          'On-premise deployment',
          'SLA guarantee',
          'Custom AI model training',
          'White-label option'
        ]
      }
    ];
  }
}

/**
 * Initialize unified payment service
 */
export function createPaymentService(env: any): UnifiedPaymentService {
  return new UnifiedPaymentService(env);
}
