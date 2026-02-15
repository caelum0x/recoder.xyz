/**
 * Encrypted BYOK Key Cache
 *
 * When VAULT_MASTER_KEY is set, caches fetched BYOK keys encrypted at rest
 * with AES-256-GCM via the shared VaultDriver. TTL: 5 minutes.
 * When no master key is set, caching is disabled (every call goes to HTTP).
 */

import { getVaultDriver } from './vault';
import type { AIProviderKeys } from './public-api/byok-provider-keys';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  encrypted: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Get cached BYOK keys for a user. Returns null on cache miss or if caching
 * is disabled (no VAULT_MASTER_KEY).
 */
export async function getCachedKeys(userId: string): Promise<AIProviderKeys | null> {
  const driver = getVaultDriver();
  if (!driver) return null;

  const entry = cache.get(userId);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(userId);
    return null;
  }

  try {
    return JSON.parse(await driver.decrypt(entry.encrypted));
  } catch {
    cache.delete(userId);
    return null;
  }
}

/**
 * Store BYOK keys in the encrypted cache. No-op if VAULT_MASTER_KEY is not set.
 */
export async function setCachedKeys(userId: string, keys: AIProviderKeys): Promise<void> {
  const driver = getVaultDriver();
  if (!driver) return;

  cache.set(userId, {
    encrypted: await driver.encrypt(JSON.stringify(keys)),
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Invalidate a specific user's cached keys.
 */
export function invalidateCachedKeys(userId: string): void {
  cache.delete(userId);
}

/**
 * Clear the entire cache.
 */
export function clearCache(): void {
  cache.clear();
}
