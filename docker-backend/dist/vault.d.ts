/**
 * Shared VaultDriver singleton for docker-backend.
 *
 * Uses `createNodeCryptoDriver` from `@giselles-ai/vault` when
 * `VAULT_MASTER_KEY` is set, otherwise returns null (caching/encryption disabled).
 */
import type { VaultDriver } from '@giselles-ai/vault';
/**
 * Get the configured VaultDriver. Returns null if VAULT_MASTER_KEY is not set.
 * The driver is created once and cached for the process lifetime.
 */
export declare function getVaultDriver(): VaultDriver | null;
/**
 * Get a VaultDriver that falls back to noop (passthrough) when no master key is set.
 * Useful when you always want a driver but encryption is optional.
 */
export declare function getVaultDriverOrNoop(): VaultDriver;
/** Reset the singleton (for tests only). */
export declare function _resetVaultDriver(): void;
