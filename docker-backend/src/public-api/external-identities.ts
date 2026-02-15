/**
 * External Identity Management
 *
 * Handles mapping between external identity providers (Moltbook, OpenClaw)
 * and Recoder user accounts.
 */

import crypto from 'crypto';
import type {
  ExternalProvider,
  ExternalIdentity,
} from './types.js';
import { loadStore, debouncedSave } from '../persistence.js';

// ==================== Storage ====================

interface ExternalIdentitiesStoreData {
  byRecoderId: [string, ExternalIdentity[]][];
  byExternalId: [string, string][];  // "provider:externalId" -> recoderId
}

function loadExternalIdentitiesStore(): ExternalIdentitiesStoreData {
  return loadStore<ExternalIdentitiesStoreData>('external-identities', {
    byRecoderId: [],
    byExternalId: [],
  });
}

function saveExternalIdentitiesStore(): void {
  const data: ExternalIdentitiesStoreData = {
    byRecoderId: Array.from(identitiesByRecoderId.entries()),
    byExternalId: Array.from(identitiesByExternalId.entries()),
  };
  debouncedSave('external-identities', data);
}

// Load persisted data
const _stored = loadExternalIdentitiesStore();

/**
 * External identities indexed by Recoder user ID
 */
const identitiesByRecoderId = new Map<string, ExternalIdentity[]>(_stored.byRecoderId);

/**
 * External identities indexed by "provider:externalId"
 */
const identitiesByExternalId = new Map<string, string>(_stored.byExternalId);

// ==================== Helper Functions ====================

/**
 * Create a composite key for external identity lookup
 */
function makeExternalKey(provider: ExternalProvider, externalId: string): string {
  return `${provider}:${externalId}`;
}

/**
 * Generate a new Recoder user ID for external accounts
 */
function generateRecoderId(provider: ExternalProvider): string {
  const random = crypto.randomBytes(8).toString('hex');
  return `${provider}_${random}`;
}

// ==================== Identity Management ====================

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
export function linkExternalIdentity(
  recoderUserId: string,
  provider: ExternalProvider,
  externalId: string,
  externalName?: string,
  metadata?: Record<string, unknown>
): ExternalIdentity {
  const externalKey = makeExternalKey(provider, externalId);

  // Check if already linked
  const existingRecoderId = identitiesByExternalId.get(externalKey);
  if (existingRecoderId && existingRecoderId !== recoderUserId) {
    throw new Error(`External identity ${provider}:${externalId} is already linked to another account`);
  }

  const identity: ExternalIdentity = {
    recoderUserId,
    provider,
    externalId,
    externalName,
    linkedAt: Date.now(),
    metadata,
  };

  // Add to Recoder user index
  if (!identitiesByRecoderId.has(recoderUserId)) {
    identitiesByRecoderId.set(recoderUserId, []);
  }

  // Remove existing link for same provider if exists
  const userIdentities = identitiesByRecoderId.get(recoderUserId)!;
  const existingIndex = userIdentities.findIndex(
    i => i.provider === provider && i.externalId === externalId
  );
  if (existingIndex >= 0) {
    userIdentities.splice(existingIndex, 1);
  }

  userIdentities.push(identity);

  // Add to external ID index
  identitiesByExternalId.set(externalKey, recoderUserId);

  saveExternalIdentitiesStore();

  console.log(`[External Identities] Linked ${provider}:${externalId} to ${recoderUserId}`);

  return identity;
}

/**
 * Unlink an external identity from a Recoder account
 */
export function unlinkExternalIdentity(
  recoderUserId: string,
  provider: ExternalProvider,
  externalId: string
): boolean {
  const externalKey = makeExternalKey(provider, externalId);

  // Verify ownership
  const existingRecoderId = identitiesByExternalId.get(externalKey);
  if (existingRecoderId !== recoderUserId) {
    return false;
  }

  // Remove from external ID index
  identitiesByExternalId.delete(externalKey);

  // Remove from Recoder user index
  const userIdentities = identitiesByRecoderId.get(recoderUserId);
  if (userIdentities) {
    const index = userIdentities.findIndex(
      i => i.provider === provider && i.externalId === externalId
    );
    if (index >= 0) {
      userIdentities.splice(index, 1);
      if (userIdentities.length === 0) {
        identitiesByRecoderId.delete(recoderUserId);
      }
    }
  }

  saveExternalIdentitiesStore();

  console.log(`[External Identities] Unlinked ${provider}:${externalId} from ${recoderUserId}`);

  return true;
}

/**
 * Find Recoder user ID by external identity
 */
export function findRecoderIdByExternalId(
  provider: ExternalProvider,
  externalId: string
): string | null {
  const externalKey = makeExternalKey(provider, externalId);
  return identitiesByExternalId.get(externalKey) || null;
}

/**
 * Get all external identities for a Recoder user
 */
export function getExternalIdentities(recoderUserId: string): ExternalIdentity[] {
  return identitiesByRecoderId.get(recoderUserId) || [];
}

/**
 * Get specific external identity for a Recoder user
 */
export function getExternalIdentity(
  recoderUserId: string,
  provider: ExternalProvider
): ExternalIdentity | null {
  const identities = identitiesByRecoderId.get(recoderUserId);
  if (!identities) {
    return null;
  }
  return identities.find(i => i.provider === provider) || null;
}

/**
 * Check if an external identity is already linked
 */
export function isExternalIdLinked(
  provider: ExternalProvider,
  externalId: string
): boolean {
  const externalKey = makeExternalKey(provider, externalId);
  return identitiesByExternalId.has(externalKey);
}

/**
 * Get or create a Recoder account for an external identity
 * Used for "Login with Moltbook" type flows
 */
export function getOrCreateRecoderAccount(
  provider: ExternalProvider,
  externalId: string,
  externalName?: string,
  metadata?: Record<string, unknown>
): { recoderId: string; isNew: boolean; identity: ExternalIdentity } {
  // Check if already linked
  const existingRecoderId = findRecoderIdByExternalId(provider, externalId);

  if (existingRecoderId) {
    const identities = identitiesByRecoderId.get(existingRecoderId) || [];
    const identity = identities.find(i => i.provider === provider && i.externalId === externalId);

    // Update external name if changed
    if (identity && externalName && identity.externalName !== externalName) {
      identity.externalName = externalName;
      saveExternalIdentitiesStore();
    }

    return {
      recoderId: existingRecoderId,
      isNew: false,
      identity: identity!,
    };
  }

  // Create new Recoder account
  const recoderId = generateRecoderId(provider);
  const identity = linkExternalIdentity(recoderId, provider, externalId, externalName, metadata);

  console.log(`[External Identities] Created new Recoder account ${recoderId} for ${provider}:${externalId}`);

  return {
    recoderId,
    isNew: true,
    identity,
  };
}

/**
 * Update metadata for an external identity
 */
export function updateExternalIdentityMetadata(
  recoderUserId: string,
  provider: ExternalProvider,
  externalId: string,
  metadata: Record<string, unknown>
): boolean {
  const identities = identitiesByRecoderId.get(recoderUserId);
  if (!identities) {
    return false;
  }

  const identity = identities.find(
    i => i.provider === provider && i.externalId === externalId
  );

  if (!identity) {
    return false;
  }

  identity.metadata = { ...identity.metadata, ...metadata };
  saveExternalIdentitiesStore();

  return true;
}

/**
 * Get external identity stats
 */
export function getExternalIdentityStats(): {
  totalLinks: number;
  byProvider: Record<ExternalProvider, number>;
} {
  const byProvider: Record<ExternalProvider, number> = {
    moltbook: 0,
    openclaw: 0,
  };

  for (const key of identitiesByExternalId.keys()) {
    const provider = key.split(':')[0] as ExternalProvider;
    byProvider[provider] = (byProvider[provider] || 0) + 1;
  }

  return {
    totalLinks: identitiesByExternalId.size,
    byProvider,
  };
}

// Export for testing
export const _testing = {
  identitiesByRecoderId,
  identitiesByExternalId,
  clearAll: () => {
    identitiesByRecoderId.clear();
    identitiesByExternalId.clear();
    saveExternalIdentitiesStore();
  },
};
