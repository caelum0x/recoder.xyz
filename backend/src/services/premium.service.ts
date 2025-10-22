import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Generate API key with prefix
 */
function generateApiKey(prefix: string = 'rck'): { key: string; hash: string; keyPrefix: string } {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  const key = `${prefix}_live_${randomBytes}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const keyPrefix = `${prefix}_live_${randomBytes.substring(0, 8)}`;
  
  return { key, hash, keyPrefix };
}

/**
 * Get user's premium status
 */
export async function getPremiumStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      subscription: true,
      createdAt: true
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Get active subscription
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ['active', 'trialing'] }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Get subscription plan limits
  let limits = {
    monthlyRequests: 100,
    dailyRequests: 10,
    tokensPerRequest: 2000,
    modelsAvailable: ['claude-3-haiku', 'gpt-3.5-turbo'],
    features: ['basic-cli', 'web-interface'],
    costLimitUSD: 0
  };

  if (subscription) {
    const planLimits = await prisma.subscriptionPlanLimits.findUnique({
      where: { planId: subscription.planId }
    });
    
    if (planLimits) {
      limits = {
        monthlyRequests: planLimits.monthlyRequests,
        dailyRequests: planLimits.dailyRequests,
        tokensPerRequest: planLimits.tokensPerRequest,
        modelsAvailable: planLimits.modelsAvailable as string[],
        features: planLimits.features as string[],
        costLimitUSD: parseFloat(planLimits.costLimitUSD.toString())
      };
    }
  }

  // Get usage for current period
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const monthlyUsage = await prisma.usageRecord.count({
    where: {
      userId,
      timestamp: { gte: monthStart }
    }
  });

  const dailyUsage = await prisma.usageRecord.count({
    where: {
      userId,
      timestamp: { gte: dayStart }
    }
  });

  // Get total cost
  const totalCost = await prisma.usageRecord.aggregate({
    where: {
      userId,
      timestamp: { gte: monthStart }
    },
    _sum: {
      cost: true
    }
  });

  // Get API keys count
  const apiKeysCount = await prisma.apiKey.count({
    where: {
      userId,
      isActive: true
    }
  });

  // Get actual API keys (without full key, only metadata)
  const apiKeys = await prisma.apiKey.findMany({
    where: {
      userId,
      isActive: true
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      permissions: true,
      lastUsedAt: true,
      createdAt: true,
      expiresAt: true,
      isActive: true,
      usageCount: true,
      source: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  // Get CLI sessions count
  const cliSessionsCount = await prisma.cLISession.count({
    where: {
      userId,
      status: 'authorized'
    }
  });

  // Get actual CLI sessions
  const cliSessions = await prisma.cLISession.findMany({
    where: {
      userId,
      status: { in: ['authorized', 'pending'] }
    },
    select: {
      id: true,
      deviceInfo: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      status: true
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 20 // Limit to recent 20 sessions
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      subscription: user.subscription,
      memberSince: user.createdAt
    },
    subscription: {
      plan: user.subscription,
      status: subscription?.status || 'inactive',
      currentPeriodStart: subscription?.currentPeriodStart,
      currentPeriodEnd: subscription?.currentPeriodEnd,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd || false,
      limits: {
        ...limits,
        maxApiKeys: user.subscription === 'pro' ? 10 : user.subscription === 'enterprise' ? -1 : 1
      }
    },
    limits,
    usage: {
      monthly: {
        requests: monthlyUsage,
        limit: limits.monthlyRequests,
        percentage: limits.monthlyRequests > 0 
          ? Math.round((monthlyUsage / limits.monthlyRequests) * 100)
          : 0
      },
      daily: {
        requests: dailyUsage,
        limit: limits.dailyRequests,
        percentage: limits.dailyRequests > 0
          ? Math.round((dailyUsage / limits.dailyRequests) * 100)
          : 0
      },
      cost: {
        current: totalCost._sum.cost || 0,
        limit: limits.costLimitUSD
      }
    },
    resources: {
      apiKeys: apiKeysCount,
      cliSessions: cliSessionsCount
    },
    apiKeys,
    cliSessions
  };
}

/**
 * Generate new API key for user
 */
export async function generateUserApiKey(userId: string, name: string, permissions: string[] = []) {
  // Check user's subscription
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Get limits based on subscription
  let maxApiKeys = 1; // Free plan default
  if (user.subscription === 'pro') {
    maxApiKeys = 10;
  } else if (user.subscription === 'enterprise') {
    maxApiKeys = -1; // Unlimited
  }

  // Check current API keys count
  if (maxApiKeys > 0) {
    const currentCount = await prisma.apiKey.count({
      where: {
        userId,
        isActive: true
      }
    });

    if (currentCount >= maxApiKeys) {
      throw new Error(`Maximum API keys limit reached (${maxApiKeys})`);
    }
  }

  // Generate API key
  const { key, hash, keyPrefix } = generateApiKey();

  // Create API key record
  const apiKey = await prisma.apiKey.create({
    data: {
      name,
      keyPrefix,
      keyHash: hash,
      permissions,
      userId,
      source: 'web',
      isActive: true
    }
  });

  return {
    id: apiKey.id,
    name: apiKey.name,
    key, // Only returned once
    keyPrefix: apiKey.keyPrefix,
    permissions: apiKey.permissions,
    createdAt: apiKey.createdAt
  };
}

/**
 * List user's API keys
 */
export async function listUserApiKeys(userId: string) {
  const apiKeys = await prisma.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      permissions: true,
      source: true,
      isActive: true,
      lastUsedAt: true,
      usageCount: true,
      createdAt: true,
      expiresAt: true,
      rateLimitDaily: true,
      rateLimitMonthly: true
    }
  });

  return apiKeys;
}

/**
 * Revoke API key
 */
export async function revokeApiKey(keyId: string, userId: string) {
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      id: keyId,
      userId
    }
  });

  if (!apiKey) {
    throw new Error('API key not found');
  }

  await prisma.apiKey.update({
    where: { id: keyId },
    data: { isActive: false }
  });

  return { success: true };
}

/**
 * Delete API key
 */
export async function deleteApiKey(keyId: string, userId: string) {
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      id: keyId,
      userId
    }
  });

  if (!apiKey) {
    throw new Error('API key not found');
  }

  await prisma.apiKey.delete({
    where: { id: keyId }
  });

  return { success: true };
}

/**
 * Check if user has access to feature
 */
export async function checkFeatureAccess(userId: string, feature: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    return false;
  }

  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ['active', 'trialing'] }
    }
  });

  if (!subscription) {
    // Free tier features
    const freeFeatures = ['basic-cli', 'web-interface', 'basic-models'];
    return freeFeatures.includes(feature);
  }

  const planLimits = await prisma.subscriptionPlanLimits.findUnique({
    where: { planId: subscription.planId }
  });

  if (!planLimits) {
    return false;
  }

  const features = planLimits.features as string[];
  return features.includes(feature) || features.includes('all');
}

/**
 * Check rate limits
 */
export async function checkRateLimit(userId: string): Promise<{
  allowed: boolean;
  dailyRemaining: number;
  monthlyRemaining: number;
  resetDaily: Date;
  resetMonthly: Date;
}> {
  const status = await getPremiumStatus(userId);

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(1);
  nextMonth.setHours(0, 0, 0, 0);

  const dailyRemaining = Math.max(0, status.limits.dailyRequests - status.usage.daily.requests);
  const monthlyRemaining = Math.max(0, status.limits.monthlyRequests - status.usage.monthly.requests);

  return {
    allowed: dailyRemaining > 0 && monthlyRemaining > 0,
    dailyRemaining,
    monthlyRemaining,
    resetDaily: tomorrow,
    resetMonthly: nextMonth
  };
}

/**
 * Get available models for user
 */
export async function getAvailableModels(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    return [];
  }

  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ['active', 'trialing'] }
    }
  });

  if (!subscription) {
    // Free tier models
    return ['claude-3-haiku', 'gpt-3.5-turbo', 'gemini-flash'];
  }

  const planLimits = await prisma.subscriptionPlanLimits.findUnique({
    where: { planId: subscription.planId }
  });

  if (!planLimits) {
    return ['claude-3-haiku', 'gpt-3.5-turbo', 'gemini-flash'];
  }

  const models = planLimits.modelsAvailable as string[];
  
  // If 'all' is included, return all available models
  if (models.includes('all')) {
    return [
      'claude-3-opus',
      'claude-3-sonnet',
      'claude-3-haiku',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'gemini-pro',
      'gemini-flash',
      'groq-llama',
      'groq-mixtral'
    ];
  }

  return models;
}

/**
 * Upgrade subscription
 */
export async function upgradeSubscription(userId: string, newPlanId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Get the new plan
  const newPlan = await prisma.subscriptionPlan.findUnique({
    where: { id: newPlanId }
  });

  if (!newPlan) {
    throw new Error('Plan not found');
  }

  // Get current subscription
  const currentSubscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ['active', 'trialing'] }
    }
  });

  if (currentSubscription) {
    // Update existing subscription
    await prisma.subscription.update({
      where: { id: currentSubscription.id },
      data: {
        planId: newPlanId,
        updatedAt: new Date()
      }
    });
  } else {
    // Create new subscription
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await prisma.subscription.create({
      data: {
        userId,
        planId: newPlanId,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd
      }
    });
  }

  // Update user subscription field
  await prisma.user.update({
    where: { id: userId },
    data: { subscription: newPlanId }
  });

  return { success: true };
}
