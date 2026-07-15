/**
 * Canonical identity domain types.
 *
 * `Principal` is the CROSS-DOMAIN shape: the resolved identity every other
 * domain guards a request with. It is the single most load-bearing type in the
 * backend — freeze it. `Credential` is the raw inbound material a
 * {@link SessionVerifier} resolves into a `Principal`.
 *
 * Reconciliation note (`user` vs `users`): the physical Better Auth `user`
 * table and the legacy CLI `users` table stay SEPARATE (AGENTS.md critical
 * rule). Unification happens at the read-model level via {@link Identity} +
 * `IdentityRepository.resolveIdentity`, never by merging tables.
 */

/**
 * How a `Principal` was authenticated.
 *
 * The four credential-derived kinds are frozen by the Phase-2 seam:
 *  - `session`  — a Better Auth browser session (cookie or bearer session token)
 *  - `apikey`   — a DB-backed `sk_` platform API key
 *  - `device`   — an RFC-8628 CLI device-flow token (pre-`sk_` exchange)
 *  - `internal` — an `INTERNAL_SERVICE_KEY` service-to-service caller
 *
 * `anonymous` is the degrade-safe fallback identity used ONLY when
 * `STRICT_AUTH` is off and a request carried no resolvable credential. It is
 * never minted from a credential; it is produced by
 * `PrincipalService.getAnonymousFallbackIdentity()` and gated by the middleware.
 */
export type PrincipalKind = 'session' | 'apikey' | 'device' | 'internal' | 'anonymous';

/**
 * The resolved identity of a caller. **This is the frozen cross-domain seam** —
 * every domain that guards a request consumes exactly this shape.
 *
 * Required: `userId`, `scopes`, `kind`, `isAnonymous`, `raw`.
 * Optional: `orgId`, `sessionId`, `email` (present depending on `kind`).
 */
export interface Principal {
  /** Canonical owner id. For `internal` a stable service id; for `anonymous` the sentinel `'anonymous'`. */
  readonly userId: string;
  /** Optional organization scope (present for org-scoped `apikey`/`session`/`device`). */
  readonly orgId?: string;
  /** Better Auth session id — present only for `kind: 'session'`. */
  readonly sessionId?: string;
  /** Caller email when known (session/user); never present for `internal`/`anonymous`. */
  readonly email?: string;
  /** Granted scope strings (e.g. `['read','write','admin','internal']`). */
  readonly scopes: readonly string[];
  /** How this principal was authenticated. */
  readonly kind: PrincipalKind;
  /** True only for the anonymous fallback identity. */
  readonly isAnonymous: boolean;
  /**
   * The raw underlying credential/session object the principal was derived from
   * (AuthSession for `session`, ApiKeyValidation for `apikey`, etc.). Opaque to
   * consumers; present for audit/provenance. `null` for `anonymous`.
   */
  readonly raw: unknown;
}

/**
 * The raw inbound credential material, extracted from an HTTP request at the
 * edge and handed to `SessionVerifier.verify`. All fields optional — the
 * verifier applies a fixed resolution precedence over whatever is present.
 */
export interface Credential {
  /** Raw `Cookie` header (carries the Better Auth session cookie). */
  readonly cookieHeader?: string | null;
  /** Raw `Authorization` header (`Bearer sk_...` or `Bearer <session-token>`). */
  readonly authorizationHeader?: string | null;
  /** Explicit `sk_` platform key (e.g. from an `x-api-key` header). */
  readonly apiKey?: string | null;
  /** Service-to-service key (from `x-internal-service-key`). */
  readonly internalKey?: string | null;
  /** CLI device-flow token (from `x-device-token` or the device grant exchange). */
  readonly deviceToken?: string | null;
  /** Caller IP for rate-limit/audit context (never used for authz). */
  readonly ip?: string | null;
  /** Correlation id for audit. */
  readonly requestId?: string | null;
}

/**
 * The unified identity read model over the physically-separate `user` (Better
 * Auth web) and `users` (legacy CLI) tables. Produced by
 * `IdentityRepository.resolveIdentity`; the tables are NEVER merged.
 */
export interface Identity {
  /** Canonical `user.id` (Better Auth web identity). */
  readonly userId: string;
  readonly email: string;
  readonly name?: string;
  readonly emailVerified: boolean;
  /** Linked legacy `users.id` (CLI plural) when a `user_cli_link` row exists. */
  readonly legacyCliUserId?: string;
  readonly createdAt: Date;
}

/** A DB-backed `sk_` platform API key (raw key is NEVER stored). */
export interface PlatformApiKey {
  readonly id: string;
  readonly userId: string;
  readonly orgId?: string;
  readonly name: string;
  /** First ~12 chars, indexed for lookup (e.g. `sk_live_ab12`). */
  readonly keyPrefix: string;
  /** `sha256(pepper || rawKey)` — the only representation persisted. */
  readonly keyHash: string;
  readonly scopes: readonly string[];
  readonly lastUsedAt?: Date | null;
  readonly expiresAt?: Date | null;
  readonly revokedAt?: Date | null;
  readonly createdAt: Date;
}

/** RFC-8628 device authorization grant. */
export interface DeviceGrant {
  readonly id: string;
  /** `sha256(deviceCode)` — the raw device code is never stored. */
  readonly deviceCodeHash: string;
  /** Short human code (e.g. `WDJB-MJHT`). */
  readonly userCode: string;
  readonly userId?: string | null;
  readonly status: DeviceGrantStatus;
  readonly scopes: readonly string[];
  readonly clientId: string;
  readonly intervalSeconds: number;
  readonly lastPolledAt?: Date | null;
  readonly approvedAt?: Date | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export type DeviceGrantStatus = 'pending' | 'approved' | 'consumed' | 'expired';

/** An organization (tenant boundary above a user). */
export interface Org {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly ownerUserId: string;
  /** Optional SSO/SAML connection config hook (stubbed at the org layer). */
  readonly ssoConnection?: Readonly<Record<string, unknown>> | null;
  readonly createdAt: Date;
}

/** A team within an org. */
export interface Team {
  readonly id: string;
  readonly orgId: string;
  readonly slug: string;
  readonly name: string;
  readonly createdAt: Date;
}

/** A user's membership in an org (+ optional team + role). */
export interface Membership {
  readonly id: string;
  readonly orgId: string;
  readonly userId: string;
  readonly teamId?: string | null;
  readonly role: Role;
  readonly status: MembershipStatus;
  readonly invitedBy?: string | null;
  readonly createdAt: Date;
}

export type MembershipStatus = 'invited' | 'active';

/**
 * The four roles, ordered by strength: `owner ⊃ admin ⊃ member ⊃ viewer`.
 * The RBAC evaluator expands a role into its permission set.
 */
export type Role = 'owner' | 'admin' | 'member' | 'viewer';

/**
 * A permission string in `resource:action` form (e.g. `org:manage`,
 * `key:mint`, `run:create`). Kept as a branded string (not an enum) so domains
 * can declare their own permissions without editing this file.
 */
export type Permission = string;

/** The effect of a per-membership permission override. */
export type PermissionEffect = 'allow' | 'deny';
