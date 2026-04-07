"use strict";
/**
 * API Key Management
 *
 * Handles generation, validation, storage, and tracking of API keys.
 * Keys are stored with cryptographic hashes - the plain text key is only
 * shown once upon creation and cannot be recovered.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports._testing = void 0;
exports.createApiKey = createApiKey;
exports.validateApiKey = validateApiKey;
exports.hasScope = hasScope;
exports.hasAnyScope = hasAnyScope;
exports.isIpAllowed = isIpAllowed;
exports.getApiKey = getApiKey;
exports.getApiKeyInfo = getApiKeyInfo;
exports.listUserApiKeys = listUserApiKeys;
exports.revokeApiKey = revokeApiKey;
exports.deleteApiKey = deleteApiKey;
exports.updateApiKeyTier = updateApiKeyTier;
exports.updateApiKeyScopes = updateApiKeyScopes;
exports.updateApiKeyName = updateApiKeyName;
exports.trackUsage = trackUsage;
exports.getUsage = getUsage;
exports.addSandboxToKey = addSandboxToKey;
exports.removeSandboxFromKey = removeSandboxFromKey;
exports.getActiveSandboxCount = getActiveSandboxCount;
exports.getActiveSandboxIds = getActiveSandboxIds;
exports.getApiKeyStats = getApiKeyStats;
const crypto_1 = __importDefault(require("crypto"));
const persistence_js_1 = require("../persistence.js");
// ==================== Configuration ====================
/**
 * Salt for key hashing - REQUIRED for production
 * SECURITY: Never use a hardcoded fallback salt in production
 */
let _keyHashSalt = null;
function getKeyHashSalt() {
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
function loadApiKeysStore() {
    return (0, persistence_js_1.loadStore)('api-keys', {
        apiKeys: [],
        keysByHash: [],
        keysByUser: [],
    });
}
function saveApiKeysStore() {
    const data = {
        apiKeys: Array.from(apiKeys.entries()),
        keysByHash: Array.from(keysByHash.entries()),
        keysByUser: Array.from(keysByUser.entries()).map(([userId, keySet]) => [userId, Array.from(keySet)]),
    };
    (0, persistence_js_1.debouncedSave)('api-keys', data);
}
// Load persisted data
const _stored = loadApiKeysStore();
/**
 * API key storage (initialized from persisted data)
 */
const apiKeys = new Map(_stored.apiKeys);
/**
 * Index by hashed key for fast lookup during authentication
 */
const keysByHash = new Map(_stored.keysByHash);
/**
 * Index by user ID for listing user's keys
 */
const keysByUser = new Map(_stored.keysByUser.map(([userId, keyIds]) => [userId, new Set(keyIds)]));
/**
 * Usage tracking (ephemeral - resets on time windows, no persistence needed)
 */
const usageTracking = new Map();
// ==================== Key Generation ====================
/**
 * Generate a cryptographically secure random string
 */
function generateRandomString(length) {
    return crypto_1.default.randomBytes(length).toString('base64url').slice(0, length);
}
/**
 * Hash an API key for storage
 */
function hashApiKey(key) {
    return crypto_1.default
        .createHmac('sha256', getKeyHashSalt())
        .update(key)
        .digest('hex');
}
/**
 * Generate a new API key
 * Format: sk_{live|test}_{random}
 */
function generateApiKey(isTestKey) {
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
function createApiKey(userId, request) {
    // Validate scopes
    const validScopes = [
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
    let expiresAt;
    if (request.expiresAt) {
        expiresAt = typeof request.expiresAt === 'string'
            ? new Date(request.expiresAt).getTime()
            : request.expiresAt;
    }
    // Create key record
    const now = Date.now();
    const keyId = crypto_1.default.randomUUID();
    const apiKey = {
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
    keysByUser.get(userId).add(keyId);
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
function validateApiKey(key) {
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
function hasScope(apiKey, requiredScope) {
    // Admin scope has access to everything
    if (apiKey.scopes.includes('admin')) {
        return true;
    }
    return apiKey.scopes.includes(requiredScope);
}
/**
 * Check if API key has any of the required scopes
 */
function hasAnyScope(apiKey, requiredScopes) {
    if (apiKey.scopes.includes('admin')) {
        return true;
    }
    return requiredScopes.some(scope => apiKey.scopes.includes(scope));
}
/**
 * Check if request IP is allowed for key
 */
function isIpAllowed(apiKey, ip) {
    // No IP restriction
    if (!apiKey.allowedIps || apiKey.allowedIps.length === 0) {
        return true;
    }
    return apiKey.allowedIps.includes(ip);
}
/**
 * Get API key by ID
 */
function getApiKey(keyId) {
    return apiKeys.get(keyId) || null;
}
/**
 * Get API key info by ID (safe to return to user)
 */
function getApiKeyInfo(keyId) {
    const key = apiKeys.get(keyId);
    return key ? toKeyInfo(key) : null;
}
/**
 * List all API keys for a user
 */
function listUserApiKeys(userId) {
    const keyIds = keysByUser.get(userId);
    if (!keyIds) {
        return [];
    }
    const keys = [];
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
function revokeApiKey(keyId, userId) {
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
function deleteApiKey(keyId, userId) {
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
function updateApiKeyTier(keyId, tier) {
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
function updateApiKeyScopes(keyId, userId, scopes) {
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
function updateApiKeyName(keyId, userId, name) {
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
function trackUsage(keyId) {
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
function getUsage(keyId) {
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
const activeSandboxesByKey = new Map();
function addSandboxToKey(keyId, sandboxId) {
    if (!activeSandboxesByKey.has(keyId)) {
        activeSandboxesByKey.set(keyId, new Set());
    }
    activeSandboxesByKey.get(keyId).add(sandboxId);
}
function removeSandboxFromKey(keyId, sandboxId) {
    const sandboxes = activeSandboxesByKey.get(keyId);
    if (sandboxes) {
        sandboxes.delete(sandboxId);
        if (sandboxes.size === 0) {
            activeSandboxesByKey.delete(keyId);
        }
    }
}
function getActiveSandboxCount(keyId) {
    return activeSandboxesByKey.get(keyId)?.size || 0;
}
function getActiveSandboxIds(keyId) {
    return Array.from(activeSandboxesByKey.get(keyId) || []);
}
// ==================== Utility Functions ====================
/**
 * Convert ApiKey to ApiKeyInfo (without sensitive data)
 */
function toKeyInfo(key) {
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
function getApiKeyStats() {
    let activeKeys = 0;
    const keysByTier = {
        free: 0,
        developer: 0,
        team: 0,
        enterprise: 0,
    };
    const keysByEnvironment = {
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
exports._testing = {
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
