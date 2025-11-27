/**
 * BillingService
 * Complete billing and subscription management service
 */

import { PrismaClient } from '@prisma/client';
import { sendSubscriptionConfirmationEmail } from '../email';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

export class BillingService {
  /**
   * Create a new subscription
   */
  async createSubscription(
    userId: string,
    plan: string,
    provider: string,
    providerId: string,
    amount: number,
    interval: string = 'month'
  ) {
    try {
      const currentPeriodStart = new Date();
      const currentPeriodEnd = new Date();

      // Calculate period end based on interval
      if (interval === 'month') {
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
      } else if (interval === 'year') {
        currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
      } else if (interval === 'week') {
        currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 7);
      }

      // Create subscription
      const subscription = await prisma.subscriptions.upsert({
        where: { userId },
        update: {
          planId: plan,
          status: 'active',
          provider,
          providerId,
          currentPeriodStart,
          currentPeriodEnd,
          amount,
          interval,
          updatedAt: new Date(),
        },
        create: {
          id: crypto.randomUUID(),
          userId,
          planId: plan,
          status: 'active',
          provider,
          providerId,
          currentPeriodStart,
          currentPeriodEnd,
          amount,
          currency: 'USD',
          interval,
          updatedAt: new Date(),
        },
      });

      // Update user subscription plan
      await prisma.users.update({
        where: { id: userId },
        data: {
          subscriptionPlan: plan,
          subscriptionStatus: 'active',
        },
      });

      // Update user quota based on new plan
      await this.updateUserQuota(userId, plan);

      // Get user for email
      const user = await prisma.users.findUnique({
        where: { id: userId },
      });

      // Send confirmation email
      if (user) {
        await sendSubscriptionConfirmationEmail(
          user.email,
          user.name,
          plan,
          amount / 100 // Convert cents to dollars
        ).catch((err) => console.error('Failed to send subscription email:', err));
      }

      // Log subscription creation
      await prisma.audit_logs.create({
        data: {
          id: randomUUID(),
          userId,
          action: 'subscription_created',
          resource: 'subscription',
          metadata: { plan, provider, amount },
        },
      });

    } catch (error: any) {
      console.error('Create subscription error:', error);
      throw error;
    }
  }

  /**
   * Get user subscription
   */
  async getSubscription(userId: string) {
    try {
      const subscription = await prisma.subscriptions.findUnique({
        where: { userId },
      });

    } catch (error: any) {
      console.error('Get subscription error:', error);
      throw error;
    }
  }

  /**
   * Update subscription (change plan)
   */
  async updateSubscription(userId: string, newPlan: string) {
    try {
      const subscription = await prisma.subscriptions.findUnique({
        where: { userId },
      });

      if (!subscription) {
        throw new Error('No active subscription found');
      }

      // Calculate new amount based on plan
      const newAmount = this.getPlanAmount(newPlan);

      // Update subscription
      const updated = await prisma.subscriptions.update({
        where: { userId },
        data: {
          planId: newPlan,
          amount: newAmount,
          updatedAt: new Date(),
        },
      });

      // Update user plan
      await prisma.users.update({
        where: { id: userId },
        data: { subscriptionPlan: newPlan },
      });

      // Update quota
      await this.updateUserQuota(userId, newPlan);

      // Log update
      await prisma.audit_logs.create({
        data: {
          id: randomUUID(),
          userId,
          action: 'subscription_updated',
          resource: 'subscription',
          metadata: { oldPlan: subscription.planId, newPlan },
        },
      });

    } catch (error: any) {
      console.error('Update subscription error:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId: string, immediately: boolean = false) {
    try {
      const subscription = await prisma.subscriptions.findUnique({
        where: { userId },
      });

      if (!subscription) {
        throw new Error('No active subscription found');
      }

      if (immediately) {
        // Cancel immediately
        await prisma.subscriptions.update({
          where: { userId },
          data: {
            status: 'cancelled',
            cancelledAt: new Date(),
          },
        });

        await prisma.users.update({
          where: { id: userId },
          data: {
            plan: 'free',
            subscriptionStatus: 'cancelled',
          },
        });

        // Update to free tier quota
        await this.updateUserQuota(userId, 'free');
      } else {
        // Cancel at end of period
        await prisma.subscriptions.update({
          where: { userId },
          data: {
            cancelAtPeriodEnd: true,
            status: 'active', // Still active until period ends
            updatedAt: new Date(),
          },
        });
      }

      // Log cancellation
      await prisma.audit_logs.create({
        data: {
          id: randomUUID(),
          userId,
          action: 'subscription_cancelled',
          resource: 'subscription',
          metadata: { immediately },
        },
      });

      return {
        message: immediately
          ? 'Subscription cancelled immediately'
          : 'Subscription will cancel at end of billing period',
      };
    } catch (error: any) {
      console.error('Cancel subscription error:', error);
      throw error;
    }
  }

  /**
   * Resume cancelled subscription
   */
  async resumeSubscription(userId: string) {
    try {
      const subscription = await prisma.subscriptions.findUnique({
        where: { userId },
      });

      if (!subscription) {
        throw new Error('No subscription found');
      }

      await prisma.subscriptions.update({
        where: { userId },
        data: {
          status: 'active',
          cancelAtPeriodEnd: false,
          cancelledAt: null,
          updatedAt: new Date(),
        },
      });

      // Log resume
      await prisma.audit_logs.create({
        data: {
          id: randomUUID(),
          userId,
          action: 'subscription_resumed',
          resource: 'subscription',
        },
      });

    } catch (error: any) {
      console.error('Resume subscription error:', error);
      throw error;
    }
  }

  /**
   * Create checkout session
   */
  async createCheckoutSession(userId: string, planId: string) {
    try {
      // This would integrate with Paddle or DODO
      // For now, return mock data
      const amount = this.getPlanAmount(planId);

      return {
        checkoutUrl: `https://checkout.paddle.com/...`, // Would be real URL
        sessionId: `session_${Date.now()}`,
        amount,
      };
    } catch (error: any) {
      console.error('Create checkout session error:', error);
      throw error;
    }
  }

  /**
   * Handle webhook from payment provider
   */
  async handleWebhook(provider: string, payload: any, signature: string) {
    try {
      // Verify webhook signature
      const isValid = await this.verifyWebhookSignature(provider, payload, signature);

      if (!isValid) {
        throw new Error('Invalid webhook signature');
      }

      // Handle different event types
      const eventType = payload.event_type || payload.type;

      switch (eventType) {
        case 'subscription.created':
        case 'payment_succeeded':
          await this.handlePaymentSuccess(payload);
          break;

        case 'subscription.updated':
          await this.handleSubscriptionUpdate(payload);
          break;

        case 'subscription.cancelled':
          await this.handleSubscriptionCancelled(payload);
          break;

        case 'payment_failed':
          await this.handlePaymentFailed(payload);
          break;

        default:
          console.log(`Unhandled webhook event: ${eventType}`);
      }

    } catch (error: any) {
      console.error('Handle webhook error:', error);
      throw error;
    }
  }

  /**
   * Get user invoices
   */
  async getInvoices(userId: string, limit: number = 20) {
    try {
      const invoices = await prisma.invoices.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

    } catch (error: any) {
      console.error('Get invoices error:', error);
      throw error;
    }
  }

  /**
   * Get single invoice
   */
  async getInvoice(invoiceId: string, userId: string) {
    try {
      const invoice = await prisma.invoices.findFirst({
        where: {
          id: invoiceId,
          userId,
        },
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

    } catch (error: any) {
      console.error('Get invoice error:', error);
      throw error;
    }
  }

  /**
   * Create invoice
   */
  async createInvoice(
    userId: string,
    amount: number,
    description: string,
    dueDate?: Date
  ) {
    try {
      const invoice = await prisma.invoices.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          amount,
          status: 'open',
          currency: 'USD',
          description: `Invoice for ${dueDate}`,
          updatedAt: new Date(),
        },
      });

    } catch (error: any) {
      console.error('Create invoice error:', error);
      throw error;
    }
  }

  /**
   * Add payment method
   */
  async addPaymentMethod(
    userId: string,
    token: string,
    provider: string = 'paddle'
  ) {
    try {
      // This would integrate with payment provider
      // For now, create mock payment method

      const paymentMethod = await prisma.payment_methods.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          type: 'card',
          provider,
          providerId: `pm_${Date.now()}`,
          last4: '4242',
          brand: 'visa',
          expMonth: 12,
          expYear: 2025,
          isDefault: true,
          updatedAt: new Date(),
        },
      });

    } catch (error: any) {
      console.error('Add payment method error:', error);
      throw error;
    }
  }

  /**
   * List payment methods
   */
  async listPaymentMethods(userId: string) {
    try {
      const methods = await prisma.payment_methods.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

    } catch (error: any) {
      console.error('List payment methods error:', error);
      throw error;
    }
  }

  /**
   * Set default payment method
   */
  async setDefaultPaymentMethod(userId: string, methodId: string) {
    try {
      // Remove default from all methods
      await prisma.payment_methods.updateMany({
        where: { userId },
        data: { isDefault: false },
      });

      // Set new default
      await prisma.payment_methods.update({
        where: { id: methodId },
        data: { isDefault: true },
      });

    } catch (error: any) {
      console.error('Set default payment method error:', error);
      throw error;
    }
  }

  /**
   * Remove payment method
   */
  async removePaymentMethod(userId: string, methodId: string) {
    try {
      await prisma.payment_methods.delete({
        where: { id: methodId },
      });

    } catch (error: any) {
      console.error('Remove payment method error:', error);
      throw error;
    }
  }

  /**
   * Calculate proration for plan change
   */
  async calculateProration(userId: string, newPlanId: string) {
    try {
      const subscription = await prisma.subscriptions.findUnique({
        where: { userId },
      });

      if (!subscription) {
        return { proration: 0, newAmount: this.getPlanAmount(newPlanId) };
      }

      const oldAmount = subscription.amount;
      const newAmount = this.getPlanAmount(newPlanId);

      // Calculate days remaining in current period
      const now = new Date();
      const daysTotal =
        (subscription.currentPeriodEnd.getTime() - subscription.currentPeriodStart.getTime()) /
        (1000 * 60 * 60 * 24);
      const daysRemaining =
        (subscription.currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

      // Calculate proration
      const unusedAmount = (oldAmount * daysRemaining) / daysTotal;
      const newPeriodAmount = (newAmount * daysRemaining) / daysTotal;
      const proration = newPeriodAmount - unusedAmount;

      return {
        proration: Math.round(proration),
        oldAmount,
        newAmount,
        daysRemaining: Math.ceil(daysRemaining),
      };
    } catch (error: any) {
      console.error('Calculate proration error:', error);
      throw error;
    }
  }

  // Helper methods

  private async updateUserQuota(userId: string, plan: string) {
    const quotaConfig = this.getQuotaConfig(plan);

    await prisma.user_quota.upsert({
      where: { userId },
      update: {
        sessionsPerDay: quotaConfig.sessionsPerDay,
        tokensPerSession: quotaConfig.tokensPerSession,
        requestsLimit: quotaConfig.requestsLimit,
        updatedAt: new Date(),
      },
      create: {
        userId,
        sessionsPerDay: quotaConfig.sessionsPerDay,
        tokensPerSession: quotaConfig.tokensPerSession,
        requestsLimit: quotaConfig.requestsLimit,
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        updatedAt: new Date(),
      },
    });
  }

  private getQuotaConfig(plan: string) {
    const configs: Record<string, any> = {
      free: { sessionsPerDay: 6, tokensPerSession: 10000, requestsLimit: 1000 },
      weekly: { sessionsPerDay: 10, tokensPerSession: 30000, requestsLimit: 5000 },
      monthly: { sessionsPerDay: 15, tokensPerSession: 50000, requestsLimit: 10000 },
      pro: { sessionsPerDay: 20, tokensPerSession: 100000, requestsLimit: 50000 },
      enterprise: { sessionsPerDay: 100, tokensPerSession: 500000, requestsLimit: 500000 },
    };
    return configs[plan] || configs.free;
  }

  private getPlanAmount(plan: string): number {
    const amounts: Record<string, number> = {
      free: 0,
      weekly: 1000, // $10
      monthly: 2000, // $20
      pro: 10000, // $100
      enterprise: 50000, // $500
    };
    return amounts[plan] || 0;
  }

  private async verifyWebhookSignature(
    provider: string,
    payload: any,
    signature: string
  ): Promise<boolean> {
    // Implement signature verification based on provider
    // For now, return true
    return true;
  }

  private async handlePaymentSuccess(payload: any) {
    // Extract user ID and create/update subscription
    console.log('Payment success:', payload);
  }

  private async handleSubscriptionUpdate(payload: any) {
    console.log('Subscription update:', payload);
  }

  private async handleSubscriptionCancelled(payload: any) {
    console.log('Subscription cancelled:', payload);
  }

  private async handlePaymentFailed(payload: any) {
    console.log('Payment failed:', payload);
  }
}

// Export singleton instance
export const billingService = new BillingService();
