/**
 * Crypto Vault Driver - Real encryption using Web Crypto API
 * Provides AES-256-GCM encryption for secrets
 */

import type {
  VaultDriver,
  EncryptOptions,
  StoredSecret,
  SecretMetadata,
  CryptoVaultConfig,
} from './types';
import {
  importKey,
  deriveKey,
  encrypt,
  decrypt,
  generateSecretId,
} from './crypto-utils';

/**
 * Serialized format for encrypted secrets
 * Contains all information needed to decrypt the secret
 */
interface SerializedSecret {
  version: 1;
  ciphertext: string;
  iv: string;
  metadata: SecretMetadata;
}

/**
 * In-memory storage for secrets (can be extended with persistent storage)
 */
const secretsStore = new Map<string, StoredSecret>();

/**
 * Create a crypto vault driver with AES-256-GCM encryption
 */
export function createCryptoVaultDriver(
  config: CryptoVaultConfig
): VaultDriver {
  let encryptionKey: CryptoKey | null = null;

  /**
   * Get or initialize the encryption key
   */
  async function getKey(): Promise<CryptoKey> {
    if (encryptionKey) {
      return encryptionKey;
    }

    if (config.salt) {
      // Derive key from master key and salt
      encryptionKey = await deriveKey(config.masterKey, config.salt);
    } else {
      // Use master key directly (must be a valid 256-bit key in base64)
      encryptionKey = await importKey(config.masterKey);
    }

    return encryptionKey;
  }

  return {
    async encrypt(plaintext: string, options?: EncryptOptions): Promise<string> {
      const key = await getKey();
      const { ciphertext, iv } = await encrypt(plaintext, key);

      const secretId = generateSecretId();
      const now = Date.now();

      const metadata: SecretMetadata = {
        id: secretId,
        name: options?.name,
        description: options?.description,
        workspaceId: options?.workspaceId,
        createdAt: now,
        updatedAt: now,
        algorithm: 'AES-256-GCM',
      };

      const storedSecret: StoredSecret = {
        ciphertext,
        iv,
        metadata,
      };

      // Store in memory
      secretsStore.set(secretId, storedSecret);

      // Return serialized format
      const serialized: SerializedSecret = {
        version: 1,
        ciphertext,
        iv,
        metadata,
      };

      return JSON.stringify(serialized);
    },

    async decrypt(serializedCiphertext: string): Promise<string> {
      const key = await getKey();

      // Parse the serialized format
      const parsed: SerializedSecret = JSON.parse(serializedCiphertext);

      if (parsed.version !== 1) {
        throw new Error(`Unsupported secret version: ${parsed.version}`);
      }

      return decrypt(parsed.ciphertext, parsed.iv, key);
    },

    async store(secret: StoredSecret): Promise<void> {
      secretsStore.set(secret.metadata.id, secret);
    },

    async retrieve(secretId: string): Promise<StoredSecret | null> {
      return secretsStore.get(secretId) || null;
    },

    async list(workspaceId: string): Promise<SecretMetadata[]> {
      const results: SecretMetadata[] = [];
      secretsStore.forEach((secret) => {
        if (secret.metadata.workspaceId === workspaceId) {
          results.push(secret.metadata);
        }
      });
      return results;
    },

    async delete(secretId: string): Promise<boolean> {
      return secretsStore.delete(secretId);
    },
  };
}

/**
 * Create a crypto vault driver with workspace-scoped encryption
 * Each workspace gets its own derived key
 */
export function createWorkspaceScopedCryptoDriver(
  config: CryptoVaultConfig
): VaultDriver & {
  getWorkspaceKey(workspaceId: string): Promise<CryptoKey>;
} {
  const workspaceKeys = new Map<string, CryptoKey>();

  /**
   * Get or derive the encryption key for a specific workspace
   */
  async function getWorkspaceKey(workspaceId: string): Promise<CryptoKey> {
    if (workspaceKeys.has(workspaceId)) {
      return workspaceKeys.get(workspaceId)!;
    }

    // Derive a unique key for this workspace
    const salt = config.salt
      ? `${config.salt}:${workspaceId}`
      : workspaceId;
    const key = await deriveKey(config.masterKey, salt);
    workspaceKeys.set(workspaceId, key);

    return key;
  }

  return {
    getWorkspaceKey,

    async encrypt(plaintext: string, options?: EncryptOptions): Promise<string> {
      const workspaceId = options?.workspaceId || 'default';
      const key = await getWorkspaceKey(workspaceId);
      const { ciphertext, iv } = await encrypt(plaintext, key);

      const secretId = generateSecretId();
      const now = Date.now();

      const metadata: SecretMetadata = {
        id: secretId,
        name: options?.name,
        description: options?.description,
        workspaceId,
        createdAt: now,
        updatedAt: now,
        algorithm: 'AES-256-GCM-WORKSPACE',
      };

      const storedSecret: StoredSecret = {
        ciphertext,
        iv,
        metadata,
      };

      // Store in memory
      secretsStore.set(secretId, storedSecret);

      // Return serialized format
      const serialized: SerializedSecret = {
        version: 1,
        ciphertext,
        iv,
        metadata,
      };

      return JSON.stringify(serialized);
    },

    async decrypt(serializedCiphertext: string): Promise<string> {
      // Parse the serialized format
      const parsed: SerializedSecret = JSON.parse(serializedCiphertext);

      if (parsed.version !== 1) {
        throw new Error(`Unsupported secret version: ${parsed.version}`);
      }

      const workspaceId = parsed.metadata.workspaceId || 'default';
      const key = await getWorkspaceKey(workspaceId);

      return decrypt(parsed.ciphertext, parsed.iv, key);
    },

    async store(secret: StoredSecret): Promise<void> {
      secretsStore.set(secret.metadata.id, secret);
    },

    async retrieve(secretId: string): Promise<StoredSecret | null> {
      return secretsStore.get(secretId) || null;
    },

    async list(workspaceId: string): Promise<SecretMetadata[]> {
      const results: SecretMetadata[] = [];
      secretsStore.forEach((secret) => {
        if (secret.metadata.workspaceId === workspaceId) {
          results.push(secret.metadata);
        }
      });
      return results;
    },

    async delete(secretId: string): Promise<boolean> {
      return secretsStore.delete(secretId);
    },
  };
}
