/**
 * Paddle Payment Integration
 * Handles subscriptions and one-time payments
 */

import { logger } from '@/lib/logger';

export interface PaddleConfig {
  vendorId: string;
  environment: 'sandbox' | 'production';
  publicKey?: string;
}

export interface PaddleProduct {
  productId: string;
  name: string;
  price: number;
  currency: string;
  recurring: boolean;
  interval?: 'week' | 'month' | 'year';
}

export const PADDLE_PRODUCTS = {
  weekly: {
    productId: process.env.NEXT_PUBLIC_PADDLE_PRODUCT_WEEKLY || 'prod_weekly_placeholder',
    name: 'Recoder Weekly',
    price: 10,
    currency: 'USD',
    recurring: true,
    interval: 'week' as const
  },
  monthly: {
    productId: process.env.NEXT_PUBLIC_PADDLE_PRODUCT_MONTHLY || 'prod_monthly_placeholder',
    name: 'Recoder Monthly',
    price: 20,
    currency: 'USD',
    recurring: true,
    interval: 'month' as const
  },
  monthly_yearly: {
    productId: process.env.NEXT_PUBLIC_PADDLE_PRODUCT_MONTHLY_YEARLY || 'prod_monthly_yearly_placeholder',
    name: 'Recoder Monthly (Billed Yearly)',
    price: 216, // $18/month * 12 months
    currency: 'USD',
    recurring: true,
    interval: 'year' as const
  },
  pro: {
    productId: process.env.NEXT_PUBLIC_PADDLE_PRODUCT_PRO || 'prod_pro_placeholder',
    name: 'Recoder Pro',
    price: 100,
    currency: 'USD',
    recurring: true,
    interval: 'month' as const
  },
  pro_yearly: {
    productId: process.env.NEXT_PUBLIC_PADDLE_PRODUCT_PRO_YEARLY || 'prod_pro_yearly_placeholder',
    name: 'Recoder Pro (Billed Yearly)',
    price: 1080, // $90/month * 12 months
    currency: 'USD',
    recurring: true,
    interval: 'year' as const
  }
};

export class PaddleService {
  private vendorId: string;
  private environment: 'sandbox' | 'production';

  constructor(config: PaddleConfig) {
    this.vendorId = config.vendorId;
    this.environment = config.environment;
  }

  /**
   * Initialize Paddle.js on the client
   */
  initializePaddle() {
    if (typeof window === 'undefined') return;

    // Load Paddle.js script
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/paddle.js';
    script.async = true;
    script.onload = () => {
      if (window.Paddle) {
        window.Paddle.Environment.set(this.environment);
        window.Paddle.Setup({ vendor: parseInt(this.vendorId) });
      }
    };
    document.head.appendChild(script);
  }

  /**
   * Open Paddle checkout for subscription
   */
  openCheckout(productId: string, email?: string, userId?: string) {
    if (typeof window === 'undefined' || !window.Paddle) {
      logger.error('Paddle not initialized');
      return;
    }

    window.Paddle.Checkout.open({
      product: productId,
      email: email,
      passthrough: JSON.stringify({ userId }),
      successCallback: (data: any) => {
        logger.info('Payment successful', { checkoutId: data?.checkout?.id });
        // Redirect to success page
        window.location.href = `/dashboard?payment=success&checkout_id=${data.checkout.id}`;
      },
      closeCallback: () => {
        logger.info('Checkout closed');
      }
    });
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId: string) {
    // This would be called from your backend
    const response = await fetch(`/api/paddle/subscription/${subscriptionId}`);
    return response.json();
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string) {
    const response = await fetch(`/api/paddle/subscription/${subscriptionId}/cancel`, {
      method: 'POST'
    });
    return response.json();
  }

  /**
   * Update subscription
   */
  async updateSubscription(subscriptionId: string, newProductId: string) {
    const response = await fetch(`/api/paddle/subscription/${subscriptionId}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: newProductId })
    });
    return response.json();
  }
}

// Singleton instance
let paddleService: PaddleService | null = null;

export function getPaddleService(): PaddleService {
  if (!paddleService) {
    paddleService = new PaddleService({
      vendorId: process.env.NEXT_PUBLIC_PADDLE_VENDOR_ID || '',
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
    });
  }
  return paddleService;
}

// Type definitions for Paddle
declare global {
  interface Window {
    Paddle: any;
  }
}
