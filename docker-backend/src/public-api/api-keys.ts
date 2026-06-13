/**
 * API Key Management
 *
 * Handles generation, validation, storage, and tracking of API keys.
 * Keys are stored with cryptographic hashes - the plain text key is only
 * shown once upon creation and cannot be recovered.
 */

import crypto from 'crypto';
import type {
  ApiKey,
  ApiKeyInfo,
  ApiKeyScope,
  ApiKeyTier,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
} from './types.js';
import { loadStore, debouncedSave } from '../persistence.js';

// ==================== Configuration ====================

/**
 * Salt for key hashing - REQUIRED for production
 * SECURITY: Never use a hardcoded fallback salt in production
 */
let _keyHashSalt: string | null = null;
function getKeyHashSalt(): string {
  if (!_keyHashSalt) {
    const salt = process.env.API_KEY_HASH_SALT;
    if (!salt) {
      throw new Error('API_KEY_HASH_SALT environment variable must be set for API key security');
    }
    _keyHashSalt = salt;
  }
  return _keyHashSalt;
}

/**
 * Key prefix format: sk_{env}_{random}
 */
const KEY_PREFIX_LENGTH = 8;
const KEY_RANDOM_LENGTH = 32;

/**
 * Default expiration time (1 year)
 */
const DEFAULT_EXPIRATION_MS = 365 * 24 * 60 * 60 * 1000;

// ==================== Storage ====================

/**
 * Persistence helpers for API key storage
 */
interface ApiKeysStoreData {
  apiKeys: [string, ApiKey][];
  keysByHash: [string, string][];
  keysByUser: [string, string[]][];  // Set<string> serialized as string[]
}

function loadApiKeysStore(): ApiKeysStoreData {
  return loadStore<ApiKeysStoreData>('api-keys', {
    apiKeys: [],
    keysByHash: [],
    keysByUser: [],
  });
}

function saveApiKeysStore(): void {
  const data: ApiKeysStoreData = {
    apiKeys: Array.from(apiKeys.entries()),
    keysByHash: Array.from(keysByHash.entries()),
    keysByUser: Array.from(keysByUser.entries()).map(
      ([userId, keySet]) => [userId, Array.from(keySet)]
    ),
  };
  debouncedSave('api-keys', data);
}

// Load persisted data
const _stored = loadApiKeysStore();

/**
 * API key storage (initialized from persisted data)
 */
const apiKeys = new Map<string, ApiKey>(_stored.apiKeys);

/**
 * Index by hashed key for fast lookup during authentication
 */
const keysByHash = new Map<string, string>(_stored.keysByHash);

/**
 * Index by user ID for listing user's keys
 */
const keysByUser = new Map<string, Set<string>>(
  _stored.keysByUser.map(([userId, keyIds]) => [userId, new Set(keyIds)])
);

/**
 * Usage tracking (ephemeral - resets on time windows, no persistence needed)
 */
const usageTracking = new Map<string, {
  minuteCount: number;
  minuteReset: number;
  hourCount: number;
  hourReset: number;
  dayCount: number;
  dayReset: number;
}>();

// ==================== Key Generation ====================

/**
 * Generate a cryptographically secure random string
 */
function generateRandomString(length: number): string {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

/**
 * Hash an API key for storage
 */
function hashApiKey(key: string): string {
  return crypto
    .createHmac('sha256', getKeyHashSalt())
    .update(key)
    .digest('hex');
}

/**
 * Generate a new API key
 * Format: sk_{live|test}_{random}
 */
function generateApiKey(isTestKey: boolean): { fullKey: string; prefix: string; hash: string } {
  const env = isTestKey ? 'test' : 'live';
  const prefix = `sk_${env}_${generateRandomString(KEY_PREFIX_LENGTH)}`;
  const randomPart = generateRandomString(KEY_RANDOM_LENGTH);
  const fullKey = `${prefix}_${randomPart}`;
  const hash = hashApiKey(fullKey);

  return { fullKey, prefix, hash };
}

// ==================== API Key Management ====================

/**
 * Create a new API key
 *
 * @param userId - User ID who owns the key
 * @param request - Key creation request
 * @returns The full key (shown only once) and key info
 */
export function createApiKey(
  userId: string,
  request: CreateApiKeyRequest
): CreateApiKeyResponse {
  // Validate scopes
  const validScopes: ApiKeyScope[] = [
    'sandboxes:read',
    'sandboxes:write',
    'projects:read',
    'projects:write',
    'files:read',
    'files:write',
    'execute:commands',
    'execute:scripts',
    'admin',
  ];

  for (const scope of request.scopes) {
    if (!validScopes.includes(scope)) {
      throw new Error(`Invalid scope: ${scope}`);
    }
  }

  // Generate key
  const { fullKey, prefix, hash } = generateApiKey(request.isTestKey ?? false);

  // Calculate expiration
  let expiresAt: number | undefined;
  if (request.expiresAt) {
    expiresAt = typeof request.expiresAt === 'string'
      ? new Date(request.expiresAt).getTime()
      : request.expiresAt;
  }

  // Create key record
  const now = Date.now();
  const keyId = crypto.randomUUID();

  const apiKey: ApiKey = {
    id: keyId,
    userId,
    name: request.name,
    hashedKey: hash,
    keyPrefix: prefix,
    scopes: request.scopes,
    tier: 'free', // Default tier, upgrade via billing
    environment: request.isTestKey ? 'test' : 'live',
    createdAt: now,
    expiresAt,
    isActive: true,
    allowedIps: request.allowedIps,
    totalRequests: 0,
    metadata: request.metadata,
  };

  // Store key
  apiKeys.set(keyId, apiKey);
  keysByHash.set(hash, keyId);

  // Add to user index
  if (!keysByUser.has(userId)) {
    keysByUser.set(userId, new Set());
  }
  keysByUser.get(userId)!.add(keyId);

  // Initialize usage tracking
  usageTracking.set(keyId, {
    minuteCount: 0,
    minuteReset: now + 60000,
    hourCount: 0,
    hourReset: now + 3600000,
    dayCount: 0,
    dayReset: now + 86400000,
  });

  saveApiKeysStore();

  console.log(`[API Keys] Created key ${prefix} for user ${userId}`);

  return {
    apiKey: fullKey,
    keyInfo: toKeyInfo(apiKey),
  };
}

/**
 * Validate an API key and return the key record
 *
 * @param key - The full API key
 * @returns The API key record or null if invalid
 */
export function validateApiKey(key: string): ApiKey | null {
  // Check format
  if (!key || !key.startsWith('sk_')) {
    return null;
  }

  // Hash and lookup
  const hash = hashApiKey(key);
  const keyId = keysByHash.get(hash);

  if (!keyId) {
    return null;
  }

  const apiKey = apiKeys.get(keyId);

  if (!apiKey) {
    return null;
  }

  // Check if active
  if (!apiKey.isActive) {
    return null;
  }

  // Check expiration
  if (apiKey.expiresAt && apiKey.expiresAt < Date.now()) {
    return null;
  }

  // Update last used
  apiKey.lastUsedAt = Date.now();
  apiKey.totalRequests++;
  saveApiKeysStore();

  return apiKey;
}

/**
 * Check if API key has required scope
 */
export function hasScope(apiKey: ApiKey, requiredScope: ApiKeyScope): boolean {
  // Admin scope has access to everything
  if (apiKey.scopes.includes('admin')) {
    return true;
  }

  return apiKey.scopes.includes(requiredScope);
}

/**
 * Check if API key has any of the required scopes
 */
export function hasAnyScope(apiKey: ApiKey, requiredScopes: ApiKeyScope[]): boolean {
  if (apiKey.scopes.includes('admin')) {
    return true;
  }

  return requiredScopes.some(scope => apiKey.scopes.includes(scope));
}

/**
 * Check if request IP is allowed for key
 */
export function isIpAllowed(apiKey: ApiKey, ip: string): boolean {
  // No IP restriction
  if (!apiKey.allowedIps || apiKey.allowedIps.length === 0) {
    return true;
  }

  return apiKey.allowedIps.includes(ip);
}

/**
 * Get API key by ID
 */
export function getApiKey(keyId: string): ApiKey | null {
  return apiKeys.get(keyId) || null;
}

/**
 * Get API key info by ID (safe to return to user)
 */
export function getApiKeyInfo(keyId: string): ApiKeyInfo | null {
  const key = apiKeys.get(keyId);
  return key ? toKeyInfo(key) : null;
}

/**
 * List all API keys for a user
 */
export function listUserApiKeys(userId: string): ApiKeyInfo[] {
  const keyIds = keysByUser.get(userId);

  if (!keyIds) {
    return [];
  }

  const keys: ApiKeyInfo[] = [];
  for (const keyId of keyIds) {
    const key = apiKeys.get(keyId);
    if (key) {
      keys.push(toKeyInfo(key));
    }
  }

  return keys.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Revoke an API key
 */
export function revokeApiKey(keyId: string, userId: string): boolean {
  const key = apiKeys.get(keyId);

  if (!key) {
    return false;
  }

  // Verify ownership
  if (key.userId !== userId) {
    return false;
  }

  // Deactivate
  key.isActive = false;

  // Remove from hash index (prevents validation)
  keysByHash.delete(key.hashedKey);

  saveApiKeysStore();

  console.log(`[API Keys] Revoked key ${key.keyPrefix} for user ${userId}`);

  return true;
}

/**
 * Delete an API key permanently
 */
export function deleteApiKey(keyId: string, userId: string): boolean {
  const key = apiKeys.get(keyId);

  if (!key) {
    return false;
  }

  // Verify ownership
  if (key.userId !== userId) {
    return false;
  }

  // Remove from all indexes
  keysByHash.delete(key.hashedKey);
  apiKeys.delete(keyId);
  usageTracking.delete(keyId);

  const userKeys = keysByUser.get(userId);
  if (userKeys) {
    userKeys.delete(keyId);
    if (userKeys.size === 0) {
      keysByUser.delete(userId);
    }
  }

  saveApiKeysStore();

  console.log(`[API Keys] Deleted key ${key.keyPrefix} for user ${userId}`);

  return true;
}

/**
 * Update API key tier (for billing)
 */
export function updateApiKeyTier(keyId: string, tier: ApiKeyTier): boolean {
  const key = apiKeys.get(keyId);

  if (!key) {
    return false;
  }

  key.tier = tier;
  saveApiKeysStore();
  console.log(`[API Keys] Updated key ${key.keyPrefix} to tier ${tier}`);

  return true;
}

/**
 * Update API key scopes
 */
export function updateApiKeyScopes(keyId: string, userId: string, scopes: ApiKeyScope[]): boolean {
  const key = apiKeys.get(keyId);

  if (!key || key.userId !== userId) {
    return false;
  }

  key.scopes = scopes;
  saveApiKeysStore();
  return true;
}

/**
 * Update API key name
 */
export function updateApiKeyName(keyId: string, userId: string, name: string): boolean {
  const key = apiKeys.get(keyId);

  if (!key || key.userId !== userId) {
    return false;
  }

  key.name = name;
  saveApiKeysStore();
  return true;
}

/**
 * Track API key usage
 */
export function trackUsage(keyId: string): {
  minuteCount: number;
  hourCount: number;
  dayCount: number;
} {
  const now = Date.now();
  let usage = usageTracking.get(keyId);

  if (!usage) {
    usage = {
      minuteCount: 0,
      minuteReset: now + 60000,
      hourCount: 0,
      hourReset: now + 3600000,
      dayCount: 0,
      dayReset: now + 86400000,
    };
    usageTracking.set(keyId, usage);
  }

  // Reset counters if window expired
  if (now >= usage.minuteReset) {
    usage.minuteCount = 0;
    usage.minuteReset = now + 60000;
  }

  if (now >= usage.hourReset) {
    usage.hourCount = 0;
    usage.hourReset = now + 3600000;
  }

  if (now >= usage.dayReset) {
    usage.dayCount = 0;
    usage.dayReset = now + 86400000;
  }

  // Increment counters
  usage.minuteCount++;
  usage.hourCount++;
  usage.dayCount++;

  return {
    minuteCount: usage.minuteCount,
    hourCount: usage.hourCount,
    dayCount: usage.dayCount,
  };
}

/**
 * Get current usage for a key
 */
export function getUsage(keyId: string): {
  minuteCount: number;
  minuteReset: number;
  hourCount: number;
  hourReset: number;
  dayCount: number;
  dayReset: number;
} | null {
  const usage = usageTracking.get(keyId);

  if (!usage) {
    return null;
  }

  const now = Date.now();

  // Return current values, accounting for expired windows
  return {
    minuteCount: now >= usage.minuteReset ? 0 : usage.minuteCount,
    minuteReset: now >= usage.minuteReset ? now + 60000 : usage.minuteReset,
    hourCount: now >= usage.hourReset ? 0 : usage.hourCount,
    hourReset: now >= usage.hourReset ? now + 3600000 : usage.hourReset,
    dayCount: now >= usage.dayReset ? 0 : usage.dayCount,
    dayReset: now >= usage.dayReset ? now + 86400000 : usage.dayReset,
  };
}

/**
 * Count active sandboxes for a key
 */
const activeSandboxesByKey = new Map<string, Set<string>>();

export function addSandboxToKey(keyId: string, sandboxId: string): void {
  if (!activeSandboxesByKey.has(keyId)) {
    activeSandboxesByKey.set(keyId, new Set());
  }
  activeSandboxesByKey.get(keyId)!.add(sandboxId);
}

export function removeSandboxFromKey(keyId: string, sandboxId: string): void {
  const sandboxes = activeSandboxesByKey.get(keyId);
  if (sandboxes) {
    sandboxes.delete(sandboxId);
    if (sandboxes.size === 0) {
      activeSandboxesByKey.delete(keyId);
    }
  }
}

export function getActiveSandboxCount(keyId: string): number {
  return activeSandboxesByKey.get(keyId)?.size || 0;
}

export function getActiveSandboxIds(keyId: string): string[] {
  return Array.from(activeSandboxesByKey.get(keyId) || []);
}

// ==================== Utility Functions ====================

/**
 * Convert ApiKey to ApiKeyInfo (without sensitive data)
 */
function toKeyInfo(key: ApiKey): ApiKeyInfo {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    scopes: key.scopes,
    tier: key.tier,
    environment: key.environment,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    isActive: key.isActive,
    totalRequests: key.totalRequests,
  };
}

/**
 * Get API keys statistics
 */
export function getApiKeyStats(): {
  totalKeys: number;
  activeKeys: number;
  keysByTier: Record<ApiKeyTier, number>;
  keysByEnvironment: Record<string, number>;
} {
  let activeKeys = 0;
  const keysByTier: Record<ApiKeyTier, number> = {
    free: 0,
    developer: 0,
    team: 0,
    enterprise: 0,
  };
  const keysByEnvironment: Record<string, number> = {
    live: 0,
    test: 0,
  };

  for (const key of apiKeys.values()) {
    if (key.isActive) {
      activeKeys++;
    }
    keysByTier[key.tier]++;
    keysByEnvironment[key.environment]++;
  }

  return {
    totalKeys: apiKeys.size,
    activeKeys,
    keysByTier,
    keysByEnvironment,
  };
}

// Export storage for testing
export const _testing = {
  apiKeys,
  keysByHash,
  keysByUser,
  usageTracking,
  clearAll: () => {
    apiKeys.clear();
    keysByHash.clear();
    keysByUser.clear();
    usageTracking.clear();
    activeSandboxesByKey.clear();
    saveApiKeysStore();
  },
};
