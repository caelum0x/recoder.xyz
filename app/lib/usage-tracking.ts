/**
 * Usage Tracking and Quota Management
 * Track CLI requests, enforce limits, and manage quotas
 */
import crypto from 'crypto';

import { prisma } from './prisma';
import { getPlanLimits, canStartSession, canUseModel } from './plan-config';

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
  keyId?: string; // API key ID for tracking usage per key
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
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      subscriptionPlan: true,
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
  let quota = await prisma.user_quota.findFirst({
    where: { 
      userId,
      periodEnd: { gt: new Date() }
    },
    orderBy: { periodStart: 'desc' }
  });
  
  if (!quota) {
    quota = await prisma.user_quota.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        sessionsPerDay: planLimits.sessionsPerDay || 5,
        sessionsUsedToday: 0,
        tokensPerSession: planLimits.tokensPerMonth ? Math.floor(planLimits.tokensPerMonth / 30) : 10000,
        requestsLimit: planLimits.monthlyRequests,
        requestsUsed: 0,
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        lastResetAt: new Date(),
        updatedAt: new Date()
      },
    });
  }

  // Check if period has expired and needs reset
  if (quota.periodEnd < new Date()) {
    quota = await resetQuota(userId, planLimits.monthlyRequests, planLimits.tokensPerMonth);
  }

  // Check if user can start a new session (using sessions instead of requests)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const sessionsToday = await prisma.usage_records.count({
    where: {
      userId,
      timestamp: { gte: today },
      requestType: 'cli',
    },
  });

  const sessionCheck = canStartSession(
    user.subscriptionPlan,
    sessionsToday
  );

  if (!sessionCheck.allowed) {
    return {
      allowed: false,
      remaining: 0,
      limit: planLimits.sessionsPerDay,
      used: sessionsToday,
      resetDate: quota.periodEnd,
      reason: sessionCheck.reason,
      upgradeRequired: sessionCheck.upgradeRequired,
    };
  }

  const remaining = planLimits.sessionsPerDay === -1 
    ? -1 
    : planLimits.sessionsPerDay - sessionsToday;

  return {
    allowed: true,
    remaining,
    limit: planLimits.sessionsPerDay,
    used: sessionsToday,
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
  await prisma.usage_records.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      type: requestType,
      requestType,
      model: metadata.modelUsed,
      provider: metadata.provider,
      platform: metadata.platform || 'web',
      tokens: metadata.tokensUsed,
      cost: metadata.cost,
      duration: metadata.duration,
      success: metadata.success ?? true,
      timestamp: new Date(),
      metadata: {
        endpoint: metadata.endpoint,
        method: metadata.method,
        statusCode: metadata.statusCode,
        sessionId: sessionId, // Store sessionId in metadata instead
        errorMessage: metadata.errorMessage,
      }
    },
  });

  // Update quota
  const quota = await prisma.user_quota.findFirst({
    where: {
      userId,
      periodEnd: { gt: new Date() },
    },
    orderBy: { periodStart: 'desc' },
  });

  if (quota) {
    await prisma.user_quota.update({
      where: { id: quota.id },
      data: {
        requestsUsed: { increment: 1 },
        // Note: Using requestsUsed as a proxy for tokens since schema doesn't have tokensUsed
        // costThisPeriod field doesn't exist in schema - tracking cost separately
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
  await prisma.user_quota.updateMany({
    where: {
      userId,
      periodEnd: { lt: new Date() },
    },
    data: {
      updatedAt: new Date(),
    },
  });

  // Create new quota period
  return prisma.user_quota.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      sessionsPerDay: 5,
      sessionsUsedToday: 0,
      tokensPerSession: tokensLimit,
      requestsLimit,
      requestsUsed: 0,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      lastResetAt: new Date(),
      updatedAt: new Date()
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

  const records = await prisma.usage_records.findMany({
    where,
    select: {
      requestType: true,
      tokens: true, // Use 'tokens' instead of 'tokensUsed'
      cost: true,
      model: true, // Use 'model' instead of 'modelUsed'
    },
  });

  const totalRequests = records.length;
  const totalTokens = records.reduce((sum, r) => sum + (r.tokens || 0), 0);
  const totalCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);

  const requestsByType: Record<string, number> = {};
  const requestsByModel: Record<string, number> = {};

  records.forEach(record => {
    requestsByType[record.requestType] = (requestsByType[record.requestType] || 0) + 1;
    if (record.model) {
      requestsByModel[record.model] = (requestsByModel[record.model] || 0) + 1;
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
  const quota = await prisma.user_quota.findFirst({
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
    
  const tokensLimit = quota.tokensPerSession;
  const tokensUsed = quota.requestsUsed; // Using requests as proxy for tokens
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
    cost: 0, // Cost tracking not implemented yet
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
  await prisma.usage_records.createMany({
    data: records.map(record => ({
      id: `usage_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 9)}`,
      userId: record.userId,
      type: 'usage',
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

/**
 * Track usage for an API key request
 * @param userId The user's ID
 * @param keyId The API key ID that was used
 * @param metadata Usage metadata
 */
export async function trackApiKeyUsage(
  userId: string,
  keyId: string,
  metadata: Omit<UsageMetadata, 'keyId'>
): Promise<void> {
  await trackUsage(userId, null, 'api', {
    ...metadata,
    keyId, // Include keyId in metadata for tracking
  });
}

/**
 * Get usage statistics for a specific API key
 * @param userId The user's ID
 * @param keyId The API key ID
 * @param startDate Optional start date
 * @param endDate Optional end date
 */
export async function getApiKeyUsageStats(
  userId: string,
  keyId: string,
  startDate?: Date,
  endDate?: Date
): Promise<{
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  lastUsed: Date | null;
  averageTokensPerRequest: number;
  averageCostPerRequest: number;
}> {
  const where: any = {
    userId,
    metadata: {
      path: ['keyId'],
      equals: keyId,
    },
  };

  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp.gte = startDate;
    if (endDate) where.timestamp.lte = endDate;
  }

  const records = await prisma.usage_records.findMany({
    where,
    select: {
      tokensUsed: true,
      cost: true,
      timestamp: true,
    },
    orderBy: {
      timestamp: 'desc',
    },
  });

  const totalRequests = records.length;
  const totalTokens = records.reduce((sum, r) => sum + (r.tokensUsed || 0), 0);
  const totalCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);

  return {
    totalRequests,
    totalTokens,
    totalCost,
    lastUsed: records.length > 0 ? records[0].timestamp : null,
    averageTokensPerRequest: totalRequests > 0 ? totalTokens / totalRequests : 0,
    averageCostPerRequest: totalRequests > 0 ? totalCost / totalRequests : 0,
  };
}
