// Usage Tracking Service
// Tracks AI usage for billing and analytics 

import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';
import { getDodoPaymentsInstance, SubscriptionPlan, DodoPaymentsService } from './dodo-payments';

interface UsageEvent {
  userId: string;
  aiProvider: string;
  feature: string;
  tokensUsed: number;
  requestsMade: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  sessionId?: string;
  metadata?: Record<string, any>;
}

interface UsageCalculation {
  baseCost: number;
  providerMultiplier: number;
  featureMultiplier: number;
  totalCost: number;
}

class UsageTrackingService {
  private dodoPayments = getDodoPaymentsInstance();

  /**
   * Track AI usage event
   */
  async trackUsage(event: UsageEvent): Promise<void> {
    try {
      // Get user's subscription info
      const user = await prisma.user.findUnique({
        where: { id: event.userId },
        include: {
          dodoSubscriptions: {
            where: { status: 'active' },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      if (!user) {
        logger.error('User not found for usage tracking', { userId: event.userId });
        return;
      }

      // Calculate cost
      const cost = this.calculateCost(event);

      // Get current billing period
      const { periodStart, periodEnd } = this.getCurrentBillingPeriod(
        user.dodoSubscriptions[0]?.planId || 'free'
      );

      // Record usage
      await prisma.dodoUsage.create({
        data: {
          userId: event.userId,
          subscriptionId: user.dodoSubscriptions[0]?.id,
          tokensUsed: event.tokensUsed,
          requestsMade: event.requestsMade,
          aiProvider: event.aiProvider,
          featureUsed: event.feature,
          costCents: Math.round(cost.totalCost * 100),
          periodStart,
          periodEnd,
          metadata: {
            model: event.model,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            sessionId: event.sessionId,
            baseCost: cost.baseCost,
            providerMultiplier: cost.providerMultiplier,
            featureMultiplier: cost.featureMultiplier,
            ...event.metadata
          }
        }
      });

      // Check for overage and create charges if needed
      await this.checkOverageAndBill(event.userId, periodStart, periodEnd);

      logger.info('Usage tracked successfully', {
        userId: event.userId,
        provider: event.aiProvider,
        tokens: event.tokensUsed,
        cost: cost.totalCost
      });
    } catch (error) {
      logger.error('Failed to track usage', {
        error: error instanceof Error ? error.message : 'Unknown error',
        event
      });
      throw error;
    }
  }

  /**
   * Calculate cost for usage event
   */
  private calculateCost(event: UsageEvent): UsageCalculation {
    // Base cost per token (in USD)
    const baseCostPerToken = 0.00001; // $0.00001 per token

    // Provider multipliers
    const providerMultipliers: { [key: string]: number } = {
      'claude': 3.0,      // Most expensive, highest quality
      'gpt-4': 2.5,       // Expensive
      'gemini': 1.8,      // Mid-range
      'groq': 1.0,        // Base cost (fastest)
      'deepseek': 0.5,    // Cheapest
      'ollama': 0.1,      // Almost free (local)
      'default': 1.0
    };

    // Feature multipliers
    const featureMultipliers: { [key: string]: number } = {
      'code-generation': 1.5,
      'code-review': 1.2,
      'chat': 1.0,
      'completion': 1.0,
      'analysis': 1.3,
      'refactoring': 1.4,
      'documentation': 1.1,
      'debugging': 1.6,
      'testing': 1.2,
      'default': 1.0
    };

    const baseCost = event.tokensUsed * baseCostPerToken;
    const providerMultiplier = providerMultipliers[event.aiProvider.toLowerCase()] || providerMultipliers.default;
    const featureMultiplier = featureMultipliers[event.feature.toLowerCase()] || featureMultipliers.default;

    const totalCost = baseCost * providerMultiplier * featureMultiplier;

    return {
      baseCost,
      providerMultiplier,
      featureMultiplier,
      totalCost
    };
  }

  /**
   * Get current billing period
   */
  private getCurrentBillingPeriod(planId: string): { periodStart: Date; periodEnd: Date } {
    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date;

    if (planId === 'weekly') {
      // Weekly billing period (Monday to Sunday)
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 0 = Sunday
      
      periodStart = new Date(now);
      periodStart.setDate(now.getDate() - mondayOffset);
      periodStart.setHours(0, 0, 0, 0);
      
      periodEnd = new Date(periodStart);
      periodEnd.setDate(periodStart.getDate() + 6);
      periodEnd.setHours(23, 59, 59, 999);
    } else {
      // Monthly billing period (1st to last day of month)
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      periodEnd.setHours(23, 59, 59, 999);
    }

    return { periodStart, periodEnd };
  }

  /**
   * Check for overage and bill if necessary
   */
  private async checkOverageAndBill(userId: string, periodStart: Date, periodEnd: Date): Promise<void> {
    try {
      // Get user's subscription
      const subscription = await prisma.dodoSubscription.findFirst({
        where: {
          userId,
          status: 'active'
        },
        orderBy: { createdAt: 'desc' }
      });

      if (!subscription) return;

      // Get total usage for current period
      const totalUsage = await prisma.dodoUsage.aggregate({
        where: {
          userId,
          periodStart,
          periodEnd
        },
        _sum: {
          tokensUsed: true,
          requestsMade: true
        }
      });

      const tokensUsed = totalUsage._sum.tokensUsed || 0;
      const requestsMade = totalUsage._sum.requestsMade || 0;

      // Calculate overage using static method with correct signature
      const pricing = DodoPaymentsService.calculateUsage(subscription.planId, tokensUsed, requestsMade);

      // If there's overage, create an on-demand charge
      if (pricing > 0) {
        // Check if we haven't already charged for this period
        const existingCharge = await prisma.dodoCharge.findFirst({
          where: {
            subscriptionId: subscription.id,
            description: {
              contains: `Overage for ${periodStart.toISOString().split('T')[0]}`
            }
          }
        });

        if (!existingCharge) {
          await this.dodoPayments.createCharge({
            subscriptionId: subscription.dodoSubscriptionId,
            amount: pricing,
            description: `Overage charges for period ${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]}`
          });

          logger.info('Overage charge created', {
            userId,
            subscriptionId: subscription.id,
            overage: pricing,
            tokensUsed,
            requestsMade
          });
        }
      }
    } catch (error) {
      logger.error('Failed to check overage', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
    }
  }

  /**
   * Get usage summary for a user
   */
  async getUsageSummary(userId: string, periodStart: Date, periodEnd: Date): Promise<{
    totalTokens: number;
    totalRequests: number;
    totalCost: number;
    byProvider: { [provider: string]: { tokens: number; requests: number; cost: number } };
    byFeature: { [feature: string]: { tokens: number; requests: number; cost: number } };
  }> {
    const usageData = await prisma.dodoUsage.findMany({
      where: {
        userId,
        createdAt: {
          gte: periodStart,
          lte: periodEnd
        }
      }
    });

    let totalTokens = 0;
    let totalRequests = 0;
    let totalCost = 0;
    const byProvider: { [provider: string]: any } = {};
    const byFeature: { [feature: string]: any } = {};

    usageData.forEach(usage => {
      totalTokens += usage.tokensUsed;
      totalRequests += usage.requestsMade;
      totalCost += usage.costCents / 100;

      // Group by provider
      if (!byProvider[usage.aiProvider]) {
        byProvider[usage.aiProvider] = { tokens: 0, requests: 0, cost: 0 };
      }
      byProvider[usage.aiProvider].tokens += usage.tokensUsed;
      byProvider[usage.aiProvider].requests += usage.requestsMade;
      byProvider[usage.aiProvider].cost += usage.costCents / 100;

      // Group by feature
      if (!byFeature[usage.featureUsed]) {
        byFeature[usage.featureUsed] = { tokens: 0, requests: 0, cost: 0 };
      }
      byFeature[usage.featureUsed].tokens += usage.tokensUsed;
      byFeature[usage.featureUsed].requests += usage.requestsMade;
      byFeature[usage.featureUsed].cost += usage.costCents / 100;
    });

    return {
      totalTokens,
      totalRequests,
      totalCost,
      byProvider,
      byFeature
    };
  }

  /**
   * Track batch usage (for bulk operations)
   */
  async trackBatchUsage(events: UsageEvent[]): Promise<void> {
    const batchPromises = events.map(event => this.trackUsage(event));
    await Promise.allSettled(batchPromises);
  }

  /**
   * Get real-time usage for a user
   */
  async getRealTimeUsage(userId: string): Promise<{
    todayTokens: number;
    todayRequests: number;
    todayCost: number;
    currentHourTokens: number;
    currentHourRequests: number;
  }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentHourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

    const [todayUsage, hourlyUsage] = await Promise.all([
      prisma.dodoUsage.aggregate({
        where: {
          userId,
          createdAt: { gte: todayStart }
        },
        _sum: {
          tokensUsed: true,
          requestsMade: true,
          costCents: true
        }
      }),
      prisma.dodoUsage.aggregate({
        where: {
          userId,
          createdAt: { gte: currentHourStart }
        },
        _sum: {
          tokensUsed: true,
          requestsMade: true
        }
      })
    ]);

    return {
      todayTokens: todayUsage._sum.tokensUsed || 0,
      todayRequests: todayUsage._sum.requestsMade || 0,
      todayCost: (todayUsage._sum.costCents || 0) / 100,
      currentHourTokens: hourlyUsage._sum.tokensUsed || 0,
      currentHourRequests: hourlyUsage._sum.requestsMade || 0
    };
  }
}

// Export singleton instance
export const usageTracker = new UsageTrackingService();
export { UsageEvent, UsageCalculation };