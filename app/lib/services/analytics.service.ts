/**
 * AnalyticsService
 * Usage tracking and analytics service
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import crypto from 'crypto';
import { formatCommercialQuotaResponse } from '@/lib/commercial-quota';
import { normalizeCommercialPlan } from '@/lib/plan-entitlements';

export class AnalyticsService {
  /**
   * Track usage event
   */
  async trackUsage(
    userId: string,
    data: {
      requestType: string;
      model?: string;
      provider?: string;
      tokensUsed?: number;
      inputTokens?: number;
      outputTokens?: number;
      cost?: number;
      duration?: number;
      success?: boolean;
      platform?: string;
      sessionId?: string;
    }
  ) {
    try {
      const usage = await prisma.usage_records.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          type: 'analytics',
          requestType: data.requestType,
          model: data.model,
          provider: data.provider,
          tokens: data.tokensUsed || 0,
          cost: data.cost || 0,
          duration: data.duration || 0,
          platform: data.platform || 'web',
          timestamp: new Date(),
          metadata: {
            success: data.success,
            inputTokens: data.inputTokens,
            outputTokens: data.outputTokens,
          }
        },
      });

      // Update user quota
      await this.updateQuotaUsage(userId, data.tokensUsed || 0);

      return { success: true, usage };
    } catch (error: any) {
      logger.error('Track usage error', { error: String(error) });
      throw error;
    }
  }

  /**
   * Get dashboard metrics
   */
  async getDashboardMetrics(userId: string) {
    try {
      const now = new Date();
      const today = new Date(now.setHours(0, 0, 0, 0));
      const startOfWeek = new Date(today);
      startOfWeek.setDate(startOfWeek.getDate() - 7);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Today's usage
      const todayUsage = await prisma.usage_records.aggregate({
        where: {
          userId,
          timestamp: { gte: today },
        },
        _sum: {
          tokensUsed: true,
          cost: true,
          requestCount: true,
        },
        _count: true,
      });

      // This week's usage
      const weekUsage = await prisma.usage_records.aggregate({
        where: {
          userId,
          timestamp: { gte: startOfWeek },
        },
        _sum: {
          tokensUsed: true,
          cost: true,
          requestCount: true,
        },
      });

      // This month's usage
      const monthUsage = await prisma.usage_records.aggregate({
        where: {
          userId,
          timestamp: { gte: startOfMonth },
        },
        _sum: {
          tokensUsed: true,
          cost: true,
          requestCount: true,
        },
      });

      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { subscriptionPlan: true, subscription: true },
      });
      const normalizedPlan = normalizeCommercialPlan(user?.subscriptionPlan || user?.subscription || 'free');

      // Get user quota
      const quota = await prisma.user_quota.findUnique({
        where: { userId },
      });
      const quotaResponse = quota ? formatCommercialQuotaResponse(quota, normalizedPlan) : null;

      return {
        success: true,
        metrics: {
          today: {
            tokens: todayUsage._sum.tokensUsed || 0,
            cost: todayUsage._sum.cost || 0,
            requests: todayUsage._sum.requestCount || 0,
            sessions: todayUsage._count || 0,
          },
          week: {
            tokens: weekUsage._sum.tokensUsed || 0,
            cost: weekUsage._sum.cost || 0,
            requests: weekUsage._sum.requestCount || 0,
          },
          month: {
            tokens: monthUsage._sum.tokensUsed || 0,
            cost: monthUsage._sum.cost || 0,
            requests: monthUsage._sum.requestCount || 0,
          },
          quota: quota
            ? {
                ...quotaResponse?.legacy,
                sessionsUsed: quota.sessionsUsedToday,
                monthlyLimit: quota.requestsLimit,
                monthlyUsed: quota.requestsUsed,
                commercial: quotaResponse?.commercial,
              }
            : null,
        },
      };
    } catch (error: any) {
      logger.error('Get dashboard metrics error', { error: String(error) });
      throw error;
    }
  }

  /**
   * Get usage history
   */
  async getUsageHistory(
    userId: string,
    startDate: Date,
    endDate: Date,
    groupBy: 'hour' | 'day' | 'week' | 'month' = 'day'
  ) {
    try {
      const usage = await prisma.usage_records.findMany({
        where: {
          userId,
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { timestamp: 'asc' },
      });

      // Group by specified period
      const grouped = this.groupUsageData(usage, groupBy);

      return { success: true, usage: grouped };
    } catch (error: any) {
      logger.error('Get usage history error', { error: String(error) });
      throw error;
    }
  }

  /**
   * Get usage by model
   */
  async getUsageByModel(userId: string, period: 'day' | 'week' | 'month' = 'month') {
    try {
      const startDate = this.getStartDate(period);

      const usage = await prisma.usage_records.groupBy({
        by: ['model'],
        where: {
          userId,
          timestamp: { gte: startDate },
        },
        _sum: {
          tokensUsed: true,
          cost: true,
          requestCount: true,
        },
        _count: true,
      });

      return {
        success: true,
        byModel: usage.map((u) => ({
          model: u.model,
          tokens: u._sum.tokensUsed || 0,
          cost: u._sum.cost || 0,
          requests: u._sum.requestCount || 0,
          count: u._count,
        })),
      };
    } catch (error: any) {
      logger.error('Get usage by model error', { error: String(error) });
      throw error;
    }
  }

  /**
   * Get usage by cost
   */
  async getUsageByCost(userId: string, period: 'day' | 'week' | 'month' = 'month') {
    try {
      const startDate = this.getStartDate(period);

      const usage = await prisma.usage_records.findMany({
        where: {
          userId,
          timestamp: { gte: startDate },
          cost: { gt: 0 },
        },
        orderBy: { cost: 'desc' },
        take: 10,
        select: {
          model: true,
          cost: true,
          tokensUsed: true,
          timestamp: true,
        },
      });

      const totalCost = await prisma.usage_records.aggregate({
        where: {
          userId,
          timestamp: { gte: startDate },
        },
        _sum: { cost: true },
      });

      return {
        success: true,
        topUsage: usage,
        totalCost: totalCost._sum.cost || 0,
      };
    } catch (error: any) {
      logger.error('Get usage by cost error', { error: String(error) });
      throw error;
    }
  }

  /**
   * Export usage data
   */
  async exportUsageData(userId: string, format: 'json' | 'csv' = 'json') {
    try {
      const usage = await prisma.usage_records.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: 10000, // Limit to last 10k records
      });

      if (format === 'csv') {
        return {
          success: true,
          data: this.convertToCSV(usage),
          format: 'csv',
        };
      }

      return {
        success: true,
        data: usage,
        format: 'json',
      };
    } catch (error: any) {
      logger.error('Export usage data error', { error: String(error) });
      throw error;
    }
  }

  /**
   * Generate usage report
   */
  async generateReport(
    userId: string,
    type: 'daily' | 'weekly' | 'monthly',
    startDate: Date,
    endDate: Date
  ) {
    try {
      const usage = await prisma.usage_records.findMany({
        where: {
          userId,
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      const summary = {
        totalTokens: usage.reduce((sum, u) => sum + (u.tokensUsed || 0), 0),
        totalCost: usage.reduce((sum, u) => sum + (u.cost || 0), 0),
        totalRequests: usage.reduce((sum, u) => sum + (u.requestCount || 0), 0),
        totalSessions: usage.length,
        averageTokensPerRequest:
          usage.length > 0
            ? usage.reduce((sum, u) => sum + (u.tokensUsed || 0), 0) / usage.length
            : 0,
        modelBreakdown: this.groupByModel(usage),
        platformBreakdown: this.groupByPlatform(usage),
      };

      return { success: true, report: summary };
    } catch (error: any) {
      logger.error('Generate report error', { error: String(error) });
      throw error;
    }
  }

  /**
   * Get quota status
   */
  async getQuotaStatus(userId: string) {
    try {
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { subscriptionPlan: true, subscription: true },
      });
      const normalizedPlan = normalizeCommercialPlan(user?.subscriptionPlan || user?.subscription || 'free');
      const quota = await prisma.user_quota.findUnique({
        where: { userId },
      });

      if (!quota) {
        return { success: false, message: 'Quota not found' };
      }

      const quotaResponse = formatCommercialQuotaResponse(quota, normalizedPlan);
      const percentUsed = quotaResponse.legacy.isUnlimited ? 0 : (quota.sessionsUsedToday / quota.sessionsPerDay) * 100;
      const isNearLimit = percentUsed >= 80;
      const isAtLimit = percentUsed >= 100;

      return {
        success: true,
        quota: {
          ...quotaResponse.legacy,
          sessionsUsed: quota.sessionsUsedToday,
          percentUsed: Math.round(percentUsed),
          isNearLimit,
          isAtLimit,
          resetsAt: quota.periodEnd,
          commercial: quotaResponse.commercial,
        },
      };
    } catch (error: any) {
      logger.error('Get quota status error', { error: String(error) });
      throw error;
    }
  }

  /**
   * Predict future usage
   */
  async predictUsage(userId: string) {
    try {
      // Get last 30 days of usage
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const usage = await prisma.usage_records.aggregate({
        where: {
          userId,
          timestamp: { gte: thirtyDaysAgo },
        },
        _sum: {
          tokensUsed: true,
          cost: true,
        },
        _count: true,
      });

      const dailyAverage = {
        tokens: (usage._sum.tokensUsed || 0) / 30,
        cost: (usage._sum.cost || 0) / 30,
        requests: usage._count / 30,
      };

      const monthlyProjection = {
        tokens: dailyAverage.tokens * 30,
        cost: dailyAverage.cost * 30,
        requests: dailyAverage.requests * 30,
      };

      return {
        success: true,
        prediction: {
          dailyAverage,
          monthlyProjection,
        },
      };
    } catch (error: any) {
      logger.error('Predict usage error', { error: String(error) });
      throw error;
    }
  }

  // Helper methods

  private async updateQuotaUsage(userId: string, tokensUsed: number) {
    try {
      const quota = await prisma.user_quota.findUnique({
        where: { userId },
      });

      if (!quota) return;

      // Check if we need to reset daily quota
      const now = new Date();
      if (now > quota.periodEnd) {
        const newPeriodEnd = new Date(now);
        newPeriodEnd.setHours(23, 59, 59, 999);

        await prisma.user_quota.update({
          where: { userId },
          data: {
            sessionsUsedToday: 1,
            requestsUsed: quota.requestsUsed + tokensUsed,
            periodStart: now,
            periodEnd: newPeriodEnd,
            lastResetAt: now,
          },
        });
      } else {
        await prisma.user_quota.update({
          where: { userId },
          data: {
            sessionsUsedToday: quota.sessionsUsedToday + 1,
            requestsUsed: quota.requestsUsed + tokensUsed,
          },
        });
      }
    } catch (error) {
      logger.error('Update quota usage error', { error: String(error) });
    }
  }

  private groupUsageData(usage: any[], groupBy: string) {
    // Group usage data by specified period
    // Implementation would vary based on groupBy
    return usage;
  }

  private getStartDate(period: string): Date {
    const now = new Date();
    switch (period) {
      case 'day':
        return new Date(now.setHours(0, 0, 0, 0));
      case 'week':
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return weekAgo;
      case 'month':
        return new Date(now.getFullYear(), now.getMonth(), 1);
      default:
        return new Date(now.setHours(0, 0, 0, 0));
    }
  }

  private convertToCSV(data: any[]): string {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]).join(',');
    const rows = data.map((row) => Object.values(row).join(','));

    return [headers, ...rows].join('\n');
  }

  private groupByModel(usage: any[]) {
    const grouped: Record<string, any> = {};
    usage.forEach((u) => {
      const model = u.model || 'unknown';
      if (!grouped[model]) {
        grouped[model] = { tokens: 0, cost: 0, count: 0 };
      }
      grouped[model].tokens += u.tokensUsed || 0;
      grouped[model].cost += u.cost || 0;
      grouped[model].count += 1;
    });
    return grouped;
  }

  private groupByPlatform(usage: any[]) {
    const grouped: Record<string, any> = {};
    usage.forEach((u) => {
      const platform = u.platform || 'unknown';
      if (!grouped[platform]) {
        grouped[platform] = { tokens: 0, cost: 0, count: 0 };
      }
      grouped[platform].tokens += u.tokensUsed || 0;
      grouped[platform].cost += u.cost || 0;
      grouped[platform].count += 1;
    });
    return grouped;
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
