/**
 * `sk_` platform API key contracts.
 *
 * Three seams:
 *  - {@link ApiKeyStore}     — persistence contract (the api-key.service depends
 *                              on THIS, never on `pg`); implemented over the
 *                              persistence `QueryExecutor`.
 *  - {@link ApiKeyValidator} — the NARROW read the `PrincipalService` depends on
 *                              to resolve a `kind: 'apikey'` principal. Frozen so
 *                              the credential seam does not couple to the full
 *                              service.
 *  - {@link ApiKeyService}   — the full mint/validate/list/revoke surface the
 *                              api-keys routes + MCP tools consume.
 *
 * Security invariants (enforced by the impl, not this port): the raw key is
 * returned exactly once at mint and NEVER stored; only `sha256(pepper||key)` +
 * an indexed prefix are persisted; validation is constant-time; every
 * mint/revoke passes the governance gate.
 */
import type { PlatformApiKey } from '../types.js';

/** The minimal successful validation result mapped into a `Principal`. */
export interface ApiKeyValidation {
  /** The validated key's id (for `last_used_at` touch + audit). */
  readonly keyId: string;
  /** Owning canonical `user.id`. */
  readonly userId: string;
  /** Optional org scope carried by the key. */
  readonly orgId?: string;
  /** Scopes granted to the key. */
  readonly scopes: readonly string[];
}

/**
 * The narrow contract the {@link SessionVerifier} impl depends on. Injected
 * into `PrincipalService`; absent → `sk_` resolution degrades to `null`.
 */
export interface ApiKeyValidator {
  /**
   * Validate a raw `sk_` key in constant time.
   * @returns the validation info, or `null` when unknown/expired/revoked.
   */
  validate(rawKey: string): Promise<ApiKeyValidation | null>;
}

/** Fields required to persist a freshly minted key. */
export interface NewApiKeyRecord {
  readonly id: string;
  readonly userId: string;
  readonly orgId?: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly keyHash: string;
  readonly scopes: readonly string[];
  readonly expiresAt?: Date | null;
}

/** Persistence contract for `platform_api_key`. */
export interface ApiKeyStore {
  /** Insert a new (already-hashed) key record. */
  insert(record: NewApiKeyRecord): Promise<PlatformApiKey>;
  /** Look up candidate keys by indexed prefix (constant-time hash compare follows). */
  findByPrefix(keyPrefix: string): Promise<readonly PlatformApiKey[]>;
  /** List a user's keys (masked; never returns the hash to callers of the service). */
  listForUser(userId: string): Promise<readonly PlatformApiKey[]>;
  /** Revoke a key owned by `userId`; returns `true` when a row was revoked. */
  revoke(id: string, userId: string): Promise<boolean>;
  /** Best-effort async update of `last_used_at` (never blocks validation). */
  touchLastUsed(id: string): Promise<void>;
}

/** Parameters for minting a new `sk_` key. */
export interface MintApiKeyParams {
  readonly userId: string;
  readonly orgId?: string;
  readonly name: string;
  readonly scopes?: readonly string[];
  /** Optional expiry; omit for a non-expiring key. */
  readonly expiresAt?: Date | null;
}

/** The result of a mint — the raw key is present ONCE here and never again. */
export interface MintedApiKey {
  /** The full raw `sk_...` key. Show to the user once; it is not recoverable. */
  readonly rawKey: string;
  /** The persisted (masked) record. */
  readonly record: PlatformApiKey;
}

/** The full `sk_` key service surface. */
export interface ApiKeyService extends ApiKeyValidator {
  mint(params: MintApiKeyParams): Promise<MintedApiKey>;
  list(userId: string): Promise<readonly PlatformApiKey[]>;
  revoke(id: string, userId: string): Promise<boolean>;
}
