/**
 * CLI device-flow contracts (RFC 8628 shape).
 *
 * Three seams:
 *  - {@link DeviceGrantStore}     — persistence contract for `device_grant`
 *                                   (the device-flow.service depends on THIS,
 *                                   never on `pg`).
 *  - {@link DeviceTokenValidator} — the NARROW read the `PrincipalService`
 *                                   depends on to resolve a `kind: 'device'`
 *                                   principal from a standing device token.
 *                                   Frozen so the credential seam does not couple
 *                                   to the full service.
 *  - {@link DeviceFlowService}    — the full request/approve/exchange/poll surface
 *                                   the device routes + MCP tools consume.
 *
 * Security invariants (enforced by the impl, not this port): the raw device code
 * is returned once at `requestGrant` and NEVER stored; only `sha256(deviceCode)`
 * + the short `user_code` are persisted; polling is interval-rate-limited;
 * `exchange` mints an `sk_` key and single-consumes the grant.
 */
import type { DeviceGrant, DeviceGrantStatus } from '../types.js';

/** Fields required to persist a freshly requested grant. */
export interface NewDeviceGrantRecord {
  readonly id: string;
  /** `sha256(deviceCode)` — the raw device code is never stored. */
  readonly deviceCodeHash: string;
  readonly userCode: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
  readonly intervalSeconds: number;
  readonly expiresAt: Date;
}

/** Persistence contract for `device_grant`. */
export interface DeviceGrantStore {
  /** Insert a new pending grant. */
  create(record: NewDeviceGrantRecord): Promise<DeviceGrant>;
  /** Look up a grant by the hashed device code (the polling path). */
  findByDeviceCodeHash(deviceCodeHash: string): Promise<DeviceGrant | null>;
  /** Look up a grant by the human `user_code` (the browser-approval path). */
  findByUserCode(userCode: string): Promise<DeviceGrant | null>;
  /** Bind a grant to a user + mark `approved`; returns `true` when a row changed. */
  approve(id: string, userId: string): Promise<boolean>;
  /** Mark a grant `consumed` (single-use); returns `true` when it transitioned. */
  consume(id: string): Promise<boolean>;
  /** Record a poll (updates `last_polled_at` for interval rate-limiting). */
  touchPolled(id: string): Promise<void>;
  /** Expire grants past their `expires_at`; returns the count expired. */
  expireStale(now?: Date): Promise<number>;
}

/** The minimal successful device-token validation mapped into a `Principal`. */
export interface DeviceTokenValidation {
  readonly userId: string;
  readonly orgId?: string;
  readonly scopes: readonly string[];
}

/**
 * The narrow contract the {@link SessionVerifier} impl depends on to resolve a
 * standing CLI device token into a `kind: 'device'` principal. Injected into
 * `PrincipalService`; absent → device resolution degrades to `null`.
 */
export interface DeviceTokenValidator {
  /** Validate a raw device token; `null` when unknown/expired/revoked. */
  validate(rawDeviceToken: string): Promise<DeviceTokenValidation | null>;
}

/** Parameters to start a device authorization grant. */
export interface RequestGrantParams {
  readonly clientId: string;
  readonly scopes?: readonly string[];
}

/** The grant handed back to the CLI to display + poll (RFC-8628 shape). */
export interface RequestedGrant {
  /** Opaque device code the CLI polls with (raw; shown once, never re-derivable). */
  readonly deviceCode: string;
  /** Short human code the user types into the browser (e.g. `WDJB-MJHT`). */
  readonly userCode: string;
  /** The browser approval URL. */
  readonly verificationUri: string;
  /** `verification_uri` pre-filled with the code, when supported. */
  readonly verificationUriComplete?: string;
  readonly expiresInSeconds: number;
  readonly intervalSeconds: number;
}

/** RFC-8628 polling outcomes. */
export type DevicePollOutcome =
  | { readonly status: 'authorization_pending' }
  | { readonly status: 'slow_down'; readonly intervalSeconds: number }
  | { readonly status: 'expired_token' }
  | { readonly status: 'access_denied' }
  | { readonly status: 'approved'; readonly grant: DeviceGrant };

/** The result of a successful `exchange`: a minted `sk_` key. */
export interface DeviceExchangeResult {
  /** The full raw `sk_...` key. Returned once; not recoverable. */
  readonly rawKey: string;
  readonly userId: string;
  readonly scopes: readonly string[];
}

/** The full device-flow service surface. */
export interface DeviceFlowService {
  /** Start a grant → `device_code` + `user_code` (RFC-8628). */
  requestGrant(params: RequestGrantParams): Promise<RequestedGrant>;
  /** Browser approval: bind a `user_code` to the approving principal's user. */
  approve(userCode: string, userId: string): Promise<boolean>;
  /** Poll a `device_code`: returns pending/slow_down/expired or the approved grant. */
  pollStatus(deviceCode: string): Promise<DevicePollOutcome>;
  /** Exchange an approved `device_code` for an `sk_` key + single-consume the grant. */
  exchange(deviceCode: string): Promise<DeviceExchangeResult | null>;
}

/** Re-exported for store impls that switch on status. */
export type { DeviceGrantStatus };
