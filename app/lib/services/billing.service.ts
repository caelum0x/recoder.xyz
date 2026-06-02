/**
 * BillingService
 * Complete billing and subscription management service
 */

import { prisma } from '@/lib/prisma';
import { sendSubscriptionConfirmationEmail } from '../email';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import { logger } from '@/lib/logger';
import { buildCommercialQuotaCreateData, getCommercialQuotaConfig } from '@/lib/commercial-quota';

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
        ).catch((err) => logger.error('Failed to send subscription email', { error: String(err) }));
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

      return subscription;
    } catch (error) {
      logger.error('Create subscription error', { error: String(error) });
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

      return subscription;
    } catch (error) {
      logger.error('Get subscription error', { error: String(error) });
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

      return updated;
    } catch (error) {
      logger.error('Update subscription error', { error: String(error) });
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
    } catch (error) {
      logger.error('Cancel subscription error', { error: String(error) });
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

      return { message: 'Subscription resumed' };
    } catch (error) {
      logger.error('Resume subscription error', { error: String(error) });
      throw error;
    }
  }

  /**
   * Create checkout session
   *
   * Uses the payment provider abstraction to support Polar.sh, DodoPayments,
   * or any future provider. When no provider is configured, returns a
   * "free mode" response so the caller can handle it gracefully.
   */
  async createCheckoutSession(userId: string, planId: string) {
    try {
      const amount = this.getPlanAmount(planId);

      // Use the unified payment provider abstraction
      const { getPaymentProvider } = await import('@/lib/services/payment-providers');
      const provider = getPaymentProvider();

      if (provider) {
        const user = await prisma.users.findUnique({
          where: { id: userId },
          select: { email: true, name: true },
        });

        if (!user) {
          throw new Error('User not found');
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz';
        const session = await provider.createCheckoutSession({
          planId,
          userId,
          userEmail: user.email,
          userName: user.name || undefined,
          successUrl: `${appUrl}/billing/success`,
          cancelUrl: `${appUrl}/billing/cancel`,
        });

        return {
          sessionId: session.sessionId,
          checkoutUrl: session.checkoutUrl,
          provider: session.provider,
          amount,
          providerConfigured: true,
        };
      }

      // Fallback: try legacy DodoPayments direct integration
      if (process.env.DODO_PAYMENTS_API_KEY) {
        const productIdMap: Record<string, string | undefined> = {
          pro: process.env.DODO_PRODUCT_PRO,
          enterprise: process.env.DODO_PRODUCT_ENTERPRISE,
          monthly: process.env.DODO_PRODUCT_MONTHLY,
          weekly: process.env.DODO_PRODUCT_WEEKLY,
        };

        const productId = productIdMap[planId];
        if (!productId) {
          logger.warn('No DODO product ID mapped for plan', { planId });
          return {
            providerConfigured: false,
            error: `No product ID configured for plan: ${planId}`,
            amount,
          };
        }

        try {
          const { DodoPaymentsService } = await import('@/lib/services/dodopayments.service');
          const session = await DodoPaymentsService.createCheckoutSession(
            userId,
            productId,
          );
          return {
            ...session,
            amount,
            providerConfigured: true,
          };
        } catch (dodoError) {
          logger.error('DodoPayments checkout failed', { error: String(dodoError) });
          throw dodoError;
        }
      }

      // No payment provider configured — free mode
      return {
        providerConfigured: false,
        error: 'No payment provider configured. Set PAYMENT_PROVIDER and provider API key to enable checkout.',
        amount,
      };
    } catch (error) {
      logger.error('Create checkout session error', { error: String(error) });
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
          logger.warn('Unhandled webhook event', { eventType });
      }

    } catch (error) {
      logger.error('Handle webhook error', { error: String(error) });
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

      return invoices;
    } catch (error) {
      logger.error('Get invoices error', { error: String(error) });
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

      return invoice;
    } catch (error) {
      logger.error('Get invoice error', { error: String(error) });
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

      return invoice;
    } catch (error) {
      logger.error('Create invoice error', { error: String(error) });
      throw error;
    }
  }

  /**
   * Add payment method
   */
  async addPaymentMethod(
    userId: string,
    token: string,
    provider: string = 'paddle',
    cardDetails?: { last4?: string; brand?: string; expMonth?: number; expYear?: number }
  ) {
    try {
      // Unset existing default payment methods for this user
      await prisma.payment_methods.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });

      const paymentMethod = await prisma.payment_methods.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          type: 'card',
          provider,
          providerId: token,
          last4: cardDetails?.last4 || 'xxxx',
          brand: cardDetails?.brand || 'unknown',
          expMonth: cardDetails?.expMonth || 0,
          expYear: cardDetails?.expYear || 0,
          isDefault: true,
          updatedAt: new Date(),
        },
      });

      return paymentMethod;
    } catch (error) {
      logger.error('Add payment method error', { error: String(error) });
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

      return methods;
    } catch (error) {
      logger.error('List payment methods error', { error: String(error) });
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

      return { success: true };
    } catch (error) {
      logger.error('Set default payment method error', { error: String(error) });
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

      return { success: true };
    } catch (error) {
      logger.error('Remove payment method error', { error: String(error) });
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
    } catch (error) {
      logger.error('Calculate proration error', { error: String(error) });
      throw error;
    }
  }

  // Helper methods

  private async updateUserQuota(userId: string, plan: string) {
    const quotaConfig = getCommercialQuotaConfig(plan);

    await prisma.user_quota.upsert({
      where: { userId },
      update: {
        sessionsPerDay: quotaConfig.sessionsPerDay,
        tokensPerSession: quotaConfig.tokensPerSession,
        requestsLimit: quotaConfig.requestsLimit,
        updatedAt: new Date(),
      },
      create: buildCommercialQuotaCreateData(userId, plan, 'month'),
    });
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
    try {
      // When called from the unified webhook endpoint, signature is
      // already verified by the payment provider abstraction.
      if (signature === '__already_verified__') return true;

      const rawPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);

      switch (provider) {
        case 'dodo': {
          const secret = process.env.DODO_WEBHOOK_SECRET;
          if (!secret) {
            logger.error('DODO_WEBHOOK_SECRET not configured');
            return false;
          }
          const expected = createHmac('sha256', secret).update(rawPayload).digest('hex');
          return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
        }

        case 'polar': {
          const secret = process.env.POLAR_WEBHOOK_SECRET;
          if (!secret) {
            logger.error('POLAR_WEBHOOK_SECRET not configured');
            return false;
          }
          // Polar uses "sha256=<hex>" format
          const [algo, sig] = signature.split('=');
          if (algo !== 'sha256' || !sig) return false;
          const expected = createHmac('sha256', secret).update(rawPayload).digest('hex');
          return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
        }

        case 'paddle': {
          const secret = process.env.PADDLE_WEBHOOK_SECRET;
          if (!secret) {
            logger.error('PADDLE_WEBHOOK_SECRET not configured');
            return false;
          }
          const expected = createHmac('sha256', secret).update(rawPayload).digest('hex');
          return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
        }

        default:
          logger.warn('Unknown billing provider for webhook verification', { provider });
          return false;
      }
    } catch (error) {
      logger.error('Webhook signature verification failed', { provider, error: String(error) });
      return false;
    }
  }

  private extractUserId(payload: any): string | undefined {
    return payload.data?.customer_id || payload.customer_id || payload.meta?.custom_data?.user_id;
  }

  private async handlePaymentSuccess(payload: any) {
    logger.info('Payment success', { payload: JSON.stringify(payload) });

    const userId = this.extractUserId(payload);
    if (!userId) {
      logger.warn('handlePaymentSuccess: no userId found in payload');
      return;
    }

    const plan = payload.data?.plan_id || payload.plan_id || 'pro';
    const provider = payload.data?.provider || 'unknown';
    const providerId = payload.data?.subscription_id || payload.subscription_id || `sub_${Date.now()}`;
    const amount = payload.data?.amount || this.getPlanAmount(plan);
    const interval = payload.data?.interval || 'month';

    await this.createSubscription(userId, plan, provider, providerId, amount, interval);

    const description = `Payment for ${plan} plan`;
    await this.createInvoice(userId, amount, description);
  }

  private async handleSubscriptionUpdate(payload: any) {
    logger.info('Subscription update', { payload: JSON.stringify(payload) });

    const userId = this.extractUserId(payload);
    if (!userId) {
      logger.warn('handleSubscriptionUpdate: no userId found in payload');
      return;
    }

    const newPlanId = payload.data?.plan_id || payload.plan_id;
    if (!newPlanId) {
      logger.warn('handleSubscriptionUpdate: no plan_id found in payload');
      return;
    }

    await this.updateSubscription(userId, newPlanId);
  }

  private async handleSubscriptionCancelled(payload: any) {
    logger.info('Subscription cancelled', { payload: JSON.stringify(payload) });

    const userId = this.extractUserId(payload);
    if (!userId) {
      logger.warn('handleSubscriptionCancelled: no userId found in payload');
      return;
    }

    await this.cancelSubscription(userId, true);
  }

  private async handlePaymentFailed(payload: any) {
    logger.error('Payment failed', { payload: JSON.stringify(payload) });

    const userId = this.extractUserId(payload);
    if (!userId) {
      logger.warn('handlePaymentFailed: no userId found in payload');
      return;
    }

    // Update subscription status to past_due
    await prisma.subscriptions.updateMany({
      where: { userId, status: 'active' },
      data: {
        status: 'past_due',
        updatedAt: new Date(),
      },
    });

    // Update user subscription status
    await prisma.users.update({
      where: { id: userId },
      data: { subscriptionStatus: 'past_due' },
    });

    // Create audit log entry
    await prisma.audit_logs.create({
      data: {
        id: randomUUID(),
        userId,
        action: 'payment_failed',
        resource: 'subscription',
        metadata: {
          reason: payload.data?.failure_reason || payload.failure_reason || 'unknown',
        },
      },
    });
  }
}

// Export singleton instance
export const billingService = new BillingService();
