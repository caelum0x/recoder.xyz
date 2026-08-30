/**
 * GOVERNED REMOTE ATTACH — the typed contract (LOOM Bigger Bet C, backend half).
 *
 * Loom's daemon persists agents across lid-close; this is the GOVERNED version of
 * what Loom's ecosystem did ungoverned: an AUTHENTICATED, POLICY-GATED remote/mobile
 * client may MONITOR and (opt-in) STEER the caller's OWN live agents — never anyone
 * else's, never beyond a minted scope, never with an escalated capability.
 *
 * SECURITY MODEL (non-negotiable — enforced by {@link RemoteAttachService}):
 *  - A {@link RemoteAttachSession} is minted ONLY for the authenticated caller's OWN
 *    workspaces/taskGroup (ownership verified at mint), is SHORT-lived (TTL), and is a
 *    SCOPE LIMITER — never the sole authority. Every later call RE-DERIVES identity
 *    from the authenticated caller and RE-VERIFIES ownership; the session id alone
 *    grants nothing.
 *  - `capabilities` are opt-in and cannot be escalated: a `monitor`-only session can
 *    never steer; a session can never reach a workspace outside its minted scope.
 */

/** What a remote attach session is allowed to do. `steer` is opt-in and gated. */
export type RemoteAttachCapability = 'monitor' | 'steer';

/**
 * The bounded scope a session may observe/steer — a concrete set of workspaces and/or
 * a shared parallel-run group. Ownership of EVERYTHING this resolves to is verified at
 * mint AND re-verified on every later call (a scope is never trusted on its own).
 */
export interface RemoteAttachScope {
  /** Explicit workspace ids the session covers (each ownership-verified). */
  readonly workspaceIds?: readonly string[];
  /** A shared parallel-run group the session covers (resolved + ownership-verified). */
  readonly taskGroup?: string;
}

/**
 * A minted, scoped, expiring remote-attach session. `principalId` is the OWNER the
 * session is bound to; a later call whose authenticated caller differs is refused.
 */
export interface RemoteAttachSession {
  /** Opaque, unguessable session id (the SCOPE limiter — never the sole authority). */
  readonly sessionId: string;
  /** The OWNER this session is bound to (`Principal.userId` at mint). */
  readonly principalId: string;
  /** The bounded scope minted (echoed back; re-verified on every use). */
  readonly scope: RemoteAttachScope;
  /** The opt-in capabilities granted (cannot be escalated after mint). */
  readonly capabilities: readonly RemoteAttachCapability[];
  /** ISO-8601 mint time. */
  readonly issuedAt: string;
  /** ISO-8601 hard expiry — a call at/after this is refused (short TTL). */
  readonly expiresAt: string;
  /** Whether this session survives a backend restart on this deployment. */
  readonly durable?: boolean;
}

/** The truthful outcome of a governed steer — policy is consulted on every path. */
export type RemoteSteerResult =
  | {
      /** Policy denied — the input was NOT delivered. */
      readonly status: 'refused';
      readonly reason: string;
    }
  | {
      /** Policy needs a human — an approval was opened; the input was NOT delivered. */
      readonly status: 'needs_approval';
      readonly requestId: string;
      readonly reason: string;
    }
  | {
      /** Policy allowed — the input was delivered into the live pane + audited. */
      readonly status: 'delivered';
      readonly workspaceId: string;
      /** The durable audit id sealing this steer, or `null` when sealing degraded. */
      readonly auditId: string | null;
    };
