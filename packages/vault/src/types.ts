/**
 * Options for encrypting secrets
 */
export interface EncryptOptions {
	name?: string;
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
 * Configuration for crypto vault drivers
 */
export interface CryptoVaultConfig {
	/** Master encryption key (base64 encoded, 256-bit) */
	masterKey: string;
	/** Optional salt for key derivation */
	salt?: string;
}

/**
 * Interface for vault operations
 */
export interface Vault {
	encrypt(plaintext: string, options?: EncryptOptions): Promise<string>;
	decrypt(ciphertext: string): Promise<string>;
	listSecrets(workspaceId: string): Promise<SecretMetadata[]>;
	deleteSecret(secretId: string): Promise<boolean>;
	getSecret(secretId: string): Promise<string | null>;
}

/**
 * Interface for vault drivers (storage backends)
 *
 * Drivers MUST implement encrypt/decrypt.
 * Persistent drivers SHOULD also implement store/retrieve/list/delete
 * to support the full Vault interface without in-memory fallbacks.
 */
export interface VaultDriver {
	encrypt(plaintext: string, options?: EncryptOptions): Promise<string>;
	decrypt(ciphertext: string): Promise<string>;

	/** Store a secret (persistent drivers) */
	store?(secret: StoredSecret): Promise<void>;
	/** Retrieve a stored secret by ID (persistent drivers) */
	retrieve?(secretId: string): Promise<StoredSecret | null>;
	/** List secrets for a workspace (persistent drivers) */
	list?(workspaceId: string): Promise<SecretMetadata[]>;
	/** Delete a secret by ID (persistent drivers) */
	delete?(secretId: string): Promise<boolean>;
}
