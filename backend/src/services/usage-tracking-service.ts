/**
 * Usage Tracking Service
 * Tracks and enforces usage limits for all users
 */

import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';

export interface UsageData {
  userId: string;
  sessionId?: string;
  requestType: 'cli' | 'api' | 'web' | 'router';
  endpoint?: string;
  method?: string;
  statusCode?: number;
  tokensUsed?: number;
  cost?: number;
  modelUsed?: string;
  providerUsed?: string;
  duration?: number;
  success?: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface QuotaCheck {
  allowed: boolean;
  reason?: string;
  remaining?: {
    requests: number;
    tokens: bigint;
  };
  limits?: {
    requests: number;
    tokens: bigint;
  };
}

export class UsageTrackingService {
  /**
   * Check if user can make a request (quota check)
   */
  async checkQuota(userId: string, estimatedTokens: number = 0): Promise<QuotaCheck> {
    try {
      // Get user subscription plan
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          subscriptionPlan: true,
          subscriptionStatus: true
        }
      });

      if (!user) {
        return {
          allowed: false,
          reason: 'USER_NOT_FOUND'
        };
      }

      // Check subscription status
      if (user.subscriptionStatus !== 'active') {
        return {
          allowed: false,
          reason: 'SUBSCRIPTION_INACTIVE'
        };
      }

      // Get current quota
      const quota = await this.getCurrentQuota(userId);

      if (!quota) {
        // No quota found, create one
        await this.createQuotaForUser(userId, user.subscriptionPlan);
        return this.checkQuota(userId, estimatedTokens);
      }

      // Check if quota period has expired
      if (quota.periodEnd < new Date()) {
        // Reset quota for new period
        await this.resetQuota(quota.id, user.subscriptionPlan);
        return this.checkQuota(userId, estimatedTokens);
      }

      // Check request limit
      if (quota.requestsUsed >= quota.requestsLimit) {
        return {
          allowed: false,
          reason: 'REQUEST_LIMIT_EXCEEDED',
          remaining: {
            requests: 0,
            tokens: quota.tokensLimit - quota.tokensUsed
          },
          limits: {
            requests: quota.requestsLimit,
            tokens: quota.tokensLimit
          }
        };
      }

      // Check token limit
      const estimatedTokensBigInt = BigInt(estimatedTokens);
      if (quota.tokensUsed + estimatedTokensBigInt > quota.tokensLimit) {
        return {
          allowed: false,
          reason: 'TOKEN_LIMIT_EXCEEDED',
          remaining: {
            requests: quota.requestsLimit - quota.requestsUsed,
            tokens: BigInt(0)
          },
          limits: {
            requests: quota.requestsLimit,
            tokens: quota.tokensLimit
          }
        };
      }

      // Quota check passed
      return {
        allowed: true,
        remaining: {
          requests: quota.requestsLimit - quota.requestsUsed,
          tokens: quota.tokensLimit - quota.tokensUsed
        },
        limits: {
          requests: quota.requestsLimit,
          tokens: quota.tokensLimit
        }
      };
    } catch (error) {
      logger.error('Quota check failed', { error, userId });
      // Fail open in case of error (but log it)
      return {
        allowed: true,
        reason: 'QUOTA_CHECK_ERROR'
      };
    }
  }

  /**
   * Track usage for a request
   */
  async trackUsage(data: UsageData): Promise<void> {
    try {
      const {
        userId,
        sessionId,
        requestType,
        endpoint,
        method,
        statusCode,
        tokensUsed = 0,
        cost = 0,
        modelUsed,
        providerUsed,
        duration,
        success = true,
        errorMessage,
        metadata
      } = data;

      // Record usage
      await prisma.usageRecord.create({
        data: {
          userId,
          sessionId,
          requestType,
          endpoint,
          method,
          statusCode,
          tokensUsed,
          cost,
          modelUsed,
          providerUsed,
          duration,
          success,
          errorMessage,
          metadata: metadata || {},
          timestamp: new Date()
        }
      });

      // Update quota if tokens were used
      if (tokensUsed > 0 || cost > 0) {
        await this.updateQuota(userId, tokensUsed, cost);
      }

      logger.debug('Usage tracked', {
        userId,
        requestType,
        tokensUsed,
        cost,
        success
      });
    } catch (error) {
      logger.error('Failed to track usage', { error, data });
      // Don't throw - usage tracking should not break the main flow
    }
  }

  /**
   * Get current quota for user
   */
  private async getCurrentQuota(userId: string) {
    return await prisma.userQuota.findFirst({
      where: {
        userId,
        periodEnd: { gte: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Update quota after usage
   */
  private async updateQuota(userId: string, tokensUsed: number, cost: number) {
    const quota = await this.getCurrentQuota(userId);
    
    if (!quota) {
      logger.warn('No quota found for user during update', { userId });
      return;
    }

    await prisma.userQuota.update({
      where: { id: quota.id },
      data: {
        requestsUsed: { increment: 1 },
        tokensUsed: { increment: BigInt(tokensUsed) },
        tokensUsedThisPeriod: { increment: BigInt(tokensUsed) },
        costThisPeriod: { increment: cost },
        updatedAt: new Date()
      }
    });
  }

  /**
   * Create quota for user based on subscription plan
   */
  private async createQuotaForUser(userId: string, plan: string) {
    const limits = this.getQuotaLimits(plan);
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await prisma.userQuota.create({
      data: {
        userId,
        requestsLimit: limits.requests,
        requestsUsed: 0,
        tokensLimit: BigInt(limits.tokens),
        tokensUsed: BigInt(0),
        tokensUsedThisPeriod: BigInt(0),
        costThisPeriod: 0,
        periodStart: now,
        periodEnd,
        lastResetAt: now,
        createdAt: now,
        updatedAt: now
      }
    });

    logger.info('Quota created for user', { userId, plan, limits });
  }

  /**
   * Reset quota for new period
   */
  private async resetQuota(quotaId: string, plan: string) {
    const limits = this.getQuotaLimits(plan);
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await prisma.userQuota.update({
      where: { id: quotaId },
      data: {
        requestsLimit: limits.requests,
        requestsUsed: 0,
        tokensLimit: BigInt(limits.tokens),
        tokensUsed: BigInt(0),
        tokensUsedThisPeriod: BigInt(0),
        costThisPeriod: 0,
        periodStart: now,
        periodEnd,
        lastResetAt: now,
        updatedAt: now
      }
    });

    logger.info('Quota reset', { quotaId, plan, limits });
  }

  /**
   * Get quota limits based on subscription plan
   */
  private getQuotaLimits(plan: string): { requests: number; tokens: number } {
    switch (plan.toLowerCase()) {
      case 'free':
        return {
          requests: 1000, // 1k requests/month
          tokens: 1000000 // 1M tokens/month
        };
      
      case 'pro':
        return {
          requests: 50000, // 50k requests/month
          tokens: 50000000 // 50M tokens/month
        };
      
      case 'enterprise':
        return {
          requests: 1000000, // 1M requests/month (effectively unlimited)
          tokens: 1000000000 // 1B tokens/month
        };
      
      default:
        logger.warn('Unknown subscription plan, using free tier limits', { plan });
        return {
          requests: 1000,
          tokens: 1000000
        };
    }
  }

  /**
   * Get usage statistics for user
   */
  async getUsageStats(userId: string, days: number = 30) {
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [totalRecords, totalTokens, totalCost, recordsByType] = await Promise.all([
        // Total records
        prisma.usageRecord.count({
          where: { userId, timestamp: { gte: since } }
        }),

        // Total tokens
        prisma.usageRecord.aggregate({
          where: { userId, timestamp: { gte: since } },
          _sum: { tokensUsed: true }
        }),

        // Total cost
        prisma.usageRecord.aggregate({
          where: { userId, timestamp: { gte: since } },
          _sum: { cost: true }
        }),

        // Records by type
        prisma.usageRecord.groupBy({
          by: ['requestType'],
          where: { userId, timestamp: { gte: since } },
          _count: true,
          _sum: { tokensUsed: true, cost: true }
        })
      ]);

      // Get current quota
      const quota = await this.getCurrentQuota(userId);

      return {
        period: {
          days,
          since: since.toISOString()
        },
        usage: {
          totalRequests: totalRecords,
          totalTokens: totalTokens._sum.tokensUsed || 0,
          totalCost: totalCost._sum.cost || 0
        },
        byType: recordsByType.map(r => ({
          type: r.requestType,
          count: r._count,
          tokens: r._sum.tokensUsed || 0,
          cost: r._sum.cost || 0
        })),
        currentQuota: quota ? {
          requestsUsed: quota.requestsUsed,
          requestsLimit: quota.requestsLimit,
          tokensUsed: quota.tokensUsed.toString(),
          tokensLimit: quota.tokensLimit.toString(),
          costThisPeriod: quota.costThisPeriod,
          periodStart: quota.periodStart,
          periodEnd: quota.periodEnd
        } : null
      };
    } catch (error) {
      logger.error('Failed to get usage stats', { error, userId });
      throw error;
    }
  }

  /**
   * Get recent usage records
   */
  async getRecentUsage(userId: string, limit: number = 50) {
    try {
      const records = await prisma.usageRecord.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: limit,
        select: {
          id: true,
          requestType: true,
          endpoint: true,
          tokensUsed: true,
          cost: true,
          modelUsed: true,
          providerUsed: true,
          duration: true,
          success: true,
          errorMessage: true,
          timestamp: true
        }
      });

      return records;
    } catch (error) {
      logger.error('Failed to get recent usage', { error, userId });
      throw error;
    }
  }

  /**
   * Check if user is approaching quota limits
   */
  async checkQuotaWarnings(userId: string): Promise<{
    requestsWarning: boolean;
    tokensWarning: boolean;
    percentUsed: { requests: number; tokens: number };
  }> {
    try {
      const quota = await this.getCurrentQuota(userId);

      if (!quota) {
        return {
          requestsWarning: false,
          tokensWarning: false,
          percentUsed: { requests: 0, tokens: 0 }
        };
      }

      const requestsPercent = (quota.requestsUsed / quota.requestsLimit) * 100;
      const tokensPercent = Number((quota.tokensUsed * BigInt(100)) / quota.tokensLimit);

      return {
        requestsWarning: requestsPercent >= 80,
        tokensWarning: tokensPercent >= 80,
        percentUsed: {
          requests: Math.round(requestsPercent),
          tokens: Math.round(tokensPercent)
        }
      };
    } catch (error) {
      logger.error('Failed to check quota warnings', { error, userId });
      return {
        requestsWarning: false,
        tokensWarning: false,
        percentUsed: { requests: 0, tokens: 0 }
      };
    }
  }
}

export const usageTrackingService = new UsageTrackingService();
