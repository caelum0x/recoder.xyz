/**
 * Usage Service - API Key Routing and Management
 * Users must provide their own API key (BYOK).
 */

import { prisma } from './prisma';
import { getPlanLimits, FREE_MODELS } from './plan-config';
import crypto from 'crypto';
import { ensureCommercialQuota } from '@/lib/commercial-quota';

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
 * Check if a model is a free-tier model ($0 cost on OpenRouter).
 */
export function isFreeModel(model: string): boolean {
  // Exact match or match without :free suffix
  return FREE_MODELS.some(fm =>
    model === fm || model === fm.replace(':free', '') || fm.startsWith(model)
  );
}

/**
 * Get the free-tier variant of a model ID (appends :free if needed).
 */
export function toFreeModelId(model: string): string {
  if (model.endsWith(':free')) return model;
  const freeVariant = FREE_MODELS.find(fm => fm.startsWith(model));
  return freeVariant || model;
}

/**
 * Get API key for user.
 * BYOK-only: only the user's stored key is allowed.
 */
export async function getApiKeyForUser(userId: string, model?: string): Promise<ApiKeyInfo | null> {
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

  if (user.hasOwnApiKey && user.openRouterApiKey) {
    return {
      apiKey: user.openRouterApiKey,
      source: 'user',
      tier: user.subscriptionPlan,
    };
  }

  return null; // No key available
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

  const quota = await ensureCommercialQuota(userId, user.subscriptionPlan, 'month');

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
 * Combines quota check with BYOK key availability
 *
 * @param userId The user's ID
 * @returns Object with allowed status and reason
 */
export async function canMakeRequest(
  userId: string,
  model?: string
): Promise<{ allowed: boolean; reason?: string; apiKey?: string; keySource?: 'user' | 'platform'; model?: string }> {
  // Check quota first
  const quotaStatus = await getQuotaStatus(userId);
  if (!quotaStatus.allowed) {
    return {
      allowed: false,
      reason: quotaStatus.reason || 'Quota exceeded',
    };
  }

  // Get API key (BYOK only)
  const apiKeyInfo = await getApiKeyForUser(userId, model);
  if (!apiKeyInfo) {
    return {
      allowed: false,
      reason: 'No BYOK API key configured. Add your provider key in Settings.',
    };
  }

  return {
    allowed: true,
    apiKey: apiKeyInfo.apiKey,
    keySource: 'user',
    model,
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
  const quota = user.quota ?? await ensureCommercialQuota(userId, user.subscriptionPlan, 'month');

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

  // Aggregate real token usage and cost from usage_records for the current billing period
  let tokensUsed = 0;
  let totalCost = 0;
  try {
    const usageAgg = await prisma.usage_records.aggregate({
      where: {
        userId,
        timestamp: { gte: quota.periodStart },
      },
      _sum: {
        tokensUsed: true,
        cost: true,
      },
    });
    tokensUsed = usageAgg._sum.tokensUsed ?? 0;
    totalCost = usageAgg._sum.cost ?? 0;
  } catch {
    // Fall back to zeros if aggregation fails
    tokensUsed = 0;
    totalCost = 0;
  }

  // If no recorded cost but tokens were used, estimate at a rough free-tier rate
  if (totalCost === 0 && tokensUsed > 0) {
    totalCost = (tokensUsed / 1000) * 0.002;
  }

  const tokensPercentage =
    planLimits.tokensPerMonth === -1 || planLimits.tokensPerMonth === 0
      ? 0
      : (tokensUsed / planLimits.tokensPerMonth) * 100;

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
    cost: totalCost,
    periodEnd: quota.periodEnd,
    tier: user.subscriptionPlan,
    hasApiKey: !!user.hasOwnApiKey,
  };
}
