/**
 * API Key Management
 *
 * Handles generation, validation, storage, and tracking of API keys.
 * Keys are stored with cryptographic hashes - the plain text key is only
 * shown once upon creation and cannot be recovered.
 */
import type { ApiKey, ApiKeyInfo, ApiKeyScope, ApiKeyTier, CreateApiKeyRequest, CreateApiKeyResponse } from './types.js';
/**
 * Create a new API key
 *
 * @param userId - User ID who owns the key
 * @param request - Key creation request
 * @returns The full key (shown only once) and key info
 */
export declare function createApiKey(userId: string, request: CreateApiKeyRequest): CreateApiKeyResponse;
/**
 * Validate an API key and return the key record
 *
 * @param key - The full API key
 * @returns The API key record or null if invalid
 */
export declare function validateApiKey(key: string): ApiKey | null;
/**
 * Check if API key has required scope
 */
export declare function hasScope(apiKey: ApiKey, requiredScope: ApiKeyScope): boolean;
/**
 * Check if API key has any of the required scopes
 */
export declare function hasAnyScope(apiKey: ApiKey, requiredScopes: ApiKeyScope[]): boolean;
/**
 * Check if request IP is allowed for key
 */
export declare function isIpAllowed(apiKey: ApiKey, ip: string): boolean;
/**
 * Get API key by ID
 */
export declare function getApiKey(keyId: string): ApiKey | null;
/**
 * Get API key info by ID (safe to return to user)
 */
export declare function getApiKeyInfo(keyId: string): ApiKeyInfo | null;
/**
 * List all API keys for a user
 */
export declare function listUserApiKeys(userId: string): ApiKeyInfo[];
/**
 * Revoke an API key
 */
export declare function revokeApiKey(keyId: string, userId: string): boolean;
/**
 * Delete an API key permanently
 */
export declare function deleteApiKey(keyId: string, userId: string): boolean;
/**
 * Update API key tier (for billing)
 */
export declare function updateApiKeyTier(keyId: string, tier: ApiKeyTier): boolean;
/**
 * Update API key scopes
 */
export declare function updateApiKeyScopes(keyId: string, userId: string, scopes: ApiKeyScope[]): boolean;
/**
 * Update API key name
 */
export declare function updateApiKeyName(keyId: string, userId: string, name: string): boolean;
/**
 * Track API key usage
 */
export declare function trackUsage(keyId: string): {
    minuteCount: number;
    hourCount: number;
    dayCount: number;
};
/**
 * Get current usage for a key
 */
export declare function getUsage(keyId: string): {
    minuteCount: number;
    minuteReset: number;
    hourCount: number;
    hourReset: number;
    dayCount: number;
    dayReset: number;
} | null;
export declare function addSandboxToKey(keyId: string, sandboxId: string): void;
export declare function removeSandboxFromKey(keyId: string, sandboxId: string): void;
export declare function getActiveSandboxCount(keyId: string): number;
export declare function getActiveSandboxIds(keyId: string): string[];
/**
 * Get API keys statistics
 */
export declare function getApiKeyStats(): {
    totalKeys: number;
    activeKeys: number;
    keysByTier: Record<ApiKeyTier, number>;
    keysByEnvironment: Record<string, number>;
};
export declare const _testing: {
    apiKeys: Map<string, ApiKey>;
    keysByHash: Map<string, string>;
    keysByUser: Map<string, Set<string>>;
    usageTracking: Map<string, {
        minuteCount: number;
        minuteReset: number;
        hourCount: number;
        hourReset: number;
        dayCount: number;
        dayReset: number;
    }>;
    clearAll: () => void;
};
