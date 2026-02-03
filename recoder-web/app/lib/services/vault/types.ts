/**
 * Vault Types - Secret management interfaces
 */

/**
 * Options for encrypting secrets
 */
export interface EncryptOptions {
  /** Human-readable name for the secret */
  name?: string;
  /** Description of what the secret is used for */
  description?: string;
  /** Workspace ID to scope the secret to */
  workspaceId?: string;
}

/**
 * Metadata stored alongside encrypted secrets
 */
export interface SecretMetadata {
  /** Unique identifier for the secret */
  id: string;
  /** Human-readable name */
  name?: string;
  /** Description */
  description?: string;
  /** Workspace this secret belongs to */
  workspaceId?: string;
  /** When the secret was created */
  createdAt: number;
  /** When the secret was last updated */
  updatedAt: number;
  /** Algorithm used for encryption */
  algorithm: string;
}

/**
 * Stored secret with encrypted data and metadata
 */
export interface StoredSecret {
  /** Encrypted ciphertext (base64 encoded) */
  ciphertext: string;
  /** Initialization vector (base64 encoded) */
  iv: string;
  /** Secret metadata */
  metadata: SecretMetadata;
}

/**
 * Interface for vault operations
 */
export interface Vault {
  /**
   * Encrypts a plaintext string
   * @param plaintext - The plaintext to encrypt
   * @param options - Optional encryption options
   * @returns The encrypted ciphertext (serialized format)
   */
  encrypt(plaintext: string, options?: EncryptOptions): Promise<string>;

  /**
   * Decrypts a ciphertext string
   * @param ciphertext - The ciphertext to decrypt (serialized format)
   * @returns The decrypted plaintext
   */
  decrypt(ciphertext: string): Promise<string>;

  /**
   * Lists all secrets for a workspace
   * @param workspaceId - The workspace ID to list secrets for
   * @returns Array of secret metadata (without the actual secret values)
   */
  listSecrets(workspaceId: string): Promise<SecretMetadata[]>;

  /**
   * Deletes a secret by ID
   * @param secretId - The ID of the secret to delete
   * @returns True if deleted, false if not found
   */
  deleteSecret(secretId: string): Promise<boolean>;

  /**
   * Gets a secret by ID and decrypts it
   * @param secretId - The ID of the secret to get
   * @returns The decrypted secret value, or null if not found
   */
  getSecret(secretId: string): Promise<string | null>;
}

/**
 * Interface for vault drivers (storage backends)
 */
export interface VaultDriver {
  /**
   * Encrypts a plaintext string
   * @param plaintext - The plaintext to encrypt
   * @param options - Optional encryption options
   * @returns The encrypted ciphertext (serialized format)
   */
  encrypt(plaintext: string, options?: EncryptOptions): Promise<string>;

  /**
   * Decrypts a ciphertext string
   * @param ciphertext - The ciphertext to decrypt (serialized format)
   * @returns The decrypted plaintext
   */
  decrypt(ciphertext: string): Promise<string>;

  /**
   * Store a secret (optional - for persistent drivers)
   */
  store?(secret: StoredSecret): Promise<void>;

  /**
   * Retrieve a stored secret by ID (optional - for persistent drivers)
   */
  retrieve?(secretId: string): Promise<StoredSecret | null>;

  /**
   * List secrets for a workspace (optional - for persistent drivers)
   */
  list?(workspaceId: string): Promise<SecretMetadata[]>;

  /**
   * Delete a secret by ID (optional - for persistent drivers)
   */
  delete?(secretId: string): Promise<boolean>;
}

/**
 * Configuration for the crypto vault driver
 */
export interface CryptoVaultConfig {
  /** Master encryption key (base64 encoded, 256-bit) */
  masterKey: string;
  /** Optional salt for key derivation */
  salt?: string;
}
