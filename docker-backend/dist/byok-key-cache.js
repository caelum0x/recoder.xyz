"use strict";
/**
 * Encrypted BYOK Key Cache
 *
 * When VAULT_MASTER_KEY is set, caches fetched BYOK keys encrypted at rest
 * with AES-256-GCM via the shared VaultDriver. TTL: 5 minutes.
 * When no master key is set, caching is disabled (every call goes to HTTP).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCachedKeys = getCachedKeys;
exports.setCachedKeys = setCachedKeys;
exports.invalidateCachedKeys = invalidateCachedKeys;
exports.clearCache = clearCache;
const vault_1 = require("./vault");
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map();
/**
 * Get cached BYOK keys for a user. Returns null on cache miss or if caching
 * is disabled (no VAULT_MASTER_KEY).
 */
async function getCachedKeys(userId) {
    const driver = (0, vault_1.getVaultDriver)();
    if (!driver)
        return null;
    const entry = cache.get(userId);
    if (!entry)
        return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(userId);
        return null;
    }
    try {
        return JSON.parse(await driver.decrypt(entry.encrypted));
    }
    catch {
        cache.delete(userId);
        return null;
    }
}
/**
 * Store BYOK keys in the encrypted cache. No-op if VAULT_MASTER_KEY is not set.
 */
async function setCachedKeys(userId, keys) {
    const driver = (0, vault_1.getVaultDriver)();
    if (!driver)
        return;
    cache.set(userId, {
        encrypted: await driver.encrypt(JSON.stringify(keys)),
        expiresAt: Date.now() + CACHE_TTL_MS,
    });
}
/**
 * Invalidate a specific user's cached keys.
 */
function invalidateCachedKeys(userId) {
    cache.delete(userId);
}
/**
 * Clear the entire cache.
 */
function clearCache() {
    cache.clear();
}
