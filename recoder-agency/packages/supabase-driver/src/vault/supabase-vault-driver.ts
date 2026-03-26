import type { VaultDriver } from "@recoder/vault";

interface SupabaseVaultDriverConfig {
	url: string;
	serviceKey: string;
}

function isPlaceholderUrl(url: string): boolean {
	return !url || url.includes("placeholder") || url.length < 10;
}

/**
 * Creates a Supabase-based vault driver
 * Uses Supabase Vault extension for storing encrypted secrets.
 *
 * When the URL is a placeholder (e.g. during local development without
 * Supabase), all operations throw with a descriptive message instead of
 * crashing with ENOTFOUND.
 */
export function supabaseVaultDriver(
	config: SupabaseVaultDriverConfig,
): VaultDriver {
	const { url, serviceKey } = config;

	if (isPlaceholderUrl(url)) {
		return {
			async encrypt(_plaintext, _options): Promise<string> {
				throw new Error(
					"Supabase vault is not configured (placeholder URL). Cannot encrypt secrets.",
				);
			},
			async decrypt(_secretId: string): Promise<string> {
				throw new Error(
					"Supabase vault is not configured (placeholder URL). Cannot decrypt secrets.",
				);
			},
		};
	}

	// Lazy-load @supabase/supabase-js only when actually needed to avoid
	// ENOTFOUND crashes when the URL is a placeholder.
	// biome-ignore lint/suspicious/noExplicitAny: dynamic require for conditional loading
	let _supabase: any = null;
	function getClient() {
		if (!_supabase) {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const { createClient } = require("@supabase/supabase-js");
			_supabase = createClient(url, serviceKey);
		}
		return _supabase;
	}

	return {
		async encrypt(plaintext, _options): Promise<string> {
			const supabase = getClient();
			// Create a secret in the Supabase Vault
			const { data, error } = await supabase.rpc("create_secret", {
				plaintext,
			});

			if (error) {
				throw new Error(`Failed to store secret in Vault: ${error.message}`);
			}

			// Return the UUID of the created secret
			return data;
		},

		async decrypt(secretId: string): Promise<string> {
			const supabase = getClient();
			// Query the decrypted_secrets view to get the plaintext
			const { data, error } = await supabase.rpc("decrypt_secret", {
				secret_id: secretId,
			});
			if (error) {
				throw new Error(
					`Failed to retrieve secret from Vault: ${error.message}`,
				);
			}

			if (!data) {
				throw new Error(`Secret not found or cannot be decrypted: ${secretId}`);
			}

			return data;
		},
	};
}
