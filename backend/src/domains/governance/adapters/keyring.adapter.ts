/**
 * `keyring.adapter` — a VERSIONED master-key ring over the vault seam.
 *
 * The single-key {@link createVaultAdapter} seals/opens under ONE master key and
 * merely stamps a monotonic `keyVersion` counter onto rows. That makes real
 * master-key rotation impossible: once the key changes, every prior row becomes
 * undecryptable. The keyring closes that gap WITHOUT changing the on-disk seal
 * envelope (rows still carry only `ciphertext`, `nonce`, `keyVersion`):
 *
 *   - OPEN a row by ITS OWN `keyVersion` — so a value sealed under v1 keeps
 *     opening after v2 becomes active (BACKWARD COMPATIBLE / never data-loss).
 *   - SEAL new writes under the ACTIVE version (the newest master key).
 *   - RE-KEY a row: decrypt under its stored version's key, then re-seal under
 *     the active version — the primitive a background re-wrap sweep drives to
 *     migrate v(n) rows onto v(n+1).
 *
 * Each version is backed by an independent single-key {@link VaultAdapter}, so
 * the AES-256-GCM encrypt/decrypt + auth-tag handling stays the reused
 * `@recoder/vault` driver — the keyring only routes to the right key.
 *
 * FAIL-SAFE (unchanged): when the ACTIVE version has no valid 32-byte key the
 * ring reports `available: false` / `status(): down` and `seal`/`rekey` throw —
 * never a plaintext fallback. Opening a row whose version is absent from the ring
 * also throws rather than guessing.
 */
import type { EngineStatus } from '../../../shared/health-types.js';
import { createVaultAdapter, type SealedSecret, type VaultAdapter } from './vault.adapter.js';

/** One entry in the ring: a base64 32-byte master key bound to a version. */
export interface KeyringKey {
  /** The monotonic key generation this master key seals/opens. */
  readonly version: number;
  /** The base64-encoded 32-byte AES-256 master key (`null`/invalid ⇒ that version is unusable). */
  readonly masterKey: string | null;
}

/** An envelope-encrypted value plus the ring version that sealed it. */
export interface SealedRow extends SealedSecret {
  /** The keyring version whose master key produced these bytes. */
  readonly keyVersion: number;
}

/**
 * The minimal stored-row shape the ring needs to OPEN or RE-KEY a value: the two
 * ciphertext columns plus the version stamp. Deliberately structural so a full
 * `SecretCipherRow` (or any future row that carries these fields) satisfies it
 * without coupling the ring to persistence.
 */
export interface KeyringRow {
  /** Ciphertext + GCM auth-tag bytes as stored. */
  readonly ciphertext: Buffer;
  /** The 12-byte GCM nonce/IV as stored. */
  readonly nonce: Buffer;
  /** The version whose master key sealed this row (used to route the OPEN). */
  readonly keyVersion: number;
}

/**
 * A versioned master-key ring: opens by row version, seals by the active
 * version, and re-keys a row from its stored version onto the active one.
 */
export interface VaultKeyring {
  /** True only when the ACTIVE version has a working 32-byte cipher. */
  readonly available: boolean;
  /** The version freshly-sealed rows (and re-keyed rows) are stamped with. */
  readonly activeVersion: number;
  /** Every version present in the ring, ascending (introspection / sweeps). */
  readonly versions: readonly number[];
  /** Truthful engine status for governance health aggregation (`name: 'vault'`). */
  status(): EngineStatus;
  /** Envelope-encrypt under the ACTIVE version. Throws when the active key is absent. */
  seal(plaintext: string): Promise<SealedRow>;
  /** Decrypt a row using ITS OWN `keyVersion`'s key. Throws when that version is absent/down. */
  open(row: KeyringRow): Promise<string>;
  /**
   * Read a v(n) row under its stored version, then re-seal it under the ACTIVE
   * version — returning the re-sealed row (new ciphertext/nonce + active
   * `keyVersion`). A no-op re-seal (row already at the active version) still
   * produces a fresh nonce/ciphertext under the same key.
   */
  rekey(row: KeyringRow): Promise<SealedRow>;
}

const KEYRING_UNAVAILABLE =
  'governance vault keyring unavailable: active version has no valid 32-byte master key';

/**
 * Build a versioned keyring from a set of `{ version, masterKey }` entries.
 * `activeVersion` defaults to the highest supplied version. Each version becomes
 * an independent single-key {@link VaultAdapter} (reusing the real AES-256-GCM
 * driver); the ring routes open/seal/rekey to the right one.
 *
 * Duplicate versions are a configuration error (they would silently shadow a
 * key) and throw at construction. An absent/invalid ACTIVE key does NOT throw —
 * it yields a fail-safe `down` ring whose `seal`/`rekey` reject, mirroring the
 * single-key adapter's posture.
 */
export function createVaultKeyring(cfg: {
  readonly keys: readonly KeyringKey[];
  readonly activeVersion?: number;
}): VaultKeyring {
  const adapters = new Map<number, VaultAdapter>();
  for (const entry of cfg.keys) {
    if (adapters.has(entry.version)) {
      throw new Error(`governance vault keyring: duplicate key version ${entry.version}`);
    }
    adapters.set(
      entry.version,
      createVaultAdapter({ vaultMasterKey: entry.masterKey, keyVersion: entry.version }),
    );
  }

  const versions = [...adapters.keys()].sort((a, b) => a - b);
  const activeVersion = cfg.activeVersion ?? (versions.length > 0 ? versions[versions.length - 1]! : 1);
  const active = adapters.get(activeVersion);
  const available = active?.available === true;

  return {
    available,
    activeVersion,
    versions,

    status(): EngineStatus {
      if (active) return active.status();
      return {
        name: 'vault',
        status: 'down',
        reason: `${KEYRING_UNAVAILABLE} (no key for active version ${activeVersion})`,
      };
    },

    async seal(plaintext: string): Promise<SealedRow> {
      const sealer = requireActive(active);
      const sealed = await sealer.seal(plaintext);
      return { ...sealed, keyVersion: activeVersion };
    },

    async open(row: KeyringRow): Promise<string> {
      const opener = adapters.get(row.keyVersion);
      if (!opener) {
        // Never guess a key — a row we can't route is refused, not silently mis-decrypted.
        throw new Error(
          `governance vault keyring: no master key for row version ${row.keyVersion}`,
        );
      }
      return opener.open(row.ciphertext, row.nonce);
    },

    async rekey(row: KeyringRow): Promise<SealedRow> {
      // Decrypt under the row's stored version, then re-seal under the active one.
      // `open` refuses an unknown version and `seal` refuses a down active key, so
      // a failed re-key never fabricates a re-sealed row.
      const plaintext = await this.open(row);
      const sealer = requireActive(active);
      const sealed = await sealer.seal(plaintext);
      return { ...sealed, keyVersion: activeVersion };
    },
  };
}

/**
 * Adapt a single legacy master key into a one-entry ring at `version` (default
 * `1`). This is the backward-compatible bridge: existing v1-sealed rows keep
 * opening, and new writes seal under the same v1 key until a v2 key is added.
 */
export function keyringFromMasterKey(
  masterKey: string | null,
  version = 1,
): VaultKeyring {
  return createVaultKeyring({ keys: [{ version, masterKey }], activeVersion: version });
}

function requireActive(active: VaultAdapter | undefined): VaultAdapter {
  if (!active || !active.available) {
    throw new Error(KEYRING_UNAVAILABLE);
  }
  return active;
}
