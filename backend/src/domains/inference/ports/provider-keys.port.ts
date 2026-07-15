/**
 * BYOK provider-key seams: the durable metadata repository, the envelope-
 * encryption vault port, and the encrypted TTL cache the delivery ladder reads
 * per-user keys through.
 *
 * SECURITY: no key material is ever persisted in the metadata table — only a
 * `vaultRef` + `keyVersion`. Plaintext keys travel ONLY through the injected
 * `KeyVaultPort` (AES-256-GCM at rest) and the short-TTL in-memory cache; they
 * are never logged, never surfaced from health, never echoed over HTTP.
 */
import type { ProviderKeyRecord } from '../types.js';

/** A map of provider → API key (BYOK). The value shape the cache round-trips. */
export type AIProviderKeys = Readonly<Record<string, string>>;

/**
 * The envelope-encryption seam the key cache uses. A null/absent master key
 * yields an unavailable vault whose encrypt/decrypt reject — keys are never
 * cached in plaintext (mirrors the governance vault posture).
 */
export interface KeyVaultPort {
  /** True when a master key is configured (caching is enabled). */
  readonly available: boolean;
  /** Encrypt plaintext → opaque ciphertext string. Rejects when unavailable. */
  encrypt(plaintext: string): Promise<string>;
  /** Decrypt ciphertext → plaintext. Rejects when unavailable or tampered. */
  decrypt(ciphertext: string): Promise<string>;
}

/**
 * The encrypted, TTL-bounded per-user key cache. Ported from
 * `backend/src/engines/byok-key-cache.ts` (whose `./vault` + `./public-api`
 * imports were removed in the src refactor) — decoupled here behind an injectable
 * {@link KeyVaultPort} so it compiles and unit-tests without the legacy vault.
 */
export interface ProviderKeyCache {
  /** Cached keys for a user, or null on miss / expiry / disabled cache. */
  get(userId: string): Promise<AIProviderKeys | null>;
  /** Store keys encrypted at rest (no-op when the vault is unavailable). */
  set(userId: string, keys: AIProviderKeys): Promise<void>;
  /** Drop one user's cached keys. */
  invalidate(userId: string): void;
  /** Drop every cached entry. */
  clear(): void;
}

/** The durable metadata repository (no ciphertext) for BYOK provider keys. */
export interface ProviderKeyRepository {
  /** Every provider-key metadata row for a user. */
  listForUser(userId: string): Promise<readonly ProviderKeyRecord[]>;
  /** One provider's metadata for a user (null when absent). */
  get(userId: string, provider: string): Promise<ProviderKeyRecord | null>;
  /** Upsert metadata (records presence + vaultRef; bumps nothing). */
  upsert(input: {
    readonly userId: string;
    readonly provider: string;
    readonly vaultRef?: string | null;
  }): Promise<ProviderKeyRecord | null>;
  /** Bump `key_version` + set `rotated_at` on rotation (null when absent). */
  rotate(userId: string, provider: string): Promise<ProviderKeyRecord | null>;
  /** Stamp `last_used_at` (best-effort; drives routing/audit). */
  markUsed(userId: string, provider: string): Promise<void>;
  /** Delete a provider-key metadata row (true when a row was removed). */
  delete(userId: string, provider: string): Promise<boolean>;
  /** True when the durable backing is available (drives truthful health). */
  isDurable(): boolean;
}
