/**
 * DodoPay Payment Integration
 * For users in China and regions where Paddle is not available
 */

interface DodoPayConfig {
  apiKey: string;
  apiSecret: string;
  merchantId: string;
  webhookSecret: string;
  environment: 'sandbox' | 'production';
}

interface CreateCheckoutOptions {
  planId: string;
  email: string;
  userId: string;
  amount: number;
  currency: string;
  returnUrl: string;
}

export class DodoPayClient {
  private config: DodoPayConfig;
  private baseUrl: string;

  constructor(config: DodoPayConfig) {
    this.config = config;
    this.baseUrl = config.environment === 'production'
      ? 'https://api.dodopayments.com/v1'
      : 'https://api-sandbox.dodopayments.com/v1';
  }

  /**
   * Create checkout session
   */
  async createCheckout(options: CreateCheckoutOptions) {
    try {
      const response = await fetch(`${this.baseUrl}/checkout/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          merchant_id: this.config.merchantId,
          amount: options.amount,
          currency: options.currency,
          customer_email: options.email,
          metadata: {
            user_id: options.userId,
            plan_id: options.planId,
          },
          success_url: options.returnUrl,
          cancel_url: options.returnUrl,
          payment_methods: ['alipay', 'wechat', 'unionpay'],
        }),
      });

      if (!response.ok) {
        const error = await response.json() as { message?: string };
        throw new Error(`DodoPay API error: ${error.message}`);
      }

      const data = await response.json() as {
        checkout_url: string;
        session_id: string;
      };

      return {
        checkoutUrl: data.checkout_url,
        sessionId: data.session_id,
      };
    } catch (error) {
      console.error('DodoPay checkout creation failed:', error);
      throw error;
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
      console.error('DodoPay webhook verification failed:', error);
      return false;
    }
  }
}

/**
 * Initialize DodoPay client
 */
export function getDodoPayClient(env: any): DodoPayClient {
  if (!env.DODOPAY_API_KEY) {
    throw new Error('DODOPAY_API_KEY not configured');
  }

  if (!env.DODOPAY_API_SECRET) {
    throw new Error('DODOPAY_API_SECRET not configured');
  }

  if (!env.DODOPAY_MERCHANT_ID) {
    throw new Error('DODOPAY_MERCHANT_ID not configured');
  }

  if (!env.DODOPAY_WEBHOOK_SECRET) {
    throw new Error('DODOPAY_WEBHOOK_SECRET not configured');
  }

  return new DodoPayClient({
    apiKey: env.DODOPAY_API_KEY,
    apiSecret: env.DODOPAY_API_SECRET,
    merchantId: env.DODOPAY_MERCHANT_ID,
    webhookSecret: env.DODOPAY_WEBHOOK_SECRET,
    environment: env.DODOPAY_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
  });
}
