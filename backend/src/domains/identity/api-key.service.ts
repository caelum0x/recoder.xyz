/**
 * `ApiKeyServiceImpl` — DB-backed `sk_` platform API keys, replacing the legacy
 * in-memory `validatePlatformApiKey`.
 *
 * The full {@link ApiKeyService} surface (mint / validate / list / revoke). It is
 * also injected into `PrincipalService` as the narrow {@link ApiKeyValidator} so
 * the credential seam can resolve a `kind: 'apikey'` principal.
 *
 * Security invariants (enforced HERE, not in the port or store):
 *  - The raw key is generated once, returned once, and NEVER persisted. Only
 *    `sha256(pepper || rawKey)` (hex) + an indexed prefix are stored.
 *  - Validation is CONSTANT-TIME (`timingSafeEqual` over fixed-width hex hashes),
 *    so a wrong key cannot be distinguished from a right one by timing.
 *  - Expiry + revocation are enforced on every validate; `last_used_at` is
 *    touched best-effort and never blocks the resolve.
 *  - Every mint/revoke passes an optional {@link ApiKeyGovernance} gate (wired by
 *    the governance domain in Phase 3); absent → allowed (logged).
 *
 * Degrade-safe: when the persistence pool is unavailable, `mint`/`revoke`/`list`
 * throw `SERVICE_UNAVAILABLE` (truthful failure, never a faked success), while
 * `validate` returns `null` (an unresolvable credential is unauthenticated, not a
 * 500 — matching the `SessionVerifier` contract).
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { AppError, ErrorCode } from '../../shared/errors.js';
import type { Logger } from '../../shared/logger.js';
import type {
  ApiKeyService,
  ApiKeyStore,
  ApiKeyValidation,
  MintApiKeyParams,
  MintedApiKey,
  NewApiKeyRecord,
} from './ports/api-key.port.js';
import type { PlatformApiKey } from './types.js';

/** The `sk_` prefix every platform key carries. */
const KEY_SCHEME = 'sk_';
/** base62 alphabet for the random key body (URL-safe, no ambiguous separators). */
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/** Random entropy per key (32 bytes ≈ 43 base62 chars ≈ 190 bits). */
const KEY_ENTROPY_BYTES = 32;
/** Scopes minted onto a key when the caller specifies none. */
const DEFAULT_SCOPES: readonly string[] = ['read', 'write'];
/**
 * Scopes that confer elevated platform privilege (a `sk_` key carrying `admin`
 * passes `requireAdmin`). They are NEVER mintable unless the minting principal
 * already holds them, so a normal session can't escalate itself to super-user.
 */
const PRIVILEGED_SCOPES: ReadonlySet<string> = new Set(['admin', 'internal']);

/**
 * The narrow governance gate the mint/revoke path consults. Kept as a local
 * structural interface so this feature does not hard-depend on the (Phase-3)
 * governance package; the composer injects a real gate when available.
 */
export interface ApiKeyGovernance {
  authorize(
    action: 'key.mint' | 'key.revoke',
    context: Readonly<Record<string, unknown>>,
  ): Promise<{ readonly allowed: boolean; readonly reason?: string }>;
}

export interface ApiKeyServiceDeps {
  readonly store: ApiKeyStore;
  readonly logger: Logger;
  /**
   * The server-side pepper mixed into every key hash (`API_KEY_HASH_SALT`). When
   * absent the service still works (empty pepper) but reports it via
   * {@link ApiKeyServiceImpl.health} — rotating it invalidates all existing keys.
   */
  readonly hashSalt?: string | null;
  /** Truthful pool-availability probe (drives mint/revoke degrade). */
  readonly isAvailable?: () => boolean;
  /** Length of the indexed lookup prefix kept from the raw key (default 12). */
  readonly prefixLength?: number;
  /** Default key lifetime in days when the caller omits `expiresAt` (null = none). */
  readonly defaultTtlDays?: number | null;
  /** Optional governance gate; absent → mint/revoke allowed (logged). */
  readonly governance?: ApiKeyGovernance;
}

export class ApiKeyServiceImpl implements ApiKeyService {
  private readonly store: ApiKeyStore;
  private readonly log: Logger;
  private readonly pepper: string;
  private readonly pepperConfigured: boolean;
  private readonly isAvailable: () => boolean;
  private readonly prefixLength: number;
  private readonly defaultTtlDays: number | null;
  private readonly governance?: ApiKeyGovernance;

  constructor(deps: ApiKeyServiceDeps) {
    this.store = deps.store;
    this.log = deps.logger;
    this.pepper = deps.hashSalt ?? '';
    this.pepperConfigured = Boolean(deps.hashSalt && deps.hashSalt.length > 0);
    this.isAvailable = deps.isAvailable ?? (() => true);
    this.prefixLength = deps.prefixLength ?? 12;
    this.defaultTtlDays = deps.defaultTtlDays ?? null;
    this.governance = deps.governance;

    if (!this.pepperConfigured) {
      this.log.warn(
        {},
        'API_KEY_HASH_SALT not configured — sk_ keys are hashed WITHOUT a pepper (set it in production)',
      );
    }
  }

  /** Truthful feature health for the composer/health rollup. */
  health(): { readonly durable: boolean; readonly pepperConfigured: boolean } {
    return { durable: this.isAvailable(), pepperConfigured: this.pepperConfigured };
  }

  async mint(params: MintApiKeyParams): Promise<MintedApiKey> {
    const name = params.name?.trim();
    if (!name) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'a non-empty key name is required');
    }
    if (!params.userId) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'userId is required to mint a key');
    }
    if (!this.isAvailable()) {
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'key store is unavailable');
    }

    // Enforce BEFORE the governance gate + any write: a minted key can never
    // carry higher privilege than the principal minting it.
    const scopes = this.resolveGrantableScopes(params.scopes, params.granterScopes);

    await this.gate('key.mint', { userId: params.userId, orgId: params.orgId ?? null, name });

    const rawKey = this.generateRawKey();
    const record: NewApiKeyRecord = {
      id: randomUUID(),
      userId: params.userId,
      ...(params.orgId ? { orgId: params.orgId } : {}),
      name,
      keyPrefix: rawKey.slice(0, this.prefixLength),
      keyHash: this.hash(rawKey),
      scopes,
      expiresAt: this.resolveExpiry(params.expiresAt),
    };

    const persisted = await this.store.insert(record);
    this.log.info(
      { keyId: persisted.id, userId: persisted.userId, prefix: persisted.keyPrefix },
      'minted platform api key',
    );
    return { rawKey, record: persisted };
  }

  async validate(rawKey: string): Promise<ApiKeyValidation | null> {
    if (!rawKey || !rawKey.startsWith(KEY_SCHEME)) return null;
    const prefix = rawKey.slice(0, this.prefixLength);
    const candidates = await this.store.findByPrefix(prefix);
    if (candidates.length === 0) return null;

    const computed = this.hash(rawKey);
    const now = Date.now();
    let matched: PlatformApiKey | null = null;
    // Iterate ALL candidates (constant-time compare each) so a prefix collision
    // never short-circuits and leaks timing about which row matched.
    for (const candidate of candidates) {
      if (candidate.revokedAt) continue;
      if (candidate.expiresAt && candidate.expiresAt.getTime() <= now) continue;
      if (constantTimeHexEqual(candidate.keyHash, computed)) matched = candidate;
    }
    if (!matched) return null;

    // Best-effort, fire-and-forget: never block the hot path on the touch.
    void this.store.touchLastUsed(matched.id).catch(() => undefined);

    return {
      keyId: matched.id,
      userId: matched.userId,
      ...(matched.orgId ? { orgId: matched.orgId } : {}),
      scopes: matched.scopes,
    };
  }

  async list(userId: string): Promise<readonly PlatformApiKey[]> {
    if (!userId) throw new AppError(ErrorCode.INVALID_INPUT, 'userId is required');
    if (!this.isAvailable()) {
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'key store is unavailable');
    }
    return this.store.listForUser(userId);
  }

  async revoke(id: string, userId: string): Promise<boolean> {
    if (!id || !userId) throw new AppError(ErrorCode.INVALID_INPUT, 'id and userId are required');
    if (!this.isAvailable()) {
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'key store is unavailable');
    }
    await this.gate('key.revoke', { keyId: id, userId });
    const revoked = await this.store.revoke(id, userId);
    if (revoked) this.log.info({ keyId: id, userId }, 'revoked platform api key');
    return revoked;
  }

  // --- internals ---

  /**
   * Resolve the scopes a key may carry, refusing any privilege escalation.
   *
   *  - No scopes requested → the non-privileged {@link DEFAULT_SCOPES}.
   *  - `granterScopes` supplied (the request path) → every requested scope must
   *    be a subset of them; a normal session (`['read','write']`) therefore
   *    cannot mint `admin`/`internal`. Any non-held scope is a 403.
   *  - `granterScopes` omitted (trusted server-side mint, e.g. device-flow) →
   *    non-privileged scopes pass, but the privileged scopes are still refused.
   */
  private resolveGrantableScopes(
    requested: readonly string[] | undefined,
    granterScopes: readonly string[] | undefined,
  ): readonly string[] {
    if (!requested || requested.length === 0) return DEFAULT_SCOPES;
    const granter = granterScopes ? new Set(granterScopes) : null;
    for (const scope of requested) {
      const grantable = granter ? granter.has(scope) : !PRIVILEGED_SCOPES.has(scope);
      if (!grantable) {
        throw new AppError(
          ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
          `scope "${scope}" is not grantable by the minting principal`,
        );
      }
    }
    return requested;
  }

  /** Consult the optional governance gate; deny → 403, absent → allow (logged). */
  private async gate(
    action: 'key.mint' | 'key.revoke',
    context: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    if (!this.governance) return;
    const decision = await this.governance.authorize(action, context);
    if (!decision.allowed) {
      throw new AppError(
        ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
        decision.reason ?? `governance denied ${action}`,
      );
    }
  }

  /** `sha256(pepper || rawKey)` as lowercase hex — the only stored representation. */
  private hash(rawKey: string): string {
    return createHash('sha256').update(this.pepper).update(rawKey).digest('hex');
  }

  /** `sk_` + base62(32 random bytes). */
  private generateRawKey(): string {
    return KEY_SCHEME + toBase62(randomBytes(KEY_ENTROPY_BYTES));
  }

  /** Explicit expiry wins; else apply the configured default TTL (or none). */
  private resolveExpiry(explicit: Date | null | undefined): Date | null {
    if (explicit === null) return null;
    if (explicit instanceof Date) return explicit;
    if (this.defaultTtlDays && this.defaultTtlDays > 0) {
      return new Date(Date.now() + this.defaultTtlDays * 24 * 60 * 60 * 1000);
    }
    return null;
  }
}

/** Build the `sk_` key service. */
export function createApiKeyService(deps: ApiKeyServiceDeps): ApiKeyServiceImpl {
  return new ApiKeyServiceImpl(deps);
}

/**
 * Constant-time comparison of two hex-encoded hashes. Length-guarded first (a
 * length mismatch is an immediate, safe non-match), then `timingSafeEqual`.
 */
function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Encode bytes to a base62 string (big-endian, leading-zero preserving-ish). */
function toBase62(bytes: Buffer): string {
  // Interpret the buffer as a big integer and repeatedly divide by 62.
  let value = BigInt('0x' + (bytes.toString('hex') || '0'));
  if (value === 0n) return BASE62[0];
  const base = BigInt(BASE62.length);
  let out = '';
  while (value > 0n) {
    const rem = Number(value % base);
    out = BASE62[rem] + out;
    value /= base;
  }
  return out;
}
