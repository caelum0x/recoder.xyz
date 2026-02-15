import crypto from "crypto";
import type { VaultDriver, EncryptOptions, SecretMetadata } from "./types";

export const VAULT_V1_PREFIX = "vault:v1:";

/**
 * Parse a base64-encoded master key from an environment variable.
 * Returns a 32-byte Buffer suitable for AES-256, or null if invalid/missing.
 */
export function parseMasterKey(raw: string | undefined): Buffer | null {
	if (!raw) return null;
	const key = Buffer.from(raw, "base64");
	if (key.length !== 32) return null;
	return key;
}

/**
 * Encrypt plaintext with AES-256-GCM → `vault:v1:{iv_hex}:{ciphertext+authTag_hex}`
 */
export function encryptV1(plaintext: string, key: Buffer): string {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();
	return `${VAULT_V1_PREFIX}${iv.toString("hex")}:${Buffer.concat([encrypted, authTag]).toString("hex")}`;
}

/**
 * Decrypt a `vault:v1:` ciphertext string back to plaintext.
 * Throws if the input is not vault:v1: format or if the auth tag fails.
 */
export function decryptV1(ciphertext: string, key: Buffer): string {
	if (!ciphertext.startsWith(VAULT_V1_PREFIX)) {
		throw new Error("Not a vault:v1: ciphertext");
	}
	const rest = ciphertext.slice(VAULT_V1_PREFIX.length);
	const colonIdx = rest.indexOf(":");
	if (colonIdx === -1) throw new Error("Malformed vault ciphertext");
	const iv = Buffer.from(rest.slice(0, colonIdx), "hex");
	const combined = Buffer.from(rest.slice(colonIdx + 1), "hex");
	const authTag = combined.subarray(combined.length - 16);
	const encryptedBuf = combined.subarray(0, combined.length - 16);
	const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(authTag);
	return Buffer.concat([decipher.update(encryptedBuf), decipher.final()]).toString("utf8");
}

/**
 * Check whether a string looks like a vault:v1: ciphertext.
 */
export function isVaultV1(value: string): boolean {
	return value.startsWith(VAULT_V1_PREFIX);
}

/**
 * Create a VaultDriver backed by Node.js crypto (AES-256-GCM).
 *
 * This driver only implements encrypt/decrypt (no persistent storage).
 * Use `createVault(driver)` to wrap it with the full Vault interface.
 */
export function createNodeCryptoDriver(config: {
	masterKey: string;
}): VaultDriver {
	const key = parseMasterKey(config.masterKey);
	if (!key) {
		throw new Error(
			"Invalid masterKey: must be a base64-encoded 32-byte (256-bit) key",
		);
	}

	return {
		async encrypt(plaintext: string, _options?: EncryptOptions): Promise<string> {
			return encryptV1(plaintext, key);
		},
		async decrypt(ciphertext: string): Promise<string> {
			return decryptV1(ciphertext, key);
		},
	};
}
