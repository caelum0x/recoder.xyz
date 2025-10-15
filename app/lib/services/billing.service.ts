/**
 * BillingService
 * Complete billing and subscription management service
 */

import { PrismaClient } from '@prisma/client';
import { sendSubscriptionConfirmationEmail } from '../email';

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
      const subscription = await prisma.subscription.upsert({
        where: { userId },
        update: {
          plan,
          status: 'active',
          provider,
          providerId,
          currentPeriodStart,
          currentPeriodEnd,
          amount,
          interval,
        },
        create: {
          userId,
          plan,
          status: 'active',
          provider,
          providerId,
          currentPeriodStart,
          currentPeriodEnd,
          amount,
          currency: 'USD',
          interval,
        },
      });

      // Update user subscription plan
      await prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionPlan: plan,
          subscriptionStatus: 'active',
        },
      });

      // Update user quota based on new plan
      await this.updateUserQuota(userId, plan);

      // Get user for email
      const user = await prisma.user.findUnique({
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
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'subscription_created',
          metadata: { plan, provider, amount },
          success: true,
        },
      });

      return { success: true, subscription };
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
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      return { success: true, subscription };
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
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      if (!subscription) {
        throw new Error('No active subscription found');
      }

      // Calculate new amount based on plan
      const newAmount = this.getPlanAmount(newPlan);

      // Update subscription
      const updated = await prisma.subscription.update({
        where: { userId },
        data: {
          plan: newPlan,
          amount: newAmount,
        },
      });

      // Update user plan
      await prisma.user.update({
        where: { id: userId },
        data: { subscriptionPlan: newPlan },
      });

      // Update quota
      await this.updateUserQuota(userId, newPlan);

      // Log update
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'subscription_updated',
          metadata: { oldPlan: subscription.plan, newPlan },
          success: true,
        },
      });

      return { success: true, subscription: updated };
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
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      if (!subscription) {
        throw new Error('No active subscription found');
      }

      if (immediately) {
        // Cancel immediately
        await prisma.subscription.update({
          where: { userId },
          data: {
            status: 'cancelled',
            cancelledAt: new Date(),
          },
        });

        await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionPlan: 'free',
            subscriptionStatus: 'cancelled',
          },
        });

        // Update to free tier quota
        await this.updateUserQuota(userId, 'free');
      } else {
        // Cancel at end of period
        await prisma.subscription.update({
          where: { userId },
          data: {
            cancelAt: subscription.currentPeriodEnd,
            status: 'active', // Still active until period ends
          },
        });
      }

      // Log cancellation
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'subscription_cancelled',
          metadata: { immediately },
          success: true,
        },
      });

      return {
        success: true,
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
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      if (!subscription) {
        throw new Error('No subscription found');
      }

      await prisma.subscription.update({
        where: { userId },
        data: {
          status: 'active',
          cancelAt: null,
        },
      });

      // Log resume
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'subscription_resumed',
          success: true,
        },
      });

      return { success: true, message: 'Subscription resumed successfully' };
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
        success: true,
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

      return { success: true, processed: true };
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
      const invoices = await prisma.invoice.findMany({
        where: { userId },
        orderBy: { invoiceDate: 'desc' },
        take: limit,
      });

      return { success: true, invoices };
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
      const invoice = await prisma.invoice.findFirst({
        where: {
          id: invoiceId,
          userId,
        },
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      return { success: true, invoice };
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
      const invoiceNumber = `INV-${Date.now()}`;

      const invoice = await prisma.invoice.create({
        data: {
          userId,
          invoiceNumber,
          status: 'open',
          subtotal: amount,
          total: amount,
          amountDue: amount,
          currency: 'USD',
          dueDate,
        },
      });

      return { success: true, invoice };
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

      const paymentMethod = await prisma.paymentMethod.create({
        data: {
          userId,
          type: 'card',
          provider,
          providerId: `pm_${Date.now()}`,
          last4: '4242',
          brand: 'visa',
          expiryMonth: 12,
          expiryYear: 2025,
          isDefault: true,
        },
      });

      return { success: true, paymentMethod };
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
      const methods = await prisma.paymentMethod.findMany({
        where: { userId, isActive: true },
        orderBy: { createdAt: 'desc' },
      });

      return { success: true, methods };
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
      await prisma.paymentMethod.updateMany({
        where: { userId },
        data: { isDefault: false },
      });

      // Set new default
      await prisma.paymentMethod.update({
        where: { id: methodId },
        data: { isDefault: true },
      });

      return { success: true, message: 'Default payment method updated' };
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
      await prisma.paymentMethod.update({
        where: { id: methodId },
        data: { isActive: false },
      });

      return { success: true, message: 'Payment method removed' };
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
      const subscription = await prisma.subscription.findUnique({
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

    await prisma.userQuota.upsert({
      where: { userId },
      update: {
        sessionsPerDay: quotaConfig.sessionsPerDay,
        tokensPerSession: quotaConfig.tokensPerSession,
        monthlyLimit: quotaConfig.monthlyLimit,
      },
      create: {
        userId,
        sessionsPerDay: quotaConfig.sessionsPerDay,
        tokensPerSession: quotaConfig.tokensPerSession,
        monthlyLimit: quotaConfig.monthlyLimit,
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  private getQuotaConfig(plan: string) {
    const configs: Record<string, any> = {
      free: { sessionsPerDay: 6, tokensPerSession: 10000, monthlyLimit: null },
      weekly: { sessionsPerDay: 10, tokensPerSession: 30000, monthlyLimit: 5000 },
      monthly: { sessionsPerDay: 15, tokensPerSession: 50000, monthlyLimit: 10000 },
      pro: { sessionsPerDay: 20, tokensPerSession: 100000, monthlyLimit: 50000 },
      enterprise: { sessionsPerDay: 100, tokensPerSession: 500000, monthlyLimit: 500000 },
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
