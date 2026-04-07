/**
 * External Identity Management
 *
 * Handles mapping between external identity providers (Moltbook, OpenClaw)
 * and Recoder user accounts.
 */
import type { ExternalProvider, ExternalIdentity } from './types.js';
/**
 * Link an external identity to a Recoder account
 *
 * @param recoderUserId - Recoder user ID
 * @param provider - External provider
 * @param externalId - ID from external provider
 * @param externalName - Display name from external provider
 * @param metadata - Additional metadata
 * @returns The created identity link
 */
export declare function linkExternalIdentity(recoderUserId: string, provider: ExternalProvider, externalId: string, externalName?: string, metadata?: Record<string, unknown>): ExternalIdentity;
/**
 * Unlink an external identity from a Recoder account
 */
export declare function unlinkExternalIdentity(recoderUserId: string, provider: ExternalProvider, externalId: string): boolean;
/**
 * Find Recoder user ID by external identity
 */
export declare function findRecoderIdByExternalId(provider: ExternalProvider, externalId: string): string | null;
/**
 * Get all external identities for a Recoder user
 */
export declare function getExternalIdentities(recoderUserId: string): ExternalIdentity[];
/**
 * Get specific external identity for a Recoder user
 */
export declare function getExternalIdentity(recoderUserId: string, provider: ExternalProvider): ExternalIdentity | null;
/**
 * Check if an external identity is already linked
 */
export declare function isExternalIdLinked(provider: ExternalProvider, externalId: string): boolean;
/**
 * Get or create a Recoder account for an external identity
 * Used for "Login with Moltbook" type flows
 */
export declare function getOrCreateRecoderAccount(provider: ExternalProvider, externalId: string, externalName?: string, metadata?: Record<string, unknown>): {
    recoderId: string;
    isNew: boolean;
    identity: ExternalIdentity;
};
/**
 * Update metadata for an external identity
 */
export declare function updateExternalIdentityMetadata(recoderUserId: string, provider: ExternalProvider, externalId: string, metadata: Record<string, unknown>): boolean;
/**
 * Get external identity stats
 */
export declare function getExternalIdentityStats(): {
    totalLinks: number;
    byProvider: Record<ExternalProvider, number>;
};
export declare const _testing: {
    identitiesByRecoderId: Map<string, ExternalIdentity[]>;
    identitiesByExternalId: Map<string, string>;
    clearAll: () => void;
};
