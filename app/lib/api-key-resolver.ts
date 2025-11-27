/**
 * API Key Resolution Logic
 * Determines which API key to use based on user's plan
 * - Free users: Must provide their own OpenRouter API key
 * - Pro/Enterprise: Use platform's API key pool
 */

import { prisma } from './prisma';
import { decryptApiKey } from './crypto';
import { getPlanLimits } from './plan-config';

export interface ResolvedApiKey {
  apiKey: string;
  source: 'user' | 'platform';
  provider: string;
  keyId?: string;
}

export class ApiKeyResolverError extends Error {
  constructor(
    message: string,
    public code: 'NO_API_KEY' | 'INVALID_API_KEY' | 'QUOTA_EXCEEDED' | 'PLAN_UPGRADE_REQUIRED',
    public upgradeRequired: boolean = false
  ) {
    super(message);
    this.name = 'ApiKeyResolverError';
  }
}

/**
 * Resolve which API key to use for a user
 * @param userId The user's ID
 * @param provider The AI provider (default: 'openrouter')
 * @returns The API key to use and its source
 */
export async function resolveApiKey(
  userId: string,
  provider: string = 'openrouter'
): Promise<ResolvedApiKey> {
  // Get user and their plan
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      subscriptionPlan: true,
      subscriptionStatus: true,
      openRouterApiKey: true,
      hasOwnApiKey: true,
      apiKeyEncrypted: true,
    },
  });

  if (!user) {
    throw new ApiKeyResolverError(
      'User not found',
      'INVALID_API_KEY',
      false
    );
  }

  // Check subscription status
  if (user.subscriptionStatus !== 'active') {
    throw new ApiKeyResolverError(
      'Subscription is not active. Please update your payment method.',
      'PLAN_UPGRADE_REQUIRED',
      true
    );
  }

  const planLimits = getPlanLimits(user.subscriptionPlan);

  // FREE USERS: Must provide their own API key
  if (planLimits.requiresOwnApiKey) {
    if (!user.openRouterApiKey || !user.hasOwnApiKey) {
      throw new ApiKeyResolverError(
        'Free plan requires your own OpenRouter API key. Please add one at https://recoder.xyz/settings/api-keys',
        'NO_API_KEY',
        true
      );
    }

    // Decrypt user's API key
    let apiKey: string;
    try {
      apiKey = user.apiKeyEncrypted 
        ? decryptApiKey(user.openRouterApiKey)
        : user.openRouterApiKey;
    } catch (error) {
      throw new ApiKeyResolverError(
        'Failed to decrypt API key. Please re-add your key.',
        'INVALID_API_KEY',
        false
      );
    }

    return {
      apiKey,
      source: 'user',
      provider: 'openrouter',
    };
  }

  // PRO/ENTERPRISE: Use platform's API key pool
  const platformKey = await getPlatformApiKey(provider);
  
  return {
    apiKey: platformKey.apiKey,
    source: 'platform',
    provider,
    keyId: platformKey.keyId,
  };
}

/**
 * Get a platform API key from the pool with load balancing
 * @param provider The AI provider
 * @returns Decrypted API key
 */
async function getPlatformApiKey(provider: string = 'openrouter'): Promise<{
  apiKey: string;
  keyId: string;
}> {
  // Get all active platform keys for the provider
  const keys = await prisma.platform_api_keys.findMany({
    where: {
      provider,
      isActive: true,
    },
    orderBy: [
      { quotaUsed: 'asc' },  // Less used keys first
      { lastUsedAt: 'asc' }, // Least recently used first
    ],
  });

  if (keys.length === 0) {
    // Fallback to environment variable
    const envKey = process.env.OPENROUTER_API_KEY;
    if (envKey) {
      console.warn('⚠️  Using environment OPENROUTER_API_KEY as fallback');
      return {
        apiKey: envKey,
        keyId: 'env_fallback',
      };
    }

    throw new ApiKeyResolverError(
      'No platform API keys available. Please contact support.',
      'INVALID_API_KEY',
      false
    );
  }

  // Select key with load balancing (lowest usage)
  const selectedKey = keys[0];

  // Simple quota check - if quotaUsed is very high, try next key
  if (selectedKey.quotaUsed && selectedKey.quotaUsed >= 10000) {
    // Try next key
    const nextKey = keys.find(k => (k.quotaUsed || 0) < 10000);
    if (!nextKey) {
      throw new ApiKeyResolverError(
        'All platform API keys have reached their quota. Please try again later.',
        'QUOTA_EXCEEDED',
        false
      );
    }
    
    // Update last used time
    await prisma.platform_api_keys.update({
      where: { id: nextKey.id },
      data: { 
        lastUsedAt: new Date(),
        quotaUsed: { increment: 1 },
      },
    });

    return {
      apiKey: decryptApiKey(nextKey.keyEncrypted),
      keyId: nextKey.id,
    };
  }

  // Update usage and last used time
  await prisma.platform_api_keys.update({
    where: { id: selectedKey.id },
    data: { 
      lastUsedAt: new Date(),
      quotaUsed: { increment: 1 },
    },
  });

  return {
    apiKey: decryptApiKey(selectedKey.keyEncrypted),
    keyId: selectedKey.id,
  };
}

/**
 * Validate that a user's API key works
 * @param apiKey The API key to validate
 * @param provider The AI provider
 * @returns True if key is valid
 */
export async function validateUserApiKey(
  apiKey: string,
  provider: string = 'openrouter'
): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey || apiKey.trim().length === 0) {
    return { valid: false, error: 'API key is empty' };
  }

  // For OpenRouter, keys should start with 'sk-or-v1-'
  if (provider === 'openrouter' && !apiKey.startsWith('sk-or-v1-')) {
    return { 
      valid: false, 
      error: 'OpenRouter API keys must start with "sk-or-v1-"' 
    };
  }

  try {
    // Make a lightweight API call to validate the key
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 401) {
      return { valid: false, error: 'Invalid API key' };
    }

    if (response.status === 403) {
      return { valid: false, error: 'API key lacks required permissions' };
    }

    return { 
      valid: false, 
      error: `API validation failed: ${response.statusText}` 
    };
  } catch (error) {
    return { 
      valid: false, 
      error: `Failed to validate API key: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

/**
 * Check if user needs to provide an API key
 * @param userId The user's ID
 * @returns True if user needs to add their API key
 */
export async function needsApiKey(userId: string): Promise<boolean> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      subscriptionPlan: true,
      hasOwnApiKey: true,
    },
  });

  if (!user) {
    return false;
  }

  const planLimits = getPlanLimits(user.subscriptionPlan);
  return planLimits.requiresOwnApiKey && !user.hasOwnApiKey;
}

/**
 * Get API key status for a user
 * @param userId The user's ID
 * @returns Status information
 */
export async function getApiKeyStatus(userId: string): Promise<{
  hasApiKey: boolean;
  source: 'user' | 'platform' | 'none';
  requiresApiKey: boolean;
  keyMasked?: string;
}> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      subscriptionPlan: true,
      hasOwnApiKey: true,
      openRouterApiKey: true,
    },
  });

  if (!user) {
    return {
      hasApiKey: false,
      source: 'none',
      requiresApiKey: true,
    };
  }

  const planLimits = getPlanLimits(user.subscriptionPlan);
  
  if (planLimits.requiresOwnApiKey) {
    const hasKey = user.hasOwnApiKey && !!user.openRouterApiKey;
    return {
      hasApiKey: hasKey,
      source: hasKey ? 'user' : 'none',
      requiresApiKey: true,
      keyMasked: hasKey && user.openRouterApiKey 
        ? `sk-or-...${user.openRouterApiKey.slice(-4)}` 
        : undefined,
    };
  }

  return {
    hasApiKey: true,
    source: 'platform',
    requiresApiKey: false,
  };
}
