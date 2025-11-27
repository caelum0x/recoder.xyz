/**
 * Dodo Payments Service
 * Real payment processing integration with Subscriptions API
 *
 * Subscription States:
 * - active: Subscription is active and will renew automatically
 * - on_hold: Paused due to failed payment, requires payment method update
 * - cancelled: Subscription is cancelled and will not renew
 * - expired: Subscription has reached its end date
 * - pending: Subscription is being created or processed
 */

import DodoPayments from 'dodopayments';
import { prisma } from '../prisma';
import crypto from 'crypto';

// Initialize Dodo Payments client
const dodoClient = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
});

export class DodoPaymentsService {
  /**
   * Create a checkout session for subscription
   */
  static async createCheckoutSession(
    userId: string,
    productId: string,
    trialDays?: number,
    returnUrl?: string
  ) {
    try {
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const session = await dodoClient.checkoutSessions.create({
        product_cart: [{ product_id: productId, quantity: 1 }],
        subscription_data: trialDays ? { trial_period_days: trialDays } : undefined,
        customer: {
          email: user.email,
          name: user.name,
        },
        return_url: returnUrl || `${process.env.NEXT_PUBLIC_APP_URL}/billing/success`,
      });

      return {
        sessionId: session.session_id,
        checkoutUrl: session.checkout_url,
      };
    } catch (error: any) {
      console.error('Dodo Payments checkout error:', error);
      throw new Error(`Failed to create checkout: ${error.message}`);
    }
  }

  /**
   * Handle subscription webhooks from Dodo Payments
   *
   * Events:
   * - subscription.active: Subscription activated
   * - subscription.on_hold: Payment failed, needs payment method update
   * - subscription.cancelled: Subscription cancelled
   * - subscription.renewed: Billing period renewed
   * - subscription.plan_changed: Plan/quantity changed
   * - payment.succeeded: Payment completed
   * - payment.failed: Payment failed
   */
  static async handleWebhook(payload: any) {
    const eventType = payload.type;
    const data = payload.data;

    try {
      switch (eventType) {
        case 'subscription.active':
          await this.handleSubscriptionActive(data);
          break;

        case 'subscription.on_hold':
          await this.handleSubscriptionOnHold(data);
          break;

        case 'subscription.cancelled':
          await this.handleSubscriptionCancelled(data);
          break;

        case 'subscription.renewed':
          await this.handleSubscriptionRenewed(data);
          break;

        case 'subscription.plan_changed':
          await this.handleSubscriptionPlanChanged(data);
          break;

        case 'payment.succeeded':
          await this.handlePaymentSucceeded(data);
          break;

        case 'payment.failed':
          await this.handlePaymentFailed(data);
          break;

        default:
          console.log(`Unhandled webhook event: ${eventType}`);
      }

      return { success: true };
    } catch (error: any) {
      console.error('Webhook handling error:', error);
      throw error;
    }
  }

  /**
   * Handle subscription.active webhook
   */
  private static async handleSubscriptionActive(data: any) {
    const { subscription_id, customer_id, plan_id, status } = data;

    // Find user by customer_id (email)
    const user = await prisma.users.findFirst({
      where: { email: customer_id },
    });

    if (!user) {
      console.error(`User not found for customer: ${customer_id}`);
      return;
    }

    // Create or update subscription
    await prisma.subscriptions.upsert({
      where: { userId: user.id },
      update: {
        status: 'active',
        providerId: subscription_id,
        planId: plan_id,
        updatedAt: new Date(),
      },
      create: {
        id: crypto.randomUUID(),
        userId: user.id,
        status: 'active',
        provider: 'dodo',
        providerId: subscription_id,
        planId: plan_id,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      },
    });

    // Update user subscription status
    await prisma.users.update({
      where: { id: user.id },
      data: {
        subscriptionPlan: this.mapPlanIdToPlanName(plan_id),
        subscriptionStatus: 'active',
      },
    });

    console.log(`✅ Subscription activated for user ${user.id}`);
  }

  /**
   * Handle subscription.on_hold webhook
   */
  private static async handleSubscriptionOnHold(data: any) {
    const { subscription_id } = data;

    const subscription = await prisma.subscriptions.findFirst({
      where: { providerId: subscription_id },
    });

    if (!subscription) {
      console.error(`Subscription not found: ${subscription_id}`);
      return;
    }

    await prisma.subscriptions.update({
      where: { id: subscription.id },
      data: {
        status: 'on_hold',
        updatedAt: new Date(),
      },
    });

    await prisma.users.update({
      where: { id: subscription.userId },
      data: { subscriptionStatus: 'on_hold' },
    });

    console.log(`⚠️ Subscription on hold: ${subscription_id}`);
  }

  /**
   * Handle subscription.cancelled webhook
   */
  private static async handleSubscriptionCancelled(data: any) {
    const { subscription_id } = data;

    const subscription = await prisma.subscriptions.findFirst({
      where: { providerId: subscription_id },
    });

    if (!subscription) return;

    await prisma.subscriptions.update({
      where: { id: subscription.id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await prisma.users.update({
      where: { id: subscription.userId },
      data: { subscriptionStatus: 'cancelled' },
    });

    console.log(`❌ Subscription cancelled: ${subscription_id}`);
  }

  /**
   * Handle subscription.plan_changed webhook
   */
  private static async handleSubscriptionPlanChanged(data: any) {
    const { subscription_id, product_id, quantity } = data;

    const subscription = await prisma.subscriptions.findFirst({
      where: { providerId: subscription_id },
    });

    if (!subscription) return;

    await prisma.subscriptions.update({
      where: { id: subscription.id },
      data: {
        planId: product_id,
        updatedAt: new Date(),
      },
    });

    await prisma.users.update({
      where: { id: subscription.userId },
      data: { subscriptionPlan: this.mapPlanIdToPlanName(product_id) },
    });

    console.log(`🔄 Plan changed: ${subscription_id} → ${product_id}`);
  }

  /**
   * Handle subscription.renewed webhook
   */
  private static async handleSubscriptionRenewed(data: any) {
    const { subscription_id, current_period_start, current_period_end } = data;

    const subscription = await prisma.subscriptions.findFirst({
      where: { providerId: subscription_id },
    });

    if (!subscription) return;

    await prisma.subscriptions.update({
      where: { id: subscription.id },
      data: {
        currentPeriodStart: new Date(current_period_start * 1000),
        currentPeriodEnd: new Date(current_period_end * 1000),
        updatedAt: new Date(),
      },
    });

    console.log(`🔄 Subscription renewed: ${subscription_id}`);
  }

  /**
   * Handle payment.succeeded webhook
   */
  private static async handlePaymentSucceeded(data: any) {
    const { payment_id, subscription_id, amount, currency } = data;

    const subscription = await prisma.subscriptions.findFirst({
      where: { providerId: subscription_id },
    });

    if (!subscription) return;

    // Create invoice record
    await prisma.invoices.create({
      data: {
        id: crypto.randomUUID(),
        userId: subscription.userId,
        subscriptionId: subscription.id,
        amount: amount / 100, // Convert from cents
        currency: currency || 'USD',
        status: 'paid',
        description: 'Subscription payment',
        paidAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`💰 Payment succeeded: ${payment_id}`);
  }

  /**
   * Handle payment.failed webhook
   */
  private static async handlePaymentFailed(data: any) {
    const { payment_id, subscription_id, amount } = data;

    const subscription = await prisma.subscriptions.findFirst({
      where: { providerId: subscription_id },
    });

    if (!subscription) return;

    // Create failed invoice record
    await prisma.invoices.create({
      data: {
        id: crypto.randomUUID(),
        userId: subscription.userId,
        subscriptionId: subscription.id,
        amount: amount / 100,
        currency: 'USD',
        status: 'failed',
        description: 'Failed subscription payment',
        updatedAt: new Date(),
      },
    });

    console.log(`❌ Payment failed: ${payment_id}`);
  }

  /**
   * Update payment method for on_hold subscription
   */
  static async updatePaymentMethod(subscriptionId: string, paymentMethodType: 'new' | 'existing', options?: {
    paymentMethodId?: string;
    returnUrl?: string;
  }) {
    try {
      const subscription = await prisma.subscriptions.findUnique({
        where: { id: subscriptionId },
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const response = await dodoClient.subscriptions.updatePaymentMethod(
        subscription.providerId!,
        {
          type: paymentMethodType,
          payment_method_id: options?.paymentMethodId,
          return_url: options?.returnUrl || `${process.env.NEXT_PUBLIC_APP_URL}/billing/success`,
        }
      );

      return response;
    } catch (error: any) {
      console.error('Update payment method error:', error);
      throw error;
    }
  }

  /**
   * Change subscription plan with proration
   *
   * Proration Modes:
   * - prorated_immediately: Fair billing based on remaining time
   * - difference_immediately: Charge difference (upgrade) or credit (downgrade)
   * - full_immediately: Charge full new amount, reset billing cycle
   *
   * @param subscriptionId Internal subscription ID
   * @param newProductId Dodo product ID (e.g., 'prod_pro')
   * @param prorationType How to handle billing for the change
   * @param quantity Optional quantity (default: 1)
   * @param addons Optional add-ons to include
   */
  static async changePlan(
    subscriptionId: string,
    newProductId: string,
    prorationType: 'prorated_immediately' | 'difference_immediately' | 'full_immediately',
    quantity: number = 1,
    addons?: Array<{ addon_id: string; quantity: number }>
  ) {
    try {
      const subscription = await prisma.subscriptions.findUnique({
        where: { id: subscriptionId },
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Call Dodo Payments API (use direct fetch until SDK is updated)
      const response = await fetch(
        `https://api.dodopayments.com/subscriptions/${subscription.providerId}/change-plan`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.DODO_PAYMENTS_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            product_id: newProductId,
            quantity,
            proration_billing_mode: prorationType,
            ...(addons && { addons }),
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to change plan');
      }

      const result = await response.json();

      // Database will be updated via subscription.plan_changed webhook

      return result;
    } catch (error: any) {
      console.error('Change plan error:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   *
   * @param subscriptionId Internal subscription ID
   * @param immediate If true, cancels immediately. If false, cancels at period end.
   */
  static async cancelSubscription(subscriptionId: string, cancelAtPeriodEnd: boolean = true) {
    try {
      const subscription = await prisma.subscriptions.findUnique({
        where: { id: subscriptionId },
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Update subscription with cancel_at_period_end flag
      const response = await fetch(
        `https://api.dodopayments.com/subscriptions/${subscription.providerId}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${process.env.DODO_PAYMENTS_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cancel_at_period_end: cancelAtPeriodEnd,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to cancel subscription');
      }

      // Update local database
      if (cancelAtPeriodEnd) {
        // Will cancel at end of current period
        await prisma.subscriptions.update({
          where: { id: subscriptionId },
          data: {
            cancelAtPeriodEnd: true,
            updatedAt: new Date(),
          },
        });
      } else {
        // Immediate cancellation
        await prisma.subscriptions.update({
          where: { id: subscriptionId },
          data: {
            status: 'cancelled',
            cancelledAt: new Date(),
            updatedAt: new Date(),
          },
        });

        await prisma.users.update({
          where: { id: subscription.userId },
          data: { subscriptionStatus: 'cancelled' },
        });
      }

      return { success: true };
    } catch (error: any) {
      console.error('Cancel subscription error:', error);
      throw error;
    }
  }

  /**
   * Create an on-demand subscription
   * Authorizes payment method but doesn't charge until you call createCharge
   */
  static async createOnDemandSubscription(
    userId: string,
    productId: string
  ) {
    try {
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const response = await fetch('https://api.dodopayments.com/subscriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.DODO_PAYMENTS_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer_id: user.email,
          product_id: productId,
          on_demand: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create subscription');
      }

      const dodoSubscription = await response.json();

      // Store in database
      await prisma.subscriptions.upsert({
        where: { userId },
        update: {
          providerId: dodoSubscription.subscription_id,
          planId: productId,
          status: 'active',
          updatedAt: new Date(),
        },
        create: {
          id: crypto.randomUUID(),
          userId,
          providerId: dodoSubscription.subscription_id,
          planId: productId,
          provider: 'dodo',
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          updatedAt: new Date(),
        },
      });

      return dodoSubscription;
    } catch (error: any) {
      console.error('Create on-demand subscription error:', error);
      throw error;
    }
  }

  /**
   * Charge an on-demand subscription
   * Use this to charge custom amounts for on-demand subscriptions
   */
  static async chargeOnDemandSubscription(
    subscriptionId: string,
    amount: number,
    currency: string = 'USD',
    description?: string
  ) {
    try {
      const subscription = await prisma.subscriptions.findUnique({
        where: { id: subscriptionId },
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const response = await fetch(
        `https://api.dodopayments.com/subscriptions/${subscription.providerId}/charge`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.DODO_PAYMENTS_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount,
            currency,
            description,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to charge subscription');
      }

      return await response.json();
    } catch (error: any) {
      console.error('Charge on-demand subscription error:', error);
      throw error;
    }
  }

  /**
   * Map Dodo Payments plan ID to internal plan name
   */
  private static mapPlanIdToPlanName(planId: string): string {
    const planMap: Record<string, string> = {
      prod_weekly: 'weekly',
      prod_monthly: 'monthly',
      prod_pro: 'pro',
      prod_enterprise: 'enterprise',
    };

    return planMap[planId] || 'free';
  }
}

export const dodoPaymentsService = new DodoPaymentsService();
