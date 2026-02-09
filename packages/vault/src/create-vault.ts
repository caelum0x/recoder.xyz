import type { Vault, VaultDriver, EncryptOptions, SecretMetadata } from "./types";

export function createVault(driver: VaultDriver): Vault {
	// Track encrypted secrets by ID for retrieval when driver lacks storage ops
	const encryptedSecrets = new Map<string, string>();

	return {
		async encrypt(plaintext: string, options?: EncryptOptions): Promise<string> {
			const encrypted = await driver.encrypt(plaintext, options);

			try {
				const parsed = JSON.parse(encrypted);
				if (parsed.metadata?.id) {
					encryptedSecrets.set(parsed.metadata.id, encrypted);
				}
			} catch {
				// Non-JSON output (e.g. noop driver) — skip tracking
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

			return encryptedSecrets.delete(secretId);
		},

		async getSecret(secretId: string): Promise<string | null> {
			if (driver.retrieve) {
				const stored = await driver.retrieve(secretId);
				if (stored) {
					const serialized = JSON.stringify({
						version: 1,
						ciphertext: stored.ciphertext,
						iv: stored.iv,
						metadata: stored.metadata,
					});
					return await driver.decrypt(serialized);
				}
			}

			const encrypted = encryptedSecrets.get(secretId);
			if (encrypted) {
				return await driver.decrypt(encrypted);
			}

			return null;
		},
	};
}
