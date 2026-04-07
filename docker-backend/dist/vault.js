"use strict";
/**
 * Shared VaultDriver singleton for docker-backend.
 *
 * Uses `createNodeCryptoDriver` from `@recoder/vault` when
 * `VAULT_MASTER_KEY` is set, otherwise returns null (caching/encryption disabled).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVaultDriver = getVaultDriver;
exports.getVaultDriverOrNoop = getVaultDriverOrNoop;
exports._resetVaultDriver = _resetVaultDriver;
const vault_1 = require("@recoder/vault");
let _driver = null;
let _initialized = false;
/**
 * Get the configured VaultDriver. Returns null if VAULT_MASTER_KEY is not set.
 * The driver is created once and cached for the process lifetime.
 */
function getVaultDriver() {
    if (_initialized)
        return _driver;
    _initialized = true;
    const masterKey = process.env.VAULT_MASTER_KEY;
    if (!masterKey)
        return null;
    try {
        _driver = (0, vault_1.createNodeCryptoDriver)({ masterKey });
        return _driver;
    }
    catch {
        return null;
    }
}
/**
 * Get a VaultDriver that falls back to noop (passthrough) when no master key is set.
 * Useful when you always want a driver but encryption is optional.
 */
function getVaultDriverOrNoop() {
    return getVaultDriver() ?? vault_1.noopVaultDriver;
}
/** Reset the singleton (for tests only). */
function _resetVaultDriver() {
    _driver = null;
    _initialized = false;
}
