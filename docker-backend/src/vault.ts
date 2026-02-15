/**
 * Shared VaultDriver singleton for docker-backend.
 *
 * Uses `createNodeCryptoDriver` from `@giselles-ai/vault` when
 * `VAULT_MASTER_KEY` is set, otherwise returns null (caching/encryption disabled).
 */

import { createNodeCryptoDriver, noopVaultDriver } from '@giselles-ai/vault';
import type { VaultDriver } from '@giselles-ai/vault';

let _driver: VaultDriver | null = null;
let _initialized = false;

/**
 * Get the configured VaultDriver. Returns null if VAULT_MASTER_KEY is not set.
 * The driver is created once and cached for the process lifetime.
 */
export function getVaultDriver(): VaultDriver | null {
  if (_initialized) return _driver;
  _initialized = true;

  const masterKey = process.env.VAULT_MASTER_KEY;
  if (!masterKey) return null;

  try {
    _driver = createNodeCryptoDriver({ masterKey });
    return _driver;
  } catch {
    return null;
  }
}

/**
 * Get a VaultDriver that falls back to noop (passthrough) when no master key is set.
 * Useful when you always want a driver but encryption is optional.
 */
export function getVaultDriverOrNoop(): VaultDriver {
  return getVaultDriver() ?? noopVaultDriver;
}

/** Reset the singleton (for tests only). */
export function _resetVaultDriver(): void {
  _driver = null;
  _initialized = false;
}
