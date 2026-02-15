/**
 * App Key Management
 *
 * Handles generation, validation, and storage of app keys for third-party developers.
 * App keys are used by external applications to verify identity tokens.
 *
 * Key format: app_{random}_{random}
 */

import crypto from 'crypto';
import type {
  AppKey,
  AppKeyInfo,
  CreateAppKeyRequest,
  CreateAppKeyResponse,
} from './types.js';
import { loadStore, debouncedSave } from '../persistence.js';

// ==================== Configuration ====================

/**
 * Salt for key hashing - uses same salt as API keys
 */
let _keyHashSalt: string | null = null;
function getKeyHashSalt(): string {
  if (!_keyHashSalt) {
    const salt = process.env.API_KEY_HASH_SALT;
    if (!salt) {
      throw new Error('API_KEY_HASH_SALT environment variable must be set for app key security');
    }
    _keyHashSalt = salt;
  }
  return _keyHashSalt;
}

/**
 * Key format configuration
 */
const KEY_PREFIX_LENGTH = 8;
const KEY_RANDOM_LENGTH = 24;
const KEY_PREFIX = 'app';

// ==================== Storage ====================

interface AppKeysStoreData {
  appKeys: [string, AppKey][];
  keysByHash: [string, string][];
  keysByOwner: [string, string[]][];
}

function loadAppKeysStore(): AppKeysStoreData {
  return loadStore<AppKeysStoreData>('app-keys', {
    appKeys: [],
    keysByHash: [],
    keysByOwner: [],
  });
}

function saveAppKeysStore(): void {
  const data: AppKeysStoreData = {
    appKeys: Array.from(appKeys.entries()),
    keysByHash: Array.from(keysByHash.entries()),
    keysByOwner: Array.from(keysByOwner.entries()).map(
      ([ownerId, keySet]) => [ownerId, Array.from(keySet)]
    ),
  };
  debouncedSave('app-keys', data);
}

// Load persisted data
const _stored = loadAppKeysStore();

/**
 * App key storage (by ID)
 */
const appKeys = new Map<string, AppKey>(_stored.appKeys);

/**
 * Index by hashed key for fast lookup during authentication
 */
const keysByHash = new Map<string, string>(_stored.keysByHash);

/**
 * Index by owner ID for listing user's keys
 */
const keysByOwner = new Map<string, Set<string>>(
  _stored.keysByOwner.map(([ownerId, keyIds]) => [ownerId, new Set(keyIds)])
);

// ==================== Key Generation ====================

/**
 * Generate a cryptographically secure random string
 */
function generateRandomString(length: number): string {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

/**
 * Hash an app key for storage
 */
function hashAppKey(key: string): string {
  return crypto
    .createHmac('sha256', getKeyHashSalt())
    .update(key)
    .digest('hex');
}

/**
 * Generate a new app key
 * Format: app_{prefix}_{random}
 */
function generateAppKey(): { fullKey: string; prefix: string; hash: string } {
  const prefixRandom = generateRandomString(KEY_PREFIX_LENGTH);
  const prefix = `${KEY_PREFIX}_${prefixRandom}`;
  const randomPart = generateRandomString(KEY_RANDOM_LENGTH);
  const fullKey = `${prefix}_${randomPart}`;
  const hash = hashAppKey(fullKey);

  return { fullKey, prefix, hash };
}

// ==================== App Key Management ====================

/**
 * Create a new app key
 *
 * @param ownerId - User ID who owns the app
 * @param request - Key creation request
 * @returns The full key (shown only once) and key info
 */
export function createAppKey(
  ownerId: string,
  request: CreateAppKeyRequest
): CreateAppKeyResponse {
  // Generate key
  const { fullKey, prefix, hash } = generateAppKey();

  const now = Date.now();
  const keyId = crypto.randomUUID();

  // Create key record
  const appKey: AppKey = {
    id: keyId,
    name: request.name,
    hashedKey: hash,
    keyPrefix: prefix,
    ownerId,
    isActive: true,
    createdAt: now,
    totalVerifications: 0,
    allowedCallbackUrls: request.allowedCallbackUrls,
    description: request.description,
  };

  // Store key
  appKeys.set(keyId, appKey);
  keysByHash.set(hash, keyId);

  // Add to owner index
  if (!keysByOwner.has(ownerId)) {
    keysByOwner.set(ownerId, new Set());
  }
  keysByOwner.get(ownerId)!.add(keyId);

  saveAppKeysStore();

  console.log(`[App Keys] Created key ${prefix} for user ${ownerId}`);

  return {
    appKey: fullKey,
    keyInfo: toKeyInfo(appKey),
  };
}

/**
 * Validate an app key and return the key record
 *
 * @param key - The full app key
 * @returns The app key record or null if invalid
 */
export function validateAppKey(key: string): AppKey | null {
  // Check format
  if (!key || !key.startsWith(`${KEY_PREFIX}_`)) {
    return null;
  }

  // Hash and lookup
  const hash = hashAppKey(key);
  const keyId = keysByHash.get(hash);

  if (!keyId) {
    return null;
  }

  const appKey = appKeys.get(keyId);

  if (!appKey) {
    return null;
  }

  // Check if active
  if (!appKey.isActive) {
    return null;
  }

  // Update last used and increment counter
  appKey.lastUsedAt = Date.now();
  appKey.totalVerifications++;
  saveAppKeysStore();

  return appKey;
}

/**
 * Get app key by ID
 */
export function getAppKey(keyId: string): AppKey | null {
  return appKeys.get(keyId) || null;
}

/**
 * Get app key info by ID (safe to return to user)
 */
export function getAppKeyInfo(keyId: string): AppKeyInfo | null {
  const key = appKeys.get(keyId);
  return key ? toKeyInfo(key) : null;
}

/**
 * List all app keys for a user
 */
export function listUserAppKeys(ownerId: string): AppKeyInfo[] {
  const keyIds = keysByOwner.get(ownerId);

  if (!keyIds) {
    return [];
  }

  const keys: AppKeyInfo[] = [];
  for (const keyId of keyIds) {
    const key = appKeys.get(keyId);
    if (key) {
      keys.push(toKeyInfo(key));
    }
  }

  return keys.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Revoke an app key
 */
export function revokeAppKey(keyId: string, ownerId: string): boolean {
  const key = appKeys.get(keyId);

  if (!key) {
    return false;
  }

  // Verify ownership
  if (key.ownerId !== ownerId) {
    return false;
  }

  // Deactivate
  key.isActive = false;

  // Remove from hash index (prevents validation)
  keysByHash.delete(key.hashedKey);

  saveAppKeysStore();

  console.log(`[App Keys] Revoked key ${key.keyPrefix} for user ${ownerId}`);

  return true;
}

/**
 * Delete an app key permanently
 */
export function deleteAppKey(keyId: string, ownerId: string): boolean {
  const key = appKeys.get(keyId);

  if (!key) {
    return false;
  }

  // Verify ownership
  if (key.ownerId !== ownerId) {
    return false;
  }

  // Remove from all indexes
  keysByHash.delete(key.hashedKey);
  appKeys.delete(keyId);

  const ownerKeys = keysByOwner.get(ownerId);
  if (ownerKeys) {
    ownerKeys.delete(keyId);
    if (ownerKeys.size === 0) {
      keysByOwner.delete(ownerId);
    }
  }

  saveAppKeysStore();

  console.log(`[App Keys] Deleted key ${key.keyPrefix} for user ${ownerId}`);

  return true;
}

/**
 * Update app key name
 */
export function updateAppKeyName(keyId: string, ownerId: string, name: string): boolean {
  const key = appKeys.get(keyId);

  if (!key || key.ownerId !== ownerId) {
    return false;
  }

  key.name = name;
  saveAppKeysStore();
  return true;
}

/**
 * Update app key description
 */
export function updateAppKeyDescription(keyId: string, ownerId: string, description: string): boolean {
  const key = appKeys.get(keyId);

  if (!key || key.ownerId !== ownerId) {
    return false;
  }

  key.description = description;
  saveAppKeysStore();
  return true;
}

/**
 * Update allowed callback URLs
 */
export function updateAppKeyCallbackUrls(keyId: string, ownerId: string, urls: string[]): boolean {
  const key = appKeys.get(keyId);

  if (!key || key.ownerId !== ownerId) {
    return false;
  }

  key.allowedCallbackUrls = urls;
  saveAppKeysStore();
  return true;
}

// ==================== Utility Functions ====================

/**
 * Convert AppKey to AppKeyInfo (without sensitive data)
 */
function toKeyInfo(key: AppKey): AppKeyInfo {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    ownerId: key.ownerId,
    isActive: key.isActive,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    totalVerifications: key.totalVerifications,
    description: key.description,
  };
}

/**
 * Get app key stats
 */
export function getAppKeyStats(): {
  totalKeys: number;
  activeKeys: number;
  totalVerifications: number;
} {
  let activeKeys = 0;
  let totalVerifications = 0;

  for (const key of appKeys.values()) {
    if (key.isActive) {
      activeKeys++;
    }
    totalVerifications += key.totalVerifications;
  }

  return {
    totalKeys: appKeys.size,
    activeKeys,
    totalVerifications,
  };
}

// Export for testing
export const _testing = {
  appKeys,
  keysByHash,
  keysByOwner,
  clearAll: () => {
    appKeys.clear();
    keysByHash.clear();
    keysByOwner.clear();
    saveAppKeysStore();
  },
};
