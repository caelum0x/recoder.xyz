/**
 * No-op Vault Driver
 * Returns plaintext as-is without encryption
 * Useful for testing or development environments
 */

import type { VaultDriver, EncryptOptions, StoredSecret, SecretMetadata } from './types';
import { generateSecretId } from './crypto-utils';

/**
 * In-memory storage for secrets (stores plaintext)
 */
const noopStore = new Map<string, { plaintext: string; metadata: SecretMetadata }>();

/**
 * No-op vault driver for tests where encryption is not required.
 * WARNING: This driver provides NO security - use only for testing!
 */
export const noopVaultDriver: VaultDriver = {
  async encrypt(plaintext: string, options?: EncryptOptions): Promise<string> {
    const secretId = generateSecretId();
    const now = Date.now();

    const metadata: SecretMetadata = {
      id: secretId,
      name: options?.name,
      description: options?.description,
      workspaceId: options?.workspaceId,
      createdAt: now,
      updatedAt: now,
      algorithm: 'NOOP',
    };

    // Store plaintext (no encryption)
    noopStore.set(secretId, { plaintext, metadata });

    // Return a serialized format that includes metadata
    return JSON.stringify({
      version: 1,
      plaintext,
      metadata,
    });
  },

  async decrypt(serializedCiphertext: string): Promise<string> {
    const parsed = JSON.parse(serializedCiphertext);
    // Simply return the plaintext
    return parsed.plaintext;
  },

  async store(secret: StoredSecret): Promise<void> {
    // For noop, we don't really store anything meaningful
    // The ciphertext IS the plaintext in this case
    noopStore.set(secret.metadata.id, {
      plaintext: secret.ciphertext,
      metadata: secret.metadata,
    });
  },

  async retrieve(secretId: string): Promise<StoredSecret | null> {
    const stored = noopStore.get(secretId);
    if (!stored) {
      return null;
    }
    return {
      ciphertext: stored.plaintext,
      iv: '',
      metadata: stored.metadata,
    };
  },

  async list(workspaceId: string): Promise<SecretMetadata[]> {
    const results: SecretMetadata[] = [];
    noopStore.forEach((stored) => {
      if (stored.metadata.workspaceId === workspaceId) {
        results.push(stored.metadata);
      }
    });
    return results;
  },

  async delete(secretId: string): Promise<boolean> {
    return noopStore.delete(secretId);
  },
};

/**
 * Create a fresh noop driver with isolated storage
 * Useful for isolated test scenarios
 */
export function createNoopVaultDriver(): VaultDriver {
  const isolatedStore = new Map<string, { plaintext: string; metadata: SecretMetadata }>();

  return {
    async encrypt(plaintext: string, options?: EncryptOptions): Promise<string> {
      const secretId = generateSecretId();
      const now = Date.now();

      const metadata: SecretMetadata = {
        id: secretId,
        name: options?.name,
        description: options?.description,
        workspaceId: options?.workspaceId,
        createdAt: now,
        updatedAt: now,
        algorithm: 'NOOP',
      };

      isolatedStore.set(secretId, { plaintext, metadata });

      return JSON.stringify({
        version: 1,
        plaintext,
        metadata,
      });
    },

    async decrypt(serializedCiphertext: string): Promise<string> {
      const parsed = JSON.parse(serializedCiphertext);
      return parsed.plaintext;
    },

    async store(secret: StoredSecret): Promise<void> {
      isolatedStore.set(secret.metadata.id, {
        plaintext: secret.ciphertext,
        metadata: secret.metadata,
      });
    },

    async retrieve(secretId: string): Promise<StoredSecret | null> {
      const stored = isolatedStore.get(secretId);
      if (!stored) {
        return null;
      }
      return {
        ciphertext: stored.plaintext,
        iv: '',
        metadata: stored.metadata,
      };
    },

    async list(workspaceId: string): Promise<SecretMetadata[]> {
      const results: SecretMetadata[] = [];
      isolatedStore.forEach((stored) => {
        if (stored.metadata.workspaceId === workspaceId) {
          results.push(stored.metadata);
        }
      });
      return results;
    },

    async delete(secretId: string): Promise<boolean> {
      return isolatedStore.delete(secretId);
    },
  };
}
