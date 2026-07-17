/**
 * `ByokKeyResolver` — the seam that turns a caller's stored BYOK provider key
 * into a plaintext credential AT DELIVERY TIME (and nowhere else).
 *
 * REUSE: durable ciphertext lives behind the governance `SecretsPort`
 * (`governance_secrets`, envelope-encrypted — the seam its own doc names as the
 * store for "inference (BYOK)"); the short-TTL encrypted `ProviderKeyCache`
 * fronts it; the `ProviderKeyRepository` records METADATA ONLY (presence,
 * `vaultRef`, versions) for listing/rotation audit.
 *
 * SECURITY LAWS:
 *  - plaintext keys travel only through `resolve()`'s return value → the direct
 *    provider transport's request headers; they are NEVER logged, never in error
 *    messages, never echoed over HTTP.
 *  - `store()` never throws: a missing secrets seam / vault-down store failure is
 *    a truthful `{ stored:false, reason }` (fail closed, never plaintext at rest).
 *  - `resolve()` never throws: any failure (seam unwired, vault down, absent key)
 *    resolves `null` so the delivery ladder declines truthfully.
 */
import type { Principal } from '../../identity/types.js';
import type { GovernanceGate } from '../../governance/ports/gate.port.js';
import type { ProviderKeyRecord } from '../types.js';

/**
 * The governance secrets seam (type-only view of
 * `domains/governance/ports/secrets.port.ts#SecretsPort` — no runtime coupling).
 * Narrowed to what BYOK needs: get/set/delete of an owner-scoped secret.
 */
export interface ByokSecretsPort {
  /** Decrypt and return a secret's plaintext for its owner, or `null` when absent. */
  get(ownerUserId: string, ref: string): Promise<string | null>;
  /** Envelope-encrypt and store (insert or overwrite). Rejects when the vault is down. */
  set(ownerUserId: string, ref: string, plaintext: string): Promise<{ readonly ref: string; readonly keyVersion: number }>;
  /** Delete a secret. Returns `true` when a row was removed. */
  delete(ownerUserId: string, ref: string): Promise<boolean>;
}

/**
 * The governed WRITE seam for key mutations — the `decide` facet of the
 * governance gate (`inference.key.write` is a governed action).
 */
export type InferenceKeyWriteGate = Pick<GovernanceGate, 'decide'>;
export type { Principal };

/** The truthful result of a governed key store. Never carries key material. */
export type ByokStoreResult =
  | { readonly stored: true; readonly record: ProviderKeyRecord | null; readonly ref: string }
  | { readonly stored: false; readonly reason: string };

export interface ByokKeyResolver {
  /** True when the durable secrets seam is wired (key writes + resolution possible). */
  enabled(): boolean;
  /**
   * Resolve the plaintext BYOK key for `ownerId` (user or org) + `provider`:
   * encrypted TTL cache → governance secrets (decrypt) → cache upsert. `null`
   * on miss / unwired seam / vault-down — the caller declines truthfully.
   */
  resolve(ownerId: string, provider: string): Promise<string | null>;
  /**
   * Encrypt + durably store a key, upsert the metadata row, and invalidate the
   * owner's cache entry. Truthful `{ stored:false, reason }` on any failure —
   * never a fake success, never plaintext at rest.
   */
  store(ownerId: string, provider: string, plaintextKey: string): Promise<ByokStoreResult>;
  /** Remove the durable secret + metadata row + cached entry. */
  remove(ownerId: string, provider: string): Promise<boolean>;
  /** Best-effort `last_used_at` stamp after a routed BYOK delivery (fire-and-forget). */
  markUsed(ownerId: string, provider: string): void;
}
