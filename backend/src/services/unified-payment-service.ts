/**
 * Unified Payment Service
 * Centralized payment processing for all Recoder frontends
 * Handles subscriptions, one-time payments, and usage billing
 */

import { logger } from '../utils/logger';
import { prisma } from '../database/prisma';
import { dodoPayments, SUBSCRIPTION_PLANS } from './dodo-payments';
import * as crypto from 'crypto';

export interface PaymentRequest {
  userId: string;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  paymentType: 'subscription' | 'one_time' | 'usage';
  metadata?: Record<string, any>;
  successUrl?: string;
  cancelUrl?: string;
  frontend?: 'web' | 'chat' | 'mobile' | 'desktop' | 'cli';
}

export interface PaymentResponse {
  success: boolean;
  paymentId?: string;
  checkoutUrl?: string;
  subscriptionId?: string;
  error?: string;
  code?: string;
}

export interface SubscriptionInfo {
  id: string;
  userId: string;
  planId: string;
  planName: string;
  status: string;
  amount: number;
  currency: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  nextBillingDate: Date;
  lastPaymentAt?: Date;
}

export interface UsageInfo {
  userId: string;
  currentUsage: number;
  monthlyLimit: number;
  dailyLimit: number;
  usagePercentage: number;
  costThisMonth: number;
  projectedMonthlyCost: number;
  remainingQuota: number;
}

export class UnifiedPaymentService {
  private static instance: UnifiedPaymentService;
  
  public static getInstance(): UnifiedPaymentService {
    if (!UnifiedPaymentService.instance) {
      UnifiedPaymentService.instance = new UnifiedPaymentService();
    }
    return UnifiedPaymentService.instance;
  }

  /**
   * Get available subscription plans
   */
  async getSubscriptionPlans(): Promise<any[]> {
    try {
      logger.info('Fetching subscription plans from database');
      
      // Return static subscription plans (use DODO plans)
      const { SUBSCRIPTION_PLANS } = await import('./dodo-payments');
      const plans = Object.entries(SUBSCRIPTION_PLANS).map(([id, plan]) => ({
        id,
        ...plan,
        active: true
      }));

      return plans;

    } catch (error) {
      logger.error('Failed to fetch subscription plans', { error });
      throw error;
    }
  }

  /**
   * Get user's current subscription
   */
  async getUserSubscription(userId: string): Promise<any> {
    try {
      logger.info('Fetching user subscription', { userId });
      
      // Try to find subscription in database
      if (prisma?.subscription) {
        const subscription = await prisma.subscription.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' }
        });
        
        if (subscription) {
          // Get plan details
          const plan = SUBSCRIPTION_PLANS[subscription.planId];
          
          return {
            id: subscription.id,
            planId: subscription.planId,
            planName: plan?.name || 'Unknown Plan',
            status: subscription.status,
            amount: plan?.price || 0,
            currency: plan?.currency || 'USD',
            currentPeriodStart: subscription.currentPeriodStart?.toISOString(),
            currentPeriodEnd: subscription.currentPeriodEnd?.toISOString(),
            nextBillingDate: subscription.currentPeriodEnd?.toISOString(),
            lastPaymentAt: subscription.createdAt?.toISOString(),
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd || false
          };
        }
      }
      
      // No subscription found - user is on free plan
      return {
        id: null,
        planId: 'free',
        planName: 'Free Plan',
        status: 'active',
        amount: 0,
        currency: 'USD',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        nextBillingDate: null,
        lastPaymentAt: null,
        cancelAtPeriodEnd: false
      };

    } catch (error) {
      logger.error('Failed to fetch user subscription', { error, userId });
      
      // Return free plan on error
      return {
        id: null,
        planId: 'free',
        planName: 'Free Plan',
        status: 'active',
        amount: 0,
        currency: 'USD',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        nextBillingDate: null,
        lastPaymentAt: null,
        cancelAtPeriodEnd: false
      };
    }
  }

  /**
   * Get user's usage statistics from real-time tracker
   */
  async getUsageStats(userId: string): Promise<any> {
    try {
      logger.info('Fetching usage statistics', { userId });
      
      // Get real usage stats from the real-time usage tracker
      const usageTracker = require('./real-time-usage-tracker').RealTimeUsageTracker.getInstance();
      const usageStats = await usageTracker.getUsageStats(userId);
      
      return {
        currentUsage: usageStats.monthlyUsage.tokens,
        monthlyLimit: usageStats.monthlyUsage.tokensLimit,
        dailyLimit: usageStats.dailyUsage.tokensLimit,
        usagePercentage: usageStats.monthlyUsage.tokensPercentage,
        costThisMonth: usageStats.monthlyUsage.cost,
        projectedMonthlyCost: usageStats.monthlyUsage.cost * 1.2, // Estimate based on current trend
        remainingQuota: Math.max(0, usageStats.monthlyUsage.tokensLimit - usageStats.monthlyUsage.tokens)
      };

    } catch (error) {
      logger.error('Failed to fetch usage statistics', { error, userId });
      
      // Log error and throw to prevent masking real issues
      logger.error('Critical error: Cannot fetch usage statistics', { error, userId });
      throw new Error('Usage statistics unavailable');
    }
  }


  /**
   * Create a new payment/subscription
   */
  async createPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      // Validate user exists
      const user = await prisma.user.findUnique({
        where: { id: request.userId },
        select: { id: true, email: true, name: true, subscription: true }
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        };
      }

      // Validate plan exists
      const plan = await this.validatePlan(request.planId);
      if (!plan) {
        return {
          success: false,
          error: 'Invalid plan',
          code: 'INVALID_PLAN'
        };
      }

      // Check for existing active subscription
      if (request.paymentType === 'subscription') {
        const existingSubscription = await prisma.dodoSubscription.findFirst({
          where: {
            userId: request.userId,
            status: { in: ['active', 'trialing'] }
          }
        });

        if (existingSubscription) {
          return {
            success: false,
            error: 'User already has an active subscription',
            code: 'SUBSCRIPTION_EXISTS'
          };
        }
      }

      // Create payment with DODO Payments
      const dodoResponse = await dodoPayments.createCheckout({
        customer: {
          email: user.email,
          name: user.name || user.email
        },
        product: {
          id: request.planId,
          name: request.planName,
          price: request.amount,
          currency: request.currency,
          type: request.paymentType
        },
        metadata: {
          userId: request.userId,
          frontend: request.frontend || 'web',
          ...request.metadata
        },
        successUrl: request.successUrl,
        cancelUrl: request.cancelUrl
      });

      if (!dodoResponse.success) {
        logger.error('DODO payment creation failed', { 
          error: dodoResponse.error,
          userId: request.userId,
          planId: request.planId
        });
        return {
          success: false,
          error: 'Payment creation failed',
          code: 'PAYMENT_CREATION_FAILED'
        };
      }

      // Store payment intent in audit log for tracking
      await prisma.auditLog.create({
        data: {
          userId: request.userId,
          action: 'payment_intent_created',
          resource: 'payment_intent',
          resourceId: dodoResponse.checkoutId || '',
          metadata: {
            planId: request.planId,
            amount: request.amount,
            currency: request.currency,
            paymentType: request.paymentType,
            status: 'pending',
            frontend: request.frontend || 'web',
            ...request.metadata
          }
        }
      });

      // Log payment creation
      await prisma.auditLog.create({
        data: {
          userId: request.userId,
          action: 'payment_created',
          resource: 'payment',
          resourceId: dodoResponse.checkoutId,
          metadata: {
            planId: request.planId,
            amount: request.amount,
            currency: request.currency,
            frontend: request.frontend
          }
        }
      });

      logger.info('Payment created successfully', {
        userId: request.userId,
        planId: request.planId,
        amount: request.amount,
        checkoutId: dodoResponse.checkoutId,
        frontend: request.frontend
      });

      return {
        success: true,
        paymentId: dodoResponse.checkoutId,
        checkoutUrl: dodoResponse.checkoutUrl
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Payment creation error', { 
        error: errorMessage,
        userId: request.userId,
        planId: request.planId
      });

      return {
        success: false,
        error: 'Internal payment error',
        code: 'PAYMENT_SERVICE_ERROR'
      };
    }
  }

  /**
   * Get user's current subscription info
   */
  async getSubscriptionInfo(userId: string): Promise<SubscriptionInfo | null> {
    try {
      const subscription = await prisma.dodoSubscription.findFirst({
        where: {
          userId,
          status: { in: ['active', 'trialing', 'past_due'] }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (!subscription) {
        return null;
      }

      return {
        id: subscription.id,
        userId: subscription.userId,
        planId: subscription.planId,
        planName: subscription.planName,
        status: subscription.status,
        amount: subscription.amount,
        currency: subscription.currency,
        currentPeriodStart: subscription.currentPeriodStart || subscription.createdAt,
        currentPeriodEnd: subscription.currentPeriodEnd || subscription.nextBillingDate,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd || false,
        nextBillingDate: subscription.nextBillingDate,
        lastPaymentAt: subscription.lastPaymentAt
      };

    } catch (error) {
      logger.error('Failed to get subscription info', { error, userId });
      return null;
    }
  }

  /**
   * Cancel user's subscription
   */
  async cancelSubscription(userId: string, cancelImmediately: boolean = false): Promise<PaymentResponse> {
    try {
      const subscription = await prisma.dodoSubscription.findFirst({
        where: {
          userId,
          status: { in: ['active', 'trialing'] }
        }
      });

      if (!subscription) {
        return {
          success: false,
          error: 'No active subscription found',
          code: 'SUBSCRIPTION_NOT_FOUND'
        };
      }

      // Cancel with DODO Payments
      const dodoResponse = await dodoPayments.cancelSubscription(
        subscription.dodoSubscriptionId,
        cancelImmediately
      );

      if (!dodoResponse.success) {
        return {
          success: false,
          error: 'Failed to cancel subscription',
          code: 'CANCELLATION_FAILED'
        };
      }

      // Update local subscription status
      await prisma.dodoSubscription.update({
        where: { id: subscription.id },
        data: {
          status: cancelImmediately ? 'cancelled' : 'cancelled_at_period_end',
          cancelAtPeriodEnd: !cancelImmediately,
          cancelledAt: new Date()
        }
      });

      // Log cancellation
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'subscription_cancelled',
          resource: 'subscription',
          resourceId: subscription.id,
          metadata: {
            cancelImmediately,
            planId: subscription.planId
          }
        }
      });

      logger.info('Subscription cancelled', {
        userId,
        subscriptionId: subscription.id,
        cancelImmediately
      });

      return {
        success: true,
        subscriptionId: subscription.id
      };

    } catch (error) {
      logger.error('Subscription cancellation error', { error, userId });
      return {
        success: false,
        error: 'Internal cancellation error',
        code: 'CANCELLATION_SERVICE_ERROR'
      };
    }
  }

  /**
   * Get user's usage information and costs
   */
  async getUsageInfo(userId: string): Promise<UsageInfo> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { subscription: true }
      });

      const subscription = await this.getSubscriptionInfo(userId);
      
      // Get plan limits
      const planLimits = this.getPlanLimits(subscription?.planId || 'free');

      // Calculate current month usage
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [monthlyUsage, dailyUsage, monthlyCost] = await Promise.all([
        prisma.usageRecord.count({
          where: {
            userId,
            timestamp: { gte: startOfMonth }
          }
        }),
        prisma.usageRecord.count({
          where: {
            userId,
            timestamp: { gte: startOfDay }
          }
        }),
        prisma.usageRecord.aggregate({
          where: {
            userId,
            timestamp: { gte: startOfMonth }
          },
          _sum: { cost: true }
        })
      ]);

      const currentCost = monthlyCost._sum.cost || 0;
      const usagePercentage = (monthlyUsage / planLimits.monthlyLimit) * 100;
      
      // Project monthly cost based on current usage
      const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
      const dayOfMonth = new Date().getDate();
      const projectedMonthlyCost = (currentCost / dayOfMonth) * daysInMonth;

      return {
        userId,
        currentUsage: monthlyUsage,
        monthlyLimit: planLimits.monthlyLimit,
        dailyLimit: planLimits.dailyLimit,
        usagePercentage: Math.min(usagePercentage, 100),
        costThisMonth: currentCost,
        projectedMonthlyCost,
        remainingQuota: Math.max(0, planLimits.monthlyLimit - monthlyUsage)
      };

    } catch (error) {
      logger.error('Failed to get usage info', { error, userId });
      
      // Log error and throw to prevent masking real issues
      logger.error('Critical error: Cannot fetch user usage info', { error, userId });
      throw new Error('Usage information unavailable');
    }
  }

  /**
   * Record usage for billing purposes
   */
  async recordUsage(userId: string, type: string, metadata: Record<string, any> = {}): Promise<void> {
    try {
      const cost = this.calculateUsageCost(type, metadata);

      await prisma.usageRecord.create({
        data: {
          userId,
          type: type,
          metadata: metadata as any,
          cost,
          tokens: metadata.tokens || 0
        }
      });

      // Check if user is approaching limits
      const usageInfo = await this.getUsageInfo(userId);
      if (usageInfo.usagePercentage > 80) {
        await this.sendUsageWarning(userId, usageInfo);
      }

    } catch (error) {
      logger.error('Failed to record usage', { error, userId, type });
    }
  }

  /**
   * Validate payment plan
   */
  private async validatePlan(planId: string): Promise<boolean> {
    const validPlans = ['free', 'pro', 'premium', 'enterprise'];
    return validPlans.includes(planId);
  }

  /**
   * Get plan limits based on plan ID
   */
  private getPlanLimits(planId: string) {
    const limits = {
      free: { monthlyLimit: 100, dailyLimit: 10 },
      pro: { monthlyLimit: 2000, dailyLimit: 200 },
      premium: { monthlyLimit: 10000, dailyLimit: 1000 },
      enterprise: { monthlyLimit: 50000, dailyLimit: 5000 }
    };

    return limits[planId as keyof typeof limits] || limits.free;
  }

  /**
   * Calculate cost for usage type
   */
  private calculateUsageCost(type: string, metadata: Record<string, any>): number {
    const costPerToken = {
      'ai_generation': 0.00001,
      'code_analysis': 0.00005,
      'file_processing': 0.0001,
      'api_call': 0.001
    };

    const baseCost = costPerToken[type as keyof typeof costPerToken] || 0.0001;
    const tokens = metadata.tokens || 1;
    
    return baseCost * tokens;
  }

  /**
   * Send usage warning to user
   */
  private async sendUsageWarning(userId: string, usageInfo: UsageInfo): Promise<void> {
    try {
      // In a real implementation, this would send an email/notification
      logger.warn('User approaching usage limit', {
        userId,
        usagePercentage: usageInfo.usagePercentage,
        remainingQuota: usageInfo.remainingQuota
      });

      // Store notification in audit log
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'usage_warning_sent',
          resource: 'usage_notification',
          resourceId: crypto.randomUUID(),
          metadata: {
            title: 'Usage Limit Warning',
            message: `You've used ${usageInfo.usagePercentage.toFixed(1)}% of your monthly quota. Consider upgrading your plan.`,
            usagePercentage: usageInfo.usagePercentage,
            remainingQuota: usageInfo.remainingQuota
          }
        }
      });

    } catch (error) {
      logger.error('Failed to send usage warning', { error, userId });
    }
  }
}

// Export singleton instance
export const unifiedPaymentService = UnifiedPaymentService.getInstance();