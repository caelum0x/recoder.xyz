/**
 * Usage Service - API Key Routing and Management
 * Determines which API key to use based on user tier
 * Handles free (user's key) vs premium (platform keys) routing
 */

import { prisma } from './prisma';
import { getPlanLimits } from './plan-config';
import crypto from 'crypto';

export interface ApiKeyInfo {
  apiKey: string;
  source: 'user' | 'platform';
  tier: string;
  keyId?: string;
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
 * Get appropriate API key for user based on their tier
 * Free users: Use their own OpenRouter key
 * Premium users (Pro/Enterprise): Use platform's rotating keys
 *
 * @param userId The user's ID
 * @returns API key information or null if none available
 */
export async function getApiKeyForUser(userId: string): Promise<ApiKeyInfo | null> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      subscriptionPlan: true,
      subscriptionStatus: true,
      openRouterApiKey: true,
      hasOwnApiKey: true,
      apiKeyEncrypted: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Free users must use their own API key
  if (user.subscriptionPlan === 'free') {
    if (!user.hasOwnApiKey || !user.openRouterApiKey) {
      return null; // User needs to add their API key
    }

    return {
      apiKey: user.openRouterApiKey,
      source: 'user',
      tier: 'free',
    };
  }

  // Premium users (Pro/Enterprise) use platform keys
  if (
    (user.subscriptionPlan === 'pro' || user.subscriptionPlan === 'enterprise') &&
    user.subscriptionStatus === 'active'
  ) {
    // Get platform key for their tier
    const platformKey = await getPlatformApiKey(user.subscriptionPlan);

    if (!platformKey) {
      // Fallback to user's key if they have one
      if (user.hasOwnApiKey && user.openRouterApiKey) {
        return {
          apiKey: user.openRouterApiKey,
          source: 'user',
          tier: user.subscriptionPlan,
        };
      }

      throw new Error('No platform API key available for premium tier');
    }

    return {
      apiKey: platformKey.keyEncrypted,
      source: 'platform',
      tier: user.subscriptionPlan,
      keyId: platformKey.id,
    };
  }

  // Inactive subscription - try to use user's key if available
  if (user.hasOwnApiKey && user.openRouterApiKey) {
    return {
      apiKey: user.openRouterApiKey,
      source: 'user',
      tier: user.subscriptionPlan,
    };
  }

  return null;
}

/**
 * Get platform API key for a specific tier
 * Implements simple round-robin selection and updates last used time
 *
 * @param tier The subscription tier (pro or enterprise)
 * @returns Platform API key or null
 */
async function getPlatformApiKey(tier: string): Promise<any | null> {
  // Get all active keys, ordered by least recently used
  // Note: tier field doesn't exist in platform_api_keys schema
  const keys = await prisma.platform_api_keys.findMany({
    where: {
      isActive: true,
    },
    orderBy: {
      lastUsedAt: 'asc', // Least recently used first
    },
    take: 1,
  });

  if (keys.length === 0) {
    return null;
  }

  const selectedKey = keys[0];

  // Update last used timestamp
  await prisma.platform_api_keys.update({
    where: { id: selectedKey.id },
    data: {
      lastUsedAt: new Date(),
      quotaUsed: { increment: 1 },
    },
  });

  return selectedKey;
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
      hasApiKey: user.hasOwnApiKey || user.subscriptionPlan !== 'free',
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
    hasApiKey: user.hasOwnApiKey || user.subscriptionPlan !== 'free',
  };
}
