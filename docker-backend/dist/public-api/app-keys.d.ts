/**
 * App Key Management
 *
 * Handles generation, validation, and storage of app keys for third-party developers.
 * App keys are used by external applications to verify identity tokens.
 *
 * Key format: app_{random}_{random}
 */
import type { AppKey, AppKeyInfo, CreateAppKeyRequest, CreateAppKeyResponse } from './types.js';
/**
 * Create a new app key
 *
 * @param ownerId - User ID who owns the app
 * @param request - Key creation request
 * @returns The full key (shown only once) and key info
 */
export declare function createAppKey(ownerId: string, request: CreateAppKeyRequest): CreateAppKeyResponse;
/**
 * Validate an app key and return the key record
 *
 * @param key - The full app key
 * @returns The app key record or null if invalid
 */
export declare function validateAppKey(key: string): AppKey | null;
/**
 * Get app key by ID
 */
export declare function getAppKey(keyId: string): AppKey | null;
/**
 * Get app key info by ID (safe to return to user)
 */
export declare function getAppKeyInfo(keyId: string): AppKeyInfo | null;
/**
 * List all app keys for a user
 */
export declare function listUserAppKeys(ownerId: string): AppKeyInfo[];
/**
 * Revoke an app key
 */
export declare function revokeAppKey(keyId: string, ownerId: string): boolean;
/**
 * Delete an app key permanently
 */
export declare function deleteAppKey(keyId: string, ownerId: string): boolean;
/**
 * Update app key name
 */
export declare function updateAppKeyName(keyId: string, ownerId: string, name: string): boolean;
/**
 * Update app key description
 */
export declare function updateAppKeyDescription(keyId: string, ownerId: string, description: string): boolean;
/**
 * Update allowed callback URLs
 */
export declare function updateAppKeyCallbackUrls(keyId: string, ownerId: string, urls: string[]): boolean;
/**
 * Get app key stats
 */
export declare function getAppKeyStats(): {
    totalKeys: number;
    activeKeys: number;
    totalVerifications: number;
};
export declare const _testing: {
    appKeys: Map<string, AppKey>;
    keysByHash: Map<string, string>;
    keysByOwner: Map<string, Set<string>>;
    clearAll: () => void;
};
