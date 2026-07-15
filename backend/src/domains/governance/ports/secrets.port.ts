/**
 * `SecretsPort` + `SecretRepository` — the secrets seam.
 *
 * `SecretsPort` is the SERVICE surface consumed by identity (`sk_` keys),
 * billing, inference (BYOK), and interop (connector creds): it envelope-encrypts
 * plaintext via the vault and stores CIPHERTEXT ONLY through the
 * `SecretRepository`. Plaintext is never persisted and never logged.
 *
 * `SecretRepository` is the PERSISTENCE contract (`governance_secrets`, ciphertext
 * + nonce + key_version only), declared here and implemented over the
 * persistence `QueryExecutor` in `repositories/secret.repository.ts`.
 *
 * FAIL-SAFE: when the vault master key is absent the service reports `down` and
 * `get`/`set` reject with `SERVICE_UNAVAILABLE` — never a plaintext fallback,
 * never a faked write.
 */
import type { SecretRef } from '../types.js';

/** The SERVICE surface (envelope encryption + rotation, app-layer scoped). */
export interface SecretsPort {
  /** Decrypt and return a secret's plaintext for its owner, or `null` when absent. */
  get(ownerUserId: string, ref: string): Promise<string | null>;

  /** Envelope-encrypt and store a secret (insert or overwrite for the owner+ref). */
  set(ownerUserId: string, ref: string, plaintext: string): Promise<SecretRef>;

  /** Re-encrypt under the current key version (bumps `key_version`, sets `rotated_at`). */
  rotate(ownerUserId: string, ref: string): Promise<SecretRef | null>;

  /** Delete a secret. Returns `true` when a row was removed. */
  delete(ownerUserId: string, ref: string): Promise<boolean>;

  /** List a caller's secret refs (metadata only — never plaintext). */
  list(ownerUserId: string): Promise<readonly SecretRef[]>;
}

/** A stored ciphertext row (no plaintext ever crosses this port). */
export interface SecretCipherRow {
  readonly id: string;
  readonly ref: string;
  readonly ownerUserId: string;
  /** Envelope-encrypted bytes (AES-GCM). */
  readonly ciphertext: Buffer;
  /** The AES-GCM nonce/iv. */
  readonly nonce: Buffer;
  readonly keyVersion: number;
  readonly rotatedAt?: string | null;
  readonly createdAt: string;
}

/** Fields to persist an encrypted secret (ciphertext only). */
export interface SecretCipherInput {
  readonly ref: string;
  readonly ownerUserId: string;
  readonly ciphertext: Buffer;
  readonly nonce: Buffer;
  readonly keyVersion: number;
}

/** The PERSISTENCE contract — stores ciphertext, never plaintext. */
export interface SecretRepository {
  /** Insert or overwrite (owner+ref unique) an encrypted secret row. */
  upsert(input: SecretCipherInput): Promise<SecretCipherRow>;

  /** Fetch the encrypted row for owner+ref, or `null` when absent. */
  find(ownerUserId: string, ref: string): Promise<SecretCipherRow | null>;

  /** Bump the key version + ciphertext for an existing row (rotation). */
  rotate(ownerUserId: string, ref: string, ciphertext: Buffer, nonce: Buffer, keyVersion: number): Promise<SecretCipherRow | null>;

  /** Delete owner+ref. Returns `true` when removed. */
  remove(ownerUserId: string, ref: string): Promise<boolean>;

  /** List an owner's secret metadata (no ciphertext bytes returned). */
  listRefs(ownerUserId: string): Promise<readonly SecretRef[]>;
}
