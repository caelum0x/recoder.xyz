/**
 * Usage Tracking and Quota Management
 * Track CLI requests, enforce limits, and manage quotas
 */

import { prisma } from './prisma';
import { getPlanLimits, canMakeRequest } from './plan-config';

export interface UsageMetadata {
  modelUsed?: string;
  providerUsed?: string;
  tokensUsed?: number;
  cost?: number;
  duration?: number; // milliseconds
  endpoint?: string;
  method?: string;
  statusCode?: number;
  success?: boolean;
  errorMessage?: string;
  [key: string]: any;
}

export interface QuotaInfo {
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
  resetDate: Date;
  reason?: string;
  upgradeRequired?: boolean;
}

/**
 * Check if user can make a request based on quota
 * @param userId The user's ID
 * @returns Quota information
 */
export async function checkQuota(userId: string): Promise<QuotaInfo> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionPlan: true,
      quotas: {
        where: {
          periodEnd: { gt: new Date() },
        },
        orderBy: { periodStart: 'desc' },
        take: 1,
      },
    },
  });

  if (!user) {
    return {
      allowed: false,
      remaining: 0,
      limit: 0,
      used: 0,
      resetDate: new Date(),
      reason: 'User not found',
    };
  }

  const planLimits = getPlanLimits(user.subscriptionPlan);
  
  // Get or create current quota period
  let quota = user.quotas[0];
  if (!quota) {
    quota = await prisma.userQuota.create({
      data: {
        userId,
        requestsLimit: planLimits.monthlyRequests,
        requestsUsed: 0,
        tokensLimit: BigInt(planLimits.tokensPerMonth),
        tokensUsed: BigInt(0),
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });
  }

  // Check if period has expired and needs reset
  if (quota.periodEnd < new Date()) {
    quota = await resetQuota(userId, planLimits.monthlyRequests, planLimits.tokensPerMonth);
  }

  // Check rate limiting (last minute)
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  const recentRequests = await prisma.usageRecord.count({
    where: {
      userId,
      timestamp: { gt: oneMinuteAgo },
    },
  });

  const requestCheck = canMakeRequest(
    user.subscriptionPlan,
    quota.requestsUsed,
    recentRequests
  );

  if (!requestCheck.allowed) {
    return {
      allowed: false,
      remaining: 0,
      limit: planLimits.monthlyRequests,
      used: quota.requestsUsed,
      resetDate: quota.periodEnd,
      reason: requestCheck.reason,
      upgradeRequired: requestCheck.upgradeRequired,
    };
  }

  const remaining = planLimits.monthlyRequests === -1 
    ? -1 
    : planLimits.monthlyRequests - quota.requestsUsed;

  return {
    allowed: true,
    remaining,
    limit: planLimits.monthlyRequests,
    used: quota.requestsUsed,
    resetDate: quota.periodEnd,
  };
}

/**
 * Track a usage event
 * @param userId The user's ID
 * @param sessionId The session ID
 * @param requestType The type of request
 * @param metadata Additional metadata
 * @returns Updated quota information
 */
export async function trackUsage(
  userId: string,
  sessionId: string | null,
  requestType: 'cli' | 'api' | 'web' | 'router',
  metadata: UsageMetadata = {}
): Promise<QuotaInfo> {
  // Record usage
  await prisma.usageRecord.create({
    data: {
      userId,
      sessionId,
      requestType,
      endpoint: metadata.endpoint,
      method: metadata.method,
      statusCode: metadata.statusCode,
      tokensUsed: metadata.tokensUsed,
      cost: metadata.cost,
      modelUsed: metadata.modelUsed,
      providerUsed: metadata.providerUsed,
      duration: metadata.duration,
      success: metadata.success ?? true,
      errorMessage: metadata.errorMessage,
      metadata: metadata as any,
    },
  });

  // Update quota
  const quota = await prisma.userQuota.findFirst({
    where: {
      userId,
      periodEnd: { gt: new Date() },
    },
    orderBy: { periodStart: 'desc' },
  });

  if (quota) {
    await prisma.userQuota.update({
      where: { id: quota.id },
      data: {
        requestsUsed: { increment: 1 },
        tokensUsed: { 
          increment: BigInt(metadata.tokensUsed || 0) 
        },
        costThisPeriod: {
          increment: metadata.cost || 0,
        },
      },
    });
  }

  // Return updated quota
  return checkQuota(userId);
}

/**
 * Reset quota for a new period
 * @param userId The user's ID
 * @param requestsLimit New requests limit
 * @param tokensLimit New tokens limit
 * @returns New quota record
 */
async function resetQuota(
  userId: string,
  requestsLimit: number,
  tokensLimit: number
): Promise<any> {
  // Archive old quota
  await prisma.userQuota.updateMany({
    where: {
      userId,
      periodEnd: { lt: new Date() },
    },
    data: {
      updatedAt: new Date(),
    },
  });

  // Create new quota period
  return prisma.userQuota.create({
    data: {
      userId,
      requestsLimit,
      requestsUsed: 0,
      tokensLimit: BigInt(tokensLimit),
      tokensUsed: BigInt(0),
      tokensUsedThisPeriod: BigInt(0),
      costThisPeriod: 0,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      lastResetAt: new Date(),
    },
  });
}

/**
 * Get usage statistics for a user
 * @param userId The user's ID
 * @param startDate Optional start date
 * @param endDate Optional end date
 * @returns Usage statistics
 */
export async function getUsageStats(
  userId: string,
  startDate?: Date,
  endDate?: Date
): Promise<{
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  requestsByType: Record<string, number>;
  requestsByModel: Record<string, number>;
  averageTokensPerRequest: number;
  averageCostPerRequest: number;
}> {
  const where: any = { userId };
  
  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp.gte = startDate;
    if (endDate) where.timestamp.lte = endDate;
  }

  const records = await prisma.usageRecord.findMany({
    where,
    select: {
      requestType: true,
      tokensUsed: true,
      cost: true,
      modelUsed: true,
    },
  });

  const totalRequests = records.length;
  const totalTokens = records.reduce((sum, r) => sum + (r.tokensUsed || 0), 0);
  const totalCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);

  const requestsByType: Record<string, number> = {};
  const requestsByModel: Record<string, number> = {};

  records.forEach(record => {
    requestsByType[record.requestType] = (requestsByType[record.requestType] || 0) + 1;
    if (record.modelUsed) {
      requestsByModel[record.modelUsed] = (requestsByModel[record.modelUsed] || 0) + 1;
    }
  });

  return {
    totalRequests,
    totalTokens,
    totalCost,
    requestsByType,
    requestsByModel,
    averageTokensPerRequest: totalRequests > 0 ? totalTokens / totalRequests : 0,
    averageCostPerRequest: totalRequests > 0 ? totalCost / totalRequests : 0,
  };
}

/**
 * Get current period usage for dashboard
 * @param userId The user's ID
 * @returns Current usage information
 */
export async function getCurrentUsage(userId: string): Promise<{
  requests: { used: number; limit: number; percentage: number };
  tokens: { used: number; limit: number; percentage: number };
  cost: number;
  periodEnd: Date;
}> {
  const quota = await prisma.userQuota.findFirst({
    where: {
      userId,
      periodEnd: { gt: new Date() },
    },
    orderBy: { periodStart: 'desc' },
  });

  if (!quota) {
    return {
      requests: { used: 0, limit: 1000, percentage: 0 },
      tokens: { used: 0, limit: 1000000, percentage: 0 },
      cost: 0,
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
  }

  const requestsPercentage = quota.requestsLimit > 0 
    ? (quota.requestsUsed / quota.requestsLimit) * 100 
    : 0;
    
  const tokensLimit = Number(quota.tokensLimit);
  const tokensUsed = Number(quota.tokensUsed);
  const tokensPercentage = tokensLimit > 0 
    ? (tokensUsed / tokensLimit) * 100 
    : 0;

  return {
    requests: {
      used: quota.requestsUsed,
      limit: quota.requestsLimit,
      percentage: requestsPercentage,
    },
    tokens: {
      used: tokensUsed,
      limit: tokensLimit,
      percentage: tokensPercentage,
    },
    cost: quota.costThisPeriod,
    periodEnd: quota.periodEnd,
  };
}

/**
 * Bulk track usage for multiple requests (for batch operations)
 * @param records Array of usage records
 */
export async function bulkTrackUsage(
  records: Array<{
    userId: string;
    sessionId: string | null;
    requestType: 'cli' | 'api' | 'web' | 'router';
    metadata: UsageMetadata;
  }>
): Promise<void> {
  await prisma.usageRecord.createMany({
    data: records.map(record => ({
      userId: record.userId,
      sessionId: record.sessionId,
      requestType: record.requestType,
      endpoint: record.metadata.endpoint,
      method: record.metadata.method,
      statusCode: record.metadata.statusCode,
      tokensUsed: record.metadata.tokensUsed,
      cost: record.metadata.cost,
      modelUsed: record.metadata.modelUsed,
      providerUsed: record.metadata.providerUsed,
      duration: record.metadata.duration,
      success: record.metadata.success ?? true,
      errorMessage: record.metadata.errorMessage,
      metadata: record.metadata as any,
    })),
  });
}
