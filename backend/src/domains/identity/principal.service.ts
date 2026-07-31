/**
 * `PrincipalService` — the concrete {@link SessionVerifier}.
 *
 * Turns raw inbound {@link Credential} material into a canonical {@link Principal}
 * following a FIXED resolution precedence (highest trust first):
 *
 *   1. `INTERNAL_SERVICE_KEY`  (constant-time compare, fail-closed)
 *   2. `sk_` platform API key  (constant-time hash validate, via ApiKeyValidator)
 *   3. CLI device token        (via DeviceTokenValidator)
 *   4. Better Auth session     (cookie or bearer session token)
 *   5. → `null`                (unauthenticated; the middleware decides anon/401)
 *
 * Moved behind this service from the legacy `server.ts` auth block
 * (`resolveInternalServiceSession` → `resolvePlatformApiKeySession` → session →
 * `getAnonymousFallbackIdentity`, `STRICT_AUTH`-gated). Degrade-safe: any missing
 * validator simply skips that path; any thrown infra error is caught and treated
 * as unauthenticated (`null`) so an auth failure is never a 500.
 */
import { timingSafeEqual } from 'node:crypto';
import type { Logger } from '../../shared/logger.js';
import type { SessionVerifier } from './ports/session-verifier.port.js';
import type { ApiKeyValidator } from './ports/api-key.port.js';
import type { DeviceTokenValidator } from './ports/device-flow.port.js';
import type { AuthSessionVerifier } from './adapters/better-auth.adapter.js';
import type { Credential, Principal } from './types.js';
import type { IdentityConfig } from './config.js';
import { SOLO_OWNER_USER_ID } from '../../shared/solo-identity.js';

/** The stable service id an internal-key caller is attributed to. */
export const INTERNAL_SERVICE_USER_ID = 'internal-service';
/** The sentinel id of the anonymous fallback identity. */
export const ANONYMOUS_USER_ID = 'anonymous';

/**
 * Stable owner id for the single local user in RECODER_SOLO_MODE (desktop).
 * Defined in `shared/` so cross-domain consumers import the value from there (a
 * domain must not import a runtime value from another domain internal);
 * re-exported here for identity's own consumers.
 */
export { SOLO_OWNER_USER_ID };

/** Scopes granted to a verified internal service caller. */
const INTERNAL_SCOPES: readonly string[] = ['internal', 'read', 'write', 'admin'];

/**
 * Resolves (and lazily provisions) a web user's tenant org → orgId. Implemented
 * by {@link OrgProvisioningService}. Injected optionally so the seam degrades:
 * absent → session principals resolve with `orgId` undefined (userId-ownership
 * fallback, no regression). Must be idempotent, cheap, and degrade-safe — it is
 * called during every session resolution.
 */
export interface OrgResolver {
  /** Return the user's active org id, provisioning a personal org if none. */
  ensurePersonalOrg(userId: string): Promise<string | undefined>;
}

export interface PrincipalServiceDeps {
  readonly config: IdentityConfig;
  readonly logger: Logger;
  /** The Better Auth session read (the adapter). */
  readonly authSession: AuthSessionVerifier;
  /** Optional `sk_` validator; absent → apikey resolution degrades to `null`. */
  readonly apiKeyValidator?: ApiKeyValidator;
  /** Optional device-token validator; absent → device resolution degrades to `null`. */
  readonly deviceTokenValidator?: DeviceTokenValidator;
  /**
   * Optional org resolver — sets `orgId` on resolved SESSION principals (audit
   * #9) and lazily provisions a personal org for a user with none (audit #11).
   * Absent → session principals carry `orgId` undefined. Only session principals
   * use it; api-key/device carry their own org, internal/anonymous never need one.
   */
  readonly orgResolver?: OrgResolver;
}

export class PrincipalService implements SessionVerifier {
  private readonly cfg: IdentityConfig;
  private readonly log: Logger;
  private readonly authSession: AuthSessionVerifier;
  private readonly apiKeyValidator?: ApiKeyValidator;
  private readonly deviceTokenValidator?: DeviceTokenValidator;
  private readonly orgResolver?: OrgResolver;

  constructor(deps: PrincipalServiceDeps) {
    this.cfg = deps.config;
    this.log = deps.logger;
    this.authSession = deps.authSession;
    this.apiKeyValidator = deps.apiKeyValidator;
    this.deviceTokenValidator = deps.deviceTokenValidator;
    this.orgResolver = deps.orgResolver;
  }

  async verify(cred: Credential): Promise<Principal | null> {
    // 1. Internal service key — highest trust, constant-time compare.
    const internal = this.resolveInternalServiceSession(cred.internalKey ?? null);
    if (internal) return internal;

    // 2. Platform API key (`sk_...`) from x-api-key or an `Authorization: Bearer sk_`.
    const rawKey = this.extractApiKey(cred);
    if (rawKey && this.apiKeyValidator) {
      const validation = await this.safe(() => this.apiKeyValidator!.validate(rawKey), 'apikey validate');
      if (validation) {
        return {
          userId: validation.userId,
          ...(validation.orgId ? { orgId: validation.orgId } : {}),
          scopes: validation.scopes,
          kind: 'apikey',
          isAnonymous: false,
          raw: validation,
        };
      }
    }

    // 3. CLI device token.
    if (cred.deviceToken && this.deviceTokenValidator) {
      const dv = await this.safe(
        () => this.deviceTokenValidator!.validate(cred.deviceToken as string),
        'device validate',
      );
      if (dv) {
        return {
          userId: dv.userId,
          ...(dv.orgId ? { orgId: dv.orgId } : {}),
          scopes: dv.scopes,
          kind: 'device',
          isAnonymous: false,
          raw: dv,
        };
      }
    }

    // 4. Better Auth session (cookie or bearer session token). Token extraction
    //    (cookie-name + signature parsing) is owned by the adapter.
    const sessionToken = this.authSession.extractToken({
      cookieHeader: cred.cookieHeader ?? null,
      bearerToken: this.bearer(cred.authorizationHeader),
    });
    if (sessionToken) {
      const session = await this.safe(() => this.authSession.verifyToken(sessionToken), 'session verify');
      if (session) {
        // #9/#11: resolve (and lazily provision) the user's tenant org so the
        // IDOR fixes' `tenant.orgId === principal.orgId` scoping functions for
        // web users. Degrade-safe: undefined → userId-ownership fallback.
        const orgId = await this.resolveSessionOrg(session.userId);
        return {
          userId: session.userId,
          sessionId: session.sessionId,
          email: session.email,
          ...(orgId ? { orgId } : {}),
          scopes: ['read', 'write'],
          kind: 'session',
          isAnonymous: false,
          raw: session,
        };
      }
    }

    // 5. Nothing resolved.
    return null;
  }

  /**
   * Resolve the session user's org id via the optional {@link OrgResolver}
   * (lazily provisioning a personal org when absent). Never throws: a missing
   * resolver or any fault yields `undefined` so an auth resolution is never a 500
   * and the caller degrades to userId-scoped ownership.
   */
  private async resolveSessionOrg(userId: string): Promise<string | undefined> {
    if (!this.orgResolver) return undefined;
    const resolved = await this.safe(() => this.orgResolver!.ensurePersonalOrg(userId), 'org resolve');
    return resolved ?? undefined;
  }

  /**
   * Constant-time internal-service-key check. Fail-closed: no configured key →
   * no internal access (returns `null`); a mismatch → `null`.
   */
  resolveInternalServiceSession(presentedKey: string | null): Principal | null {
    const expected = this.cfg.internalServiceKey;
    if (!expected || !presentedKey) return null;
    const provided = Buffer.from(presentedKey);
    const expectedBuf = Buffer.from(expected);
    if (provided.length !== expectedBuf.length || !timingSafeEqual(provided, expectedBuf)) {
      return null;
    }
    return {
      userId: INTERNAL_SERVICE_USER_ID,
      scopes: INTERNAL_SCOPES,
      kind: 'internal',
      isAnonymous: false,
      raw: { kind: 'internal-service' },
    };
  }

  /**
   * The degrade-safe anonymous fallback identity. Produced by the middleware ONLY
   * when `strictAuth` is off and no credential resolved — never minted from a
   * credential inside {@link verify}.
   */
  getAnonymousFallbackIdentity(): Principal {
    return {
      userId: ANONYMOUS_USER_ID,
      scopes: [],
      kind: 'anonymous',
      isAnonymous: true,
      raw: null,
    };
  }

  /**
   * The single local user on an embedded desktop (RECODER_SOLO_MODE). There is
   * no sign-in plane and the minted sk_ key can't validate without a DB, so
   * mutating routes would 401 forever. This synthetic NON-anonymous owner lets
   * the local user create/run/merge workspaces on their own machine. A cloud
   * deploy never sets RECODER_SOLO_MODE, so it never uses this.
   */
  getSoloOwnerIdentity(): Principal {
    return {
      userId: SOLO_OWNER_USER_ID,
      scopes: [],
      kind: 'session',
      isAnonymous: false,
      raw: { kind: 'solo-owner' },
    };
  }

  /** Extract an `sk_` key from the explicit header or an `Authorization: Bearer sk_`. */
  private extractApiKey(cred: Credential): string | null {
    if (cred.apiKey && cred.apiKey.startsWith('sk_')) return cred.apiKey;
    const bearer = this.bearer(cred.authorizationHeader);
    if (bearer && bearer.startsWith('sk_')) return bearer;
    return null;
  }

  private bearer(authHeader: string | null | undefined): string | null {
    const header = String(authHeader ?? '');
    return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
  }

  /** Run an async resolver, swallowing infra errors into `null` (never a 500). */
  private async safe<T>(fn: () => Promise<T | null>, label: string): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      this.log.warn({ err: err instanceof Error ? err.message : String(err), label }, 'credential resolution error (treated as unauthenticated)');
      return null;
    }
  }
}
