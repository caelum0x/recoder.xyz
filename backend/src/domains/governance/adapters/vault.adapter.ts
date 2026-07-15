/**
 * `vault.adapter` — the envelope-encryption seam for the secrets engine.
 *
 * Wraps `@recoder/vault`'s `node-crypto` AES-256-GCM driver (reused in place,
 * never reimplemented) and adapts its single-string `vault:v1:{iv}:{body}` output
 * to the two-column storage the `SecretRepository` expects (`ciphertext` bytea +
 * `nonce` bytea). The 12-byte GCM IV becomes the stored `nonce`; the ciphertext +
 * 16-byte auth tag become the stored `ciphertext`.
 *
 * FAIL-SAFE (the core secrets invariant): when the vault master key is absent or
 * malformed the adapter reports `available: false` and `status(): down`, and
 * `seal`/`open` throw. The secrets service turns that into a `SERVICE_UNAVAILABLE`
 * — NEVER a plaintext fallback, NEVER a faked write. There is no `noop` cipher
 * path that would silently store plaintext.
 */
import {
  createNodeCryptoDriver,
  parseMasterKey,
  VAULT_V1_PREFIX,
  type VaultDriver,
} from '@recoder/vault';
import type { EngineStatus } from '../../../shared/health-types.js';

/** A single envelope-encrypted value split for two-column storage. */
export interface SealedSecret {
  /** Ciphertext + GCM auth tag bytes. */
  readonly ciphertext: Buffer;
  /** The 12-byte GCM nonce/IV. */
  readonly nonce: Buffer;
}

/**
 * The vault seam consumed by `SecretsService`. `seal`/`open` throw when the
 * vault is unavailable; callers must check `available` (or catch) and degrade to
 * `SERVICE_UNAVAILABLE` rather than storing or returning plaintext.
 */
export interface VaultAdapter {
  /** True only when a valid 32-byte master key produced a working cipher. */
  readonly available: boolean;
  /** The current master-key generation stamped onto freshly-sealed rows. */
  readonly keyVersion: number;
  /** Truthful engine status for governance health aggregation. */
  status(): EngineStatus;
  /** Envelope-encrypt plaintext into `{ ciphertext, nonce }`. Throws when down. */
  seal(plaintext: string): Promise<SealedSecret>;
  /** Decrypt a stored `{ ciphertext, nonce }` back to plaintext. Throws when down. */
  open(ciphertext: Buffer, nonce: Buffer): Promise<string>;
}

const VAULT_UNAVAILABLE =
  'governance vault unavailable: no valid 32-byte base64 master key configured';

/**
 * Build the vault adapter from the governance config's `vaultMasterKey`
 * (base64, 32 bytes). A `null`/invalid key yields a permanently-`down` adapter
 * whose `seal`/`open` throw — the fail-safe posture, never a silent plaintext
 * store.
 */
export function createVaultAdapter(cfg: {
  readonly vaultMasterKey: string | null;
  readonly keyVersion?: number;
}): VaultAdapter {
  const keyVersion = cfg.keyVersion ?? 1;
  const key = parseMasterKey(cfg.vaultMasterKey ?? undefined);

  if (!key) {
    return {
      available: false,
      keyVersion,
      status: () => ({ name: 'vault', status: 'down', reason: VAULT_UNAVAILABLE }),
      seal: () => Promise.reject(unavailable()),
      open: () => Promise.reject(unavailable()),
    };
  }

  // `createNodeCryptoDriver` re-validates the key and owns the AES-256-GCM
  // encrypt/decrypt (incl. auth-tag handling). We only split/join its wire form.
  const driver: VaultDriver = createNodeCryptoDriver({
    masterKey: cfg.vaultMasterKey as string,
  });

  return {
    available: true,
    keyVersion,
    status: () => ({ name: 'vault', status: 'up' }),
    async seal(plaintext: string): Promise<SealedSecret> {
      const wire = await driver.encrypt(plaintext);
      return splitWire(wire);
    },
    async open(ciphertext: Buffer, nonce: Buffer): Promise<string> {
      return driver.decrypt(joinWire(ciphertext, nonce));
    },
  };
}

function unavailable(): Error {
  return new Error(VAULT_UNAVAILABLE);
}

/** Split `vault:v1:{iv_hex}:{body_hex}` into `{ nonce, ciphertext }` buffers. */
function splitWire(wire: string): SealedSecret {
  if (!wire.startsWith(VAULT_V1_PREFIX)) {
    // Defensive: the wrapped driver changed format — refuse rather than guess.
    throw new Error('governance vault: unexpected cipher wire format');
  }
  const rest = wire.slice(VAULT_V1_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep === -1) throw new Error('governance vault: malformed cipher wire');
  return {
    nonce: Buffer.from(rest.slice(0, sep), 'hex'),
    ciphertext: Buffer.from(rest.slice(sep + 1), 'hex'),
  };
}

/** Rebuild the `vault:v1:{iv_hex}:{body_hex}` wire form from stored buffers. */
function joinWire(ciphertext: Buffer, nonce: Buffer): string {
  return `${VAULT_V1_PREFIX}${nonce.toString('hex')}:${ciphertext.toString('hex')}`;
}
