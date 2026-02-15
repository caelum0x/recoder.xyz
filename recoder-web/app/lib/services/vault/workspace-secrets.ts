/**
 * Workspace Secrets - Per-workspace secret management
 * Provides a higher-level API for managing secrets scoped to workspaces
 */

import type { Vault, SecretMetadata, EncryptOptions } from './types';
import { createVault } from './create-vault';
import { createWorkspaceScopedCryptoDriver } from './crypto-vault';
import { noopVaultDriver } from './noop-vault';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('WorkspaceSecrets');

/**
 * Secret entry with value
 */
export interface Secret {
  id: string;
  name: string;
  value: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Secret entry without value (for listing)
 */
export interface SecretSummary {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Workspace secrets manager
 */
export interface WorkspaceSecrets {
  /**
   * Set a secret value
   * @param name - Name of the secret (e.g., "API_KEY", "DATABASE_URL")
   * @param value - The secret value
   * @param description - Optional description
   * @returns The secret ID
   */
  setSecret(name: string, value: string, description?: string): Promise<string>;

  /**
   * Get a secret value by name
   * @param name - Name of the secret
   * @returns The decrypted secret value, or null if not found
   */
  getSecret(name: string): Promise<string | null>;

  /**
   * Get a secret by ID
   * @param id - The secret ID
   * @returns The full secret with decrypted value, or null if not found
   */
  getSecretById(id: string): Promise<Secret | null>;

  /**
   * List all secrets (without values)
   * @returns Array of secret summaries
   */
  listSecrets(): Promise<SecretSummary[]>;

  /**
   * Delete a secret by name
   * @param name - Name of the secret to delete
   * @returns True if deleted, false if not found
   */
  deleteSecret(name: string): Promise<boolean>;

  /**
   * Delete a secret by ID
   * @param id - The secret ID to delete
   * @returns True if deleted, false if not found
   */
  deleteSecretById(id: string): Promise<boolean>;

  /**
   * Check if a secret exists
   * @param name - Name of the secret
   * @returns True if the secret exists
   */
  hasSecret(name: string): Promise<boolean>;

  /**
   * Get all secrets as a key-value object (for environment injection)
   * @returns Object with secret names as keys and decrypted values
   */
  getAllAsEnv(): Promise<Record<string, string>>;
}

/**
 * In-memory index for name-to-id mapping per workspace
 */
const workspaceNameIndex = new Map<string, Map<string, string>>();

/**
 * Get or create the name index for a workspace
 */
function getNameIndex(workspaceId: string): Map<string, string> {
  if (!workspaceNameIndex.has(workspaceId)) {
    workspaceNameIndex.set(workspaceId, new Map());
  }
  return workspaceNameIndex.get(workspaceId)!;
}

/**
 * Create a workspace secrets manager
 * @param workspaceId - The workspace ID
 * @param vault - The vault instance to use for encryption
 */
export function createWorkspaceSecrets(
  workspaceId: string,
  vault: Vault
): WorkspaceSecrets {
  const nameIndex = getNameIndex(workspaceId);

  return {
    async setSecret(name: string, value: string, description?: string): Promise<string> {
      // Check if secret with this name already exists
      const existingId = nameIndex.get(name);
      if (existingId) {
        // Delete the old secret first
        await vault.deleteSecret(existingId);
      }

      const options: EncryptOptions = {
        name,
        description,
        workspaceId,
      };

      const encrypted = await vault.encrypt(value, options);

      // Parse to get the ID
      const parsed = JSON.parse(encrypted);
      const secretId = parsed.metadata.id;

      // Update the name index
      nameIndex.set(name, secretId);

      return secretId;
    },

    async getSecret(name: string): Promise<string | null> {
      const secretId = nameIndex.get(name);
      if (!secretId) {
        return null;
      }
      return vault.getSecret(secretId);
    },

    async getSecretById(id: string): Promise<Secret | null> {
      const value = await vault.getSecret(id);
      if (value === null) {
        return null;
      }

      // Get metadata
      const allSecrets = await vault.listSecrets(workspaceId);
      const metadata = allSecrets.find((s) => s.id === id);
      if (!metadata) {
        return null;
      }

      return {
        id: metadata.id,
        name: metadata.name || id,
        value,
        description: metadata.description,
        createdAt: new Date(metadata.createdAt),
        updatedAt: new Date(metadata.updatedAt),
      };
    },

    async listSecrets(): Promise<SecretSummary[]> {
      const allSecrets = await vault.listSecrets(workspaceId);
      return allSecrets.map((metadata) => ({
        id: metadata.id,
        name: metadata.name || metadata.id,
        description: metadata.description,
        createdAt: new Date(metadata.createdAt),
        updatedAt: new Date(metadata.updatedAt),
      }));
    },

    async deleteSecret(name: string): Promise<boolean> {
      const secretId = nameIndex.get(name);
      if (!secretId) {
        return false;
      }
      const deleted = await vault.deleteSecret(secretId);
      if (deleted) {
        nameIndex.delete(name);
      }
      return deleted;
    },

    async deleteSecretById(id: string): Promise<boolean> {
      const deleted = await vault.deleteSecret(id);
      if (deleted) {
        // Remove from name index
        let nameToDelete: string | null = null;
        nameIndex.forEach((secretId, name) => {
          if (secretId === id) {
            nameToDelete = name;
          }
        });
        if (nameToDelete) {
          nameIndex.delete(nameToDelete);
        }
      }
      return deleted;
    },

    async hasSecret(name: string): Promise<boolean> {
      return nameIndex.has(name);
    },

    async getAllAsEnv(): Promise<Record<string, string>> {
      const env: Record<string, string> = {};
      const allSecrets = await vault.listSecrets(workspaceId);

      for (const metadata of allSecrets) {
        if (metadata.name) {
          const value = await vault.getSecret(metadata.id);
          if (value !== null) {
            env[metadata.name] = value;
          }
        }
      }

      return env;
    },
  };
}

/**
 * Create a workspace secrets manager with a default secure vault
 * Uses workspace-scoped encryption with a master key from environment
 */
export function createSecureWorkspaceSecrets(
  workspaceId: string,
  masterKey?: string
): WorkspaceSecrets {
  const key = masterKey || process.env.VAULT_MASTER_KEY;

  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'VAULT_MASTER_KEY is required in production for secure workspace secrets'
      );
    }
    logger.warn(
      'VAULT_MASTER_KEY not set, using noop vault (NOT SECURE FOR PRODUCTION)'
    );
    const vault = createVault(noopVaultDriver);
    return createWorkspaceSecrets(workspaceId, vault);
  }

  const driver = createWorkspaceScopedCryptoDriver({
    masterKey: key,
    salt: process.env.VAULT_SALT,
  });

  const vault = createVault(driver);
  return createWorkspaceSecrets(workspaceId, vault);
}
