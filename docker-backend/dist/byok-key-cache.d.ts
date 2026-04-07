/**
 * Encrypted BYOK Key Cache
 *
 * When VAULT_MASTER_KEY is set, caches fetched BYOK keys encrypted at rest
 * with AES-256-GCM via the shared VaultDriver. TTL: 5 minutes.
 * When no master key is set, caching is disabled (every call goes to HTTP).
 */
import type { AIProviderKeys } from './public-api/byok-provider-keys';
/**
 * Get cached BYOK keys for a user. Returns null on cache miss or if caching
 * is disabled (no VAULT_MASTER_KEY).
 */
export declare function getCachedKeys(userId: string): Promise<AIProviderKeys | null>;
/**
 * Store BYOK keys in the encrypted cache. No-op if VAULT_MASTER_KEY is not set.
 */
export declare function setCachedKeys(userId: string, keys: AIProviderKeys): Promise<void>;
/**
 * Invalidate a specific user's cached keys.
 */
export declare function invalidateCachedKeys(userId: string): void;
/**
 * Clear the entire cache.
 */
export declare function clearCache(): void;
