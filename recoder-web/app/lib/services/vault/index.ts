/**
 * Vault - Secret management for Recoder
 *
 * This module provides encrypted secret storage with support for:
 * - AES-256-GCM encryption using Web Crypto API
 * - Per-workspace secret isolation
 * - Noop driver for testing
 *
 * Usage:
 *
 * ```typescript
 * // For production with encryption
 * import { createSecureWorkspaceSecrets } from '~/lib/services/vault';
 *
 * const secrets = createSecureWorkspaceSecrets('workspace-123');
 * await secrets.setSecret('API_KEY', 'sk-xxx');
 * const apiKey = await secrets.getSecret('API_KEY');
 *
 * // For testing with noop driver
 * import { createVault, noopVaultDriver } from '~/lib/services/vault';
 *
 * const vault = createVault(noopVaultDriver);
 * const encrypted = await vault.encrypt('secret');
 * const decrypted = await vault.decrypt(encrypted);
 * ```
 */

// Core types
export type {
  Vault,
  VaultDriver,
  EncryptOptions,
  SecretMetadata,
  StoredSecret,
  CryptoVaultConfig,
} from './types';

// Vault creation
export { createVault } from './create-vault';

// Vault drivers
export { noopVaultDriver, createNoopVaultDriver } from './noop-vault';
export {
  createCryptoVaultDriver,
  createWorkspaceScopedCryptoDriver,
} from './crypto-vault';

// Workspace secrets (high-level API)
export type {
  Secret,
  SecretSummary,
  WorkspaceSecrets,
} from './workspace-secrets';
export {
  createWorkspaceSecrets,
  createSecureWorkspaceSecrets,
} from './workspace-secrets';

// Crypto utilities
export {
  generateKey,
  exportKey,
  importKey,
  deriveKey,
  encrypt,
  decrypt,
  generateSecretId,
  generateSalt,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from './crypto-utils';
