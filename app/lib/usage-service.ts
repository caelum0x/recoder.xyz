/**
 * Usage Service - API Key Routing and Management
 * BYOK-only beta: ALL users must provide their own API key.
 */

import { prisma } from './prisma';
import { getPlanLimits } from './plan-config';
import crypto from 'crypto';

export interface ApiKeyInfo {
  apiKey: string;
  source: 'user';
  tier: string;
}

export interface QuotaStatus {
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
  resetDate: Date;
  reason?: string;
  upgradeRequired?: boolean;
}

/**
 * Get API key for user — BYOK-only beta: all users must provide their own key.
 */
export async function getApiKeyForUser(userId: string): Promise<ApiKeyInfo | null> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      subscriptionPlan: true,
      openRouterApiKey: true,
      hasOwnApiKey: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (!user.hasOwnApiKey || !user.openRouterApiKey) {
    return null; // User needs to add their API key
  }

  return {
    apiKey: user.openRouterApiKey,
    source: 'user',
    tier: user.subscriptionPlan,
  };
}

/**
 * Check quota status for a user
 * Enforces tier-based limits
 *
 * @param userId The user's ID
 * @returns Quota status information
 */
export async function getQuotaStatus(userId: string): Promise<QuotaStatus> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      subscriptionPlan: true,
      quota: true,
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
  let quota = user.quota;
  if (!quota) {
    quota = await prisma.user_quota.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        requestsLimit: planLimits.monthlyRequests,
        requestsUsed: 0,
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });
  }

  // Check if quota exceeded
  const remaining = planLimits.monthlyRequests === -1
    ? -1 // Unlimited
    : Math.max(0, planLimits.monthlyRequests - quota.requestsUsed);

  const allowed = planLimits.monthlyRequests === -1 || quota.requestsUsed < planLimits.monthlyRequests;

  return {
    allowed,
    remaining,
    limit: planLimits.monthlyRequests,
    used: quota.requestsUsed,
    resetDate: quota.periodEnd,
    reason: allowed ? undefined : 'Monthly quota exceeded',
    upgradeRequired: !allowed && user.subscriptionPlan === 'free',
  };
}

/**
 * Check if user can make a request
 * Combines quota check with API key availability
 *
 * @param userId The user's ID
 * @returns Object with allowed status and reason
 */
export async function canMakeRequest(
  userId: string
): Promise<{ allowed: boolean; reason?: string; apiKey?: string }> {
  // Check quota first
  const quotaStatus = await getQuotaStatus(userId);
  if (!quotaStatus.allowed) {
    return {
      allowed: false,
      reason: quotaStatus.reason || 'Quota exceeded',
    };
  }

  // Get API key
  const apiKeyInfo = await getApiKeyForUser(userId);
  if (!apiKeyInfo) {
    return {
      allowed: false,
      reason: 'No API key configured. Please add your OpenRouter API key.',
    };
  }

  return {
    allowed: true,
    apiKey: apiKeyInfo.apiKey,
  };
}

/**
 * Track usage after a successful request
 * Updates quota and usage records
 *
 * @param userId The user's ID
 * @param metadata Request metadata (tokens, cost, model, etc.)
 */
export async function trackUsageEvent(
  userId: string,
  metadata: {
    modelUsed?: string;
    tokensUsed?: number;
    cost?: number;
    duration?: number;
    success?: boolean;
    errorMessage?: string;
  }
): Promise<void> {
  // Record usage
  await prisma.usage_records.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      type: 'api_request',
      requestType: 'api',
      model: metadata.modelUsed,
      tokensUsed: metadata.tokensUsed || 0,
      cost: metadata.cost || 0,
      duration: metadata.duration || 0,
      success: metadata.success ?? true,
      metadata: metadata as any,
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
        updatedAt: new Date(),
      },
    });
  }
}

/**
 * Get usage summary for dashboard
 *
 * @param userId The user's ID
 * @returns Usage summary with percentages
 */
export async function getUsageSummary(userId: string): Promise<{
  requests: { used: number; limit: number; percentage: number };
  tokens: { used: number; limit: number; percentage: number };
  cost: number;
  periodEnd: Date;
  tier: string;
  hasApiKey: boolean;
}> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      subscriptionPlan: true,
      hasOwnApiKey: true,
      quota: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const planLimits = getPlanLimits(user.subscriptionPlan);
  const quota = user.quota;

  if (!quota) {
    return {
      requests: { used: 0, limit: planLimits.monthlyRequests, percentage: 0 },
      tokens: { used: 0, limit: planLimits.tokensPerMonth, percentage: 0 },
      cost: 0,
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      tier: user.subscriptionPlan,
      hasApiKey: !!user.hasOwnApiKey,
    };
  }

  const requestsPercentage =
    planLimits.monthlyRequests === -1
      ? 0
      : (quota.requestsUsed / planLimits.monthlyRequests) * 100;

  // Note: tokensUsed and costThisPeriod fields don't exist in current schema
  // Using 0 as placeholder
  const tokensUsed = 0;
  const tokensPercentage = 0;

  return {
    requests: {
      used: quota.requestsUsed,
      limit: planLimits.monthlyRequests,
      percentage: requestsPercentage,
    },
    tokens: {
      used: tokensUsed,
      limit: planLimits.tokensPerMonth,
      percentage: tokensPercentage,
    },
    cost: 0,
    periodEnd: quota.periodEnd,
    tier: user.subscriptionPlan,
    hasApiKey: !!user.hasOwnApiKey,
  };
}
