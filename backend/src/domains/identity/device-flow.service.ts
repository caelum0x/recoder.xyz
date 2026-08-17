/**
 * `DeviceFlowServiceImpl` — the RFC-8628 CLI device authorization flow.
 *
 * The desktop / CLI calls {@link requestGrant} to get a `device_code` +
 * `user_code`, shows the short `user_code` to the human, and polls
 * {@link pollStatus} with the opaque `device_code`. The human opens the browser,
 * signs in, and {@link approve}s the `user_code` (session-gated at the route).
 * Once approved, the CLI {@link exchange}s the `device_code` for a real `sk_`
 * platform API key (minted via the injected {@link DeviceKeyIssuer}) and the
 * grant is single-consumed.
 *
 * Security invariants (enforced HERE, not the port):
 *  - the raw `device_code` is generated with a CSPRNG, returned exactly once, and
 *    NEVER stored — only its `sha256` is persisted;
 *  - the `user_code` uses an unambiguous alphabet (no `0/O/1/I`) and is checked
 *    for collision before insert;
 *  - polling is interval-rate-limited (`slow_down`) via `last_polled_at`;
 *  - `exchange` consumes the grant BEFORE minting, so two concurrent exchanges
 *    can never both mint a key from one grant.
 *
 * This class also implements {@link DeviceTokenValidator}: an approved,
 * not-yet-exchanged grant's `device_code` resolves to a `kind: 'device'`
 * principal, so the credential seam can authenticate a device pre-`sk_` exchange.
 * Absent a key issuer, `exchange` degrades to a truthful `SERVICE_UNAVAILABLE`
 * (never a faked token).
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Logger } from '../../shared/logger.js';
import { AppError, ErrorCode } from '../../shared/errors.js';
import type { AppConfig } from '../../shared/app-config.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { ApiKeyService } from './ports/api-key.port.js';
import { PRIVILEGED_SCOPES } from './api-key.service.js';
import type {
  DeviceExchangeResult,
  DeviceFlowService,
  DevicePollOutcome,
  DeviceTokenValidation,
  DeviceTokenValidator,
  RequestGrantParams,
  RequestedGrant,
} from './ports/device-flow.port.js';
import type { DeviceGrantStore } from './ports/device-flow.port.js';
import { sliceIdentityConfig, type IdentityConfig } from './config.js';
import { DeviceGrantRepository } from './repositories/device-flow.repository.js';

/** Unambiguous user-code alphabet (Crockford-ish: no `0 O 1 I` to avoid typos). */
const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** `WDJB-MJHT` shape: two groups of four. */
const USER_CODE_GROUP = 4;
const USER_CODE_GROUPS = 2;
/** Retries to dodge a `user_code` collision before giving up. */
const USER_CODE_MAX_TRIES = 8;
/** device_code entropy — 32 bytes → ~43 base64url chars. */
const DEVICE_CODE_BYTES = 32;

/**
 * The narrow key-minting capability `exchange` depends on. Structurally the
 * `ApiKeyService.mint` surface (the api-key feature satisfies it verbatim), so
 * the device flow never rebuilds `sk_` minting. Optional — absent → exchange
 * degrades truthfully.
 */
export type DeviceKeyIssuer = Pick<ApiKeyService, 'mint'>;

export interface DeviceFlowServiceDeps {
  readonly store: DeviceGrantStore;
  readonly config: IdentityConfig;
  readonly logger: Logger;
  /** Mints the `sk_` key on a successful exchange; absent → exchange 503s. */
  readonly keyIssuer?: DeviceKeyIssuer;
  /** Absolute base for the browser approval page (e.g. `https://recoder.xyz/activate`). */
  readonly verificationUriBase: string;
  /** Injectable clock for deterministic tests. */
  readonly now?: () => Date;
  /** Injectable id factory for deterministic tests. */
  readonly idFactory?: () => string;
}

export class DeviceFlowServiceImpl implements DeviceFlowService, DeviceTokenValidator {
  private readonly store: DeviceGrantStore;
  private readonly cfg: IdentityConfig;
  private readonly log: Logger;
  private readonly keyIssuer?: DeviceKeyIssuer;
  private readonly verificationUriBase: string;
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(deps: DeviceFlowServiceDeps) {
    this.store = deps.store;
    this.cfg = deps.config;
    this.log = deps.logger;
    this.keyIssuer = deps.keyIssuer;
    this.verificationUriBase = deps.verificationUriBase.replace(/\/+$/, '');
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.idFactory ?? randomUUID;
  }

  async requestGrant(params: RequestGrantParams): Promise<RequestedGrant> {
    const clientId = (params.clientId ?? '').trim();
    if (!clientId) {
      throw new AppError(ErrorCode.MISSING_REQUIRED_FIELD, 'client_id is required.');
    }

    const deviceCode = generateDeviceCode();
    const deviceCodeHash = sha256(deviceCode);
    const userCode = await this.allocateUserCode();
    const ttl = this.cfg.deviceCodeTtlSeconds;
    const interval = this.cfg.devicePollIntervalSeconds;
    const expiresAt = new Date(this.now().getTime() + ttl * 1000);

    await this.store.create({
      id: this.newId(),
      deviceCodeHash,
      userCode,
      clientId,
      // A device grant is a SELF-SERVICE credential (public /device/code, then
      // self-approve) — it must never carry privileged scopes, or the standing
      // device-token principal would bypass the mint-path guard and become a
      // platform super-user. Strip them at the source. (recoder-kuja)
      scopes: stripPrivilegedScopes(normalizeScopes(params.scopes)),
      intervalSeconds: interval,
      expiresAt,
    });

    const verificationUri = this.verificationUriBase;
    return {
      deviceCode,
      userCode,
      verificationUri,
      verificationUriComplete: `${verificationUri}?user_code=${encodeURIComponent(userCode)}`,
      expiresInSeconds: ttl,
      intervalSeconds: interval,
    };
  }

  async approve(userCode: string, userId: string): Promise<boolean> {
    const normalized = normalizeUserCode(userCode);
    if (!normalized || !userId) return false;
    const grant = await this.store.findByUserCode(normalized);
    if (!grant) return false;
    if (this.isExpired(grant.expiresAt) || grant.status !== 'pending') return false;
    return this.store.approve(grant.id, userId);
  }

  /**
   * DENY a pending device grant (the browser "deny" action). A real transition —
   * NOT a cosmetic 200: the grant flips to `denied` so a later approve can't
   * succeed and the polling CLI gets a truthful `access_denied` instead of
   * polling until expiry (recoder-4d8i #9). Returns `true` when a pending grant
   * was actually denied.
   */
  async deny(userCode: string, userId: string): Promise<boolean> {
    const normalized = normalizeUserCode(userCode);
    if (!normalized || !userId) return false;
    const grant = await this.store.findByUserCode(normalized);
    if (!grant) return false;
    if (this.isExpired(grant.expiresAt) || grant.status !== 'pending') return false;
    return this.store.deny(grant.id, userId);
  }

  async pollStatus(deviceCode: string): Promise<DevicePollOutcome> {
    const grant = await this.store.findByDeviceCodeHash(sha256(deviceCode));
    // Unknown or already-consumed device code → treat as expired (RFC-8628 invalid).
    if (!grant || grant.status === 'consumed') return { status: 'expired_token' };

    if (this.isExpired(grant.expiresAt) || grant.status === 'expired') {
      // Opportunistically flip the row so health/audit stay truthful.
      await this.safeExpire();
      return { status: 'expired_token' };
    }

    // A denied grant is terminal — surface RFC-8628 `access_denied` so the CLI
    // stops polling immediately instead of waiting out the grant's expiry.
    if (grant.status === 'denied') {
      return { status: 'access_denied' };
    }

    if (grant.status === 'approved') {
      return { status: 'approved', grant };
    }

    // status === 'pending': enforce the polling interval.
    if (this.polledTooSoon(grant.lastPolledAt)) {
      return { status: 'slow_down', intervalSeconds: grant.intervalSeconds };
    }
    await this.store.touchPolled(grant.id);
    return { status: 'authorization_pending' };
  }

  async exchange(deviceCode: string): Promise<DeviceExchangeResult | null> {
    const grant = await this.store.findByDeviceCodeHash(sha256(deviceCode));
    if (!grant) return null;
    if (this.isExpired(grant.expiresAt)) {
      await this.safeExpire();
      return null;
    }
    if (grant.status !== 'approved' || !grant.userId) return null;

    if (!this.keyIssuer) {
      // Truthful degrade: no minting capability wired — never fabricate a token.
      throw new AppError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Device token exchange is unavailable (key issuer not configured).',
      );
    }

    // Consume FIRST (atomic approved→consumed). Only the winner of a race mints.
    const consumed = await this.store.consume(grant.id);
    if (!consumed) return null;

    const minted = await this.keyIssuer.mint({
      userId: grant.userId,
      name: `CLI device (${grant.clientId})`,
      scopes: grant.scopes,
    });

    return {
      rawKey: minted.rawKey,
      userId: grant.userId,
      scopes: grant.scopes,
    };
  }

  /**
   * {@link DeviceTokenValidator}: an approved-but-not-yet-exchanged `device_code`
   * resolves to a device principal. Constant-time-ish: we only ever look up by
   * the hash, never by the raw code, and never leak which stage failed.
   */
  async validate(rawDeviceToken: string): Promise<DeviceTokenValidation | null> {
    const token = (rawDeviceToken ?? '').trim();
    if (!token) return null;
    const grant = await this.store.findByDeviceCodeHash(sha256(token));
    if (!grant || grant.status !== 'approved' || !grant.userId) return null;
    if (this.isExpired(grant.expiresAt)) return null;
    return {
      userId: grant.userId,
      // Defense in depth: even if a stored/legacy grant somehow holds a
      // privileged scope, a device principal never receives it. (recoder-kuja)
      scopes: stripPrivilegedScopes(grant.scopes),
    };
  }

  // --- internals ---------------------------------------------------------

  private isExpired(expiresAt: Date): boolean {
    return expiresAt.getTime() <= this.now().getTime();
  }

  private polledTooSoon(lastPolledAt: Date | null | undefined): boolean {
    if (!lastPolledAt) return false;
    const elapsedMs = this.now().getTime() - lastPolledAt.getTime();
    return elapsedMs < this.cfg.devicePollIntervalSeconds * 1000;
  }

  private async safeExpire(): Promise<void> {
    try {
      await this.store.expireStale(this.now());
    } catch (err) {
      this.log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'device_grant expireStale failed (ignored)',
      );
    }
  }

  /** Generate a collision-free `user_code`, retrying a bounded number of times. */
  private async allocateUserCode(): Promise<string> {
    for (let attempt = 0; attempt < USER_CODE_MAX_TRIES; attempt += 1) {
      const candidate = generateUserCode();
      const existing = await this.store.findByUserCode(candidate);
      if (!existing) return candidate;
    }
    // Astronomically unlikely; fail loud rather than hand back a duplicate.
    throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Could not allocate a unique device code, retry.');
  }
}

// --- module-level helpers -------------------------------------------------

/** `sha256(input)` as lowercase hex. */
function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** A CSPRNG device code: url-safe base64 with no padding. */
function generateDeviceCode(): string {
  return randomBytes(DEVICE_CODE_BYTES).toString('base64url');
}

/** A `WDJB-MJHT`-shaped user code from the unambiguous alphabet, CSPRNG-backed. */
function generateUserCode(): string {
  const total = USER_CODE_GROUP * USER_CODE_GROUPS;
  const bytes = randomBytes(total);
  const chars: string[] = [];
  for (let i = 0; i < total; i += 1) {
    // Modulo bias is negligible for a 32-char alphabet over a uniform byte.
    chars.push(USER_CODE_ALPHABET[bytes[i]! % USER_CODE_ALPHABET.length]!);
  }
  const groups: string[] = [];
  for (let g = 0; g < USER_CODE_GROUPS; g += 1) {
    groups.push(chars.slice(g * USER_CODE_GROUP, (g + 1) * USER_CODE_GROUP).join(''));
  }
  return groups.join('-');
}

/** Normalize a user-entered code: uppercase, keep only alphabet chars, re-group. */
export function normalizeUserCode(input: string): string {
  const cleaned = String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (cleaned.length !== USER_CODE_GROUP * USER_CODE_GROUPS) return '';
  const groups: string[] = [];
  for (let g = 0; g < USER_CODE_GROUPS; g += 1) {
    groups.push(cleaned.slice(g * USER_CODE_GROUP, (g + 1) * USER_CODE_GROUP));
  }
  return groups.join('-');
}

/**
 * Remove privileged scopes (`admin`/`internal`) a self-service device grant may
 * never confer. The single source of truth is {@link PRIVILEGED_SCOPES} in the
 * api-key service, reused so the two credential paths can't diverge. (recoder-kuja)
 */
function stripPrivilegedScopes(scopes: readonly string[]): readonly string[] {
  return scopes.filter((s) => !PRIVILEGED_SCOPES.has(s));
}

/** De-dupe + trim requested scopes; empty when none supplied. */
function normalizeScopes(scopes: readonly string[] | undefined): readonly string[] {
  if (!scopes || scopes.length === 0) return [];
  const seen = new Set<string>();
  for (const s of scopes) {
    const t = String(s).trim();
    if (t) seen.add(t);
  }
  return [...seen];
}

/**
 * Constant-time string compare (exported for the routes to compare a presented
 * device_code without leaking length/position via early-exit `===`).
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// --- factories ------------------------------------------------------------

/** Build the device-flow service from an already-sliced config + a store. */
export function createDeviceFlowService(deps: DeviceFlowServiceDeps): DeviceFlowServiceImpl {
  return new DeviceFlowServiceImpl(deps);
}

export interface DeviceFlowModuleDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly executor: QueryExecutor;
  readonly keyIssuer?: DeviceKeyIssuer;
  /** Override the verification base URL; else derived from the cookie domain. */
  readonly verificationUriBase?: string;
}

/**
 * Convenience wiring for bootstrap: slices config, builds the
 * {@link DeviceGrantRepository} over the shared executor, and returns the
 * service (which also serves as the {@link DeviceTokenValidator}). Keeps the
 * composition root to a couple of lines.
 */
export function createDeviceFlow(deps: DeviceFlowModuleDeps): DeviceFlowServiceImpl {
  const config = sliceIdentityConfig(deps.config);
  const store = new DeviceGrantRepository(deps.executor, deps.logger);
  const verificationUriBase = deps.verificationUriBase ?? deriveVerificationBase(config.cookieDomain);
  return new DeviceFlowServiceImpl({
    store,
    config,
    logger: deps.logger,
    verificationUriBase,
    ...(deps.keyIssuer ? { keyIssuer: deps.keyIssuer } : {}),
  });
}

/**
 * Derive the browser approval base from the cross-subdomain cookie domain
 * (`.recoder.xyz` → `https://recoder.xyz/activate`). Falls back to a relative
 * path when no cookie domain is configured — never hardcodes localhost/prod.
 */
function deriveVerificationBase(cookieDomain: string | null): string {
  if (!cookieDomain) return '/activate';
  const host = cookieDomain.replace(/^\./, '');
  return `https://${host}/activate`;
}
