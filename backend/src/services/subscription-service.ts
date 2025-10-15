/**
 * Subscription Service
 * Handles subscription management, upgrades, downgrades, and cancellations
 */

import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';
import { usageTrackingService } from './usage-tracking-service';

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
  limits: {
    requests: number;
    tokens: number;
  };
}

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlan> = {
  'free': {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'USD',
    interval: 'month',
    features: [
      'Access to web.recoder.xyz',
      'Access to recoder-code CLI',
      'All AI models',
      'Must provide own OpenRouter API key'
    ],
    limits: {
      requests: 1000,
      tokens: 1000000
    }
  },
  'pro-monthly': {
    id: 'pro-monthly',
    name: 'Pro (Monthly)',
    price: 29,
    currency: 'USD',
    interval: 'month',
    features: [
      'Everything in Free',
      'Platform API keys (no key needed)',
      'Priority support',
      'Advanced analytics',
      '50x more usage'
    ],
    limits: {
      requests: 50000,
      tokens: 50000000
    }
  },
  'pro-yearly': {
    id: 'pro-yearly',
    name: 'Pro (Yearly)',
    price: 290, // 2 months free
    currency: 'USD',
    interval: 'year',
    features: [
      'Everything in Pro Monthly',
      'Save 17% ($58/year)',
      'Annual billing'
    ],
    limits: {
      requests: 50000,
      tokens: 50000000
    }
  },
  'enterprise': {
    id: 'enterprise',
    name: 'Enterprise',
    price: 99,
    currency: 'USD',
    interval: 'month',
    features: [
      'Everything in Pro',
      'Dedicated API keys',
      'White-label options',
      'SLA guarantee',
      'Custom integrations',
      'Priority support 24/7',
      '1M requests/month'
    ],
    limits: {
      requests: 1000000,
      tokens: 1000000000
    }
  }
};

export class SubscriptionService {
  /**
   * Get all available plans
   */
  getPlans(): SubscriptionPlan[] {
    return Object.values(SUBSCRIPTION_PLANS);
  }

  /**
   * Get specific plan
   */
  getPlan(planId: string): SubscriptionPlan | null {
    return SUBSCRIPTION_PLANS[planId] || null;
  }

  /**
   * Create subscription after payment
   */
  async createSubscription(data: {
    userId: string;
    planId: string;
    paymentProvider: 'paddle' | 'dodo';
    externalSubscriptionId: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  }) {
    try {
      const plan = this.getPlan(data.planId);
      if (!plan) {
        throw new Error('Invalid plan ID');
      }

      // Create subscription record
      const subscription = await prisma.subscription.create({
        data: {
          userId: data.userId,
          planId: data.planId,
          status: data.status,
          currentPeriodStart: data.currentPeriodStart,
          currentPeriodEnd: data.currentPeriodEnd,
          paymentMethodId: null, // Will be updated by webhook
          cancelAtPeriodEnd: false
        }
      });

      // Update user subscription plan
      await prisma.user.update({
        where: { id: data.userId },
        data: {
          subscriptionPlan: plan.name.toLowerCase().includes('pro') ? 'pro' : 
                           plan.name.toLowerCase().includes('enterprise') ? 'enterprise' : 'free',
          subscriptionStatus: data.status,
          // Clear API key if upgrading to paid (no longer needed)
          openRouterApiKey: plan.id !== 'free' ? null : undefined,
          hasOwnApiKey: plan.id !== 'free' ? false : undefined
        }
      });

      // Update quota limits
      await this.updateQuotaLimits(data.userId, plan);

      logger.info('Subscription created', {
        userId: data.userId,
        planId: data.planId,
        subscriptionId: subscription.id
      });

      return subscription;
    } catch (error) {
      logger.error('Failed to create subscription', { error, data });
      throw error;
    }
  }

  /**
   * Update subscription (upgrade/downgrade)
   */
  async updateSubscription(userId: string, newPlanId: string) {
    try {
      const newPlan = this.getPlan(newPlanId);
      if (!newPlan) {
        throw new Error('Invalid plan ID');
      }

      // Get current subscription
      const currentSub = await prisma.subscription.findFirst({
        where: { userId, status: 'active' },
        orderBy: { createdAt: 'desc' }
      });

      if (!currentSub) {
        throw new Error('No active subscription found');
      }

      // Update subscription
      await prisma.subscription.update({
        where: { id: currentSub.id },
        data: { planId: newPlanId }
      });

      // Update user
      await prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionPlan: newPlan.name.toLowerCase().includes('pro') ? 'pro' : 
                           newPlan.name.toLowerCase().includes('enterprise') ? 'enterprise' : 'free'
        }
      });

      // Update quota
      await this.updateQuotaLimits(userId, newPlan);

      logger.info('Subscription updated', {
        userId,
        oldPlanId: currentSub.planId,
        newPlanId
      });

      return true;
    } catch (error) {
      logger.error('Failed to update subscription', { error, userId, newPlanId });
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId: string, cancelAtPeriodEnd: boolean = true) {
    try {
      const subscription = await prisma.subscription.findFirst({
        where: { userId, status: 'active' },
        orderBy: { createdAt: 'desc' }
      });

      if (!subscription) {
        throw new Error('No active subscription found');
      }

      if (cancelAtPeriodEnd) {
        // Cancel at end of period
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { cancelAtPeriodEnd: true }
        });
      } else {
        // Cancel immediately
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'cancelled',
            cancelledAt: new Date()
          }
        });

        // Downgrade to free
        await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionPlan: 'free',
            subscriptionStatus: 'cancelled'
          }
        });

        // Reset quota to free tier
        const freePlan = this.getPlan('free')!;
        await this.updateQuotaLimits(userId, freePlan);
      }

      logger.info('Subscription cancelled', {
        userId,
        subscriptionId: subscription.id,
        cancelAtPeriodEnd
      });

      return true;
    } catch (error) {
      logger.error('Failed to cancel subscription', { error, userId });
      throw error;
    }
  }

  /**
   * Reactivate cancelled subscription
   */
  async reactivateSubscription(userId: string) {
    try {
      const subscription = await prisma.subscription.findFirst({
        where: {
          userId,
          OR: [
            { cancelAtPeriodEnd: true },
            { status: 'cancelled' }
          ]
        },
        orderBy: { createdAt: 'desc' }
      });

      if (!subscription) {
        throw new Error('No cancelled subscription found');
      }

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'active',
          cancelAtPeriodEnd: false,
          cancelledAt: null
        }
      });

      await prisma.user.update({
        where: { id: userId },
        data: { subscriptionStatus: 'active' }
      });

      logger.info('Subscription reactivated', {
        userId,
        subscriptionId: subscription.id
      });

      return true;
    } catch (error) {
      logger.error('Failed to reactivate subscription', { error, userId });
      throw error;
    }
  }

  /**
   * Get user's current subscription
   */
  async getUserSubscription(userId: string) {
    try {
      const subscription = await prisma.subscription.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              subscriptionPlan: true,
              subscriptionStatus: true
            }
          }
        }
      });

      if (!subscription) {
        return null;
      }

      const plan = this.getPlan(subscription.planId);

      return {
        ...subscription,
        plan
      };
    } catch (error) {
      logger.error('Failed to get user subscription', { error, userId });
      throw error;
    }
  }

  /**
   * Update quota limits based on plan
   */
  private async updateQuotaLimits(userId: string, plan: SubscriptionPlan) {
    try {
      // Get current quota
      const quota = await prisma.userQuota.findFirst({
        where: {
          userId,
          periodEnd: { gte: new Date() }
        }
      });

      if (quota) {
        // Update existing quota
        await prisma.userQuota.update({
          where: { id: quota.id },
          data: {
            requestsLimit: plan.limits.requests,
            tokensLimit: BigInt(plan.limits.tokens)
          }
        });
      } else {
        // Create new quota
        const now = new Date();
        const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

        await prisma.userQuota.create({
          data: {
            userId,
            requestsLimit: plan.limits.requests,
            requestsUsed: 0,
            tokensLimit: BigInt(plan.limits.tokens),
            tokensUsed: BigInt(0),
            tokensUsedThisPeriod: BigInt(0),
            costThisPeriod: 0,
            periodStart: now,
            periodEnd,
            lastResetAt: now
          }
        });
      }

      logger.debug('Quota limits updated', {
        userId,
        planId: plan.id,
        limits: plan.limits
      });
    } catch (error) {
      logger.error('Failed to update quota limits', { error, userId });
      throw error;
    }
  }

  /**
   * Check if user can upgrade to plan
   */
  async canUpgradeToPlan(userId: string, newPlanId: string): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionPlan: true }
      });

      if (!user) return false;

      const currentPlan = Object.values(SUBSCRIPTION_PLANS).find(
        p => p.name.toLowerCase().includes(user.subscriptionPlan)
      );
      const newPlan = this.getPlan(newPlanId);

      if (!currentPlan || !newPlan) return false;

      // Can always upgrade to higher tier
      return newPlan.price > currentPlan.price;
    } catch (error) {
      logger.error('Failed to check upgrade eligibility', { error, userId, newPlanId });
      return false;
    }
  }

  /**
   * Calculate prorated amount for upgrade
   */
  calculateProration(
    currentPlan: SubscriptionPlan,
    newPlan: SubscriptionPlan,
    daysRemaining: number
  ): number {
    const dailyOldRate = currentPlan.price / 30;
    const dailyNewRate = newPlan.price / 30;
    const dailyDifference = dailyNewRate - dailyOldRate;
    
    return Math.max(0, dailyDifference * daysRemaining);
  }
}

export const subscriptionService = new SubscriptionService();
