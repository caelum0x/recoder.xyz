/**
 * Create Vault - Factory function to create vault instances
 */

import type { Vault, VaultDriver, EncryptOptions, SecretMetadata } from './types';

/**
 * Create a vault instance from a driver
 * The vault provides a higher-level API on top of the driver
 */
export function createVault(driver: VaultDriver): Vault {
  // Track encrypted secrets by ID for retrieval
  const encryptedSecrets = new Map<string, string>();

  return {
    async encrypt(plaintext: string, options?: EncryptOptions): Promise<string> {
      const encrypted = await driver.encrypt(plaintext, options);

      // Parse to get the secret ID for tracking
      try {
        const parsed = JSON.parse(encrypted);
        if (parsed.metadata?.id) {
          encryptedSecrets.set(parsed.metadata.id, encrypted);
        }
      } catch {
        // If parsing fails, just return the encrypted value
      }

      return encrypted;
    },

    async decrypt(ciphertext: string): Promise<string> {
      return await driver.decrypt(ciphertext);
    },

    async listSecrets(workspaceId: string): Promise<SecretMetadata[]> {
      if (driver.list) {
        return await driver.list(workspaceId);
      }

      // Fallback: iterate through tracked secrets
      const results: SecretMetadata[] = [];
      encryptedSecrets.forEach((encrypted) => {
        try {
          const parsed = JSON.parse(encrypted);
          if (parsed.metadata?.workspaceId === workspaceId) {
            results.push(parsed.metadata);
          }
        } catch {
          // Skip malformed entries
        }
      });
      return results;
    },

    async deleteSecret(secretId: string): Promise<boolean> {
      if (driver.delete) {
        const deleted = await driver.delete(secretId);
        if (deleted) {
          encryptedSecrets.delete(secretId);
        }
        return deleted;
      }

      // Fallback: just remove from tracked secrets
      return encryptedSecrets.delete(secretId);
    },

    async getSecret(secretId: string): Promise<string | null> {
      // First check if driver has retrieve method
      if (driver.retrieve) {
        const stored = await driver.retrieve(secretId);
        if (stored) {
          // Reconstruct the serialized format and decrypt
          const serialized = JSON.stringify({
            version: 1,
            ciphertext: stored.ciphertext,
            iv: stored.iv,
            metadata: stored.metadata,
          });
          return await driver.decrypt(serialized);
        }
      }

      // Fallback: check tracked secrets
      const encrypted = encryptedSecrets.get(secretId);
      if (encrypted) {
        return await driver.decrypt(encrypted);
      }

      return null;
    },
  };
}
