/**
 * API Key Resolution Logic
 * BYOK-only beta: ALL users must provide their own API key.
 * No platform key pool is available during beta.
 */

import { prisma } from './prisma';
import { decryptApiKey } from './crypto';
import { logger } from '@/lib/logger';

export interface ResolvedApiKey {
  apiKey: string;
  source: 'user';
  provider: string;
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
 * Resolve which API key to use for a user.
 * In BYOK-only beta, all users must provide their own key.
 */
export async function resolveApiKey(
  userId: string,
  provider: string = 'openrouter'
): Promise<ResolvedApiKey> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
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

  // BYOK-only beta: ALL users must provide their own API key
  if (!user.openRouterApiKey || !user.hasOwnApiKey) {
    throw new ApiKeyResolverError(
      'Recoder.xyz requires your own API key during beta. Please add one at https://recoder.xyz/settings/ai-providers',
      'NO_API_KEY',
      false
    );
  }

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
 * Check if user needs to provide an API key.
 * In BYOK-only beta, all users need a key.
 */
export async function needsApiKey(userId: string): Promise<boolean> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      hasOwnApiKey: true,
    },
  });

  if (!user) {
    return true;
  }

  return !user.hasOwnApiKey;
}

/**
 * Get API key status for a user.
 * In BYOK-only beta, all users must bring their own key.
 */
export async function getApiKeyStatus(userId: string): Promise<{
  hasApiKey: boolean;
  source: 'user' | 'none';
  requiresApiKey: boolean;
  keyMasked?: string;
}> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
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
