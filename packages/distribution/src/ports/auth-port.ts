import type { Plan } from '../domain/subscription-plan';

/**
 * A recoder.xyz session reference. Structurally compatible with
 * `AuthSession` from `@recoder/auth` (session.ts) but defined locally so this
 * package type-checks without pulling the Prisma-backed auth runtime. The host
 * wires a real `@recoder/auth` verification behind this port.
 */
export interface AuthSessionRef {
  readonly sessionId: string;
  readonly userId: string;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly emailVerified: boolean;
  };
  readonly expiresAt: string | Date;
}

/** The plan + profile recoder.xyz reports for a user (the authority). */
export interface RecoderUserProfile {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly plan: Plan;
  readonly hasOwnApiKey: boolean;
}

/**
 * The recoder.xyz auth source-of-truth port. Distribution NEVER becomes a
 * second identity authority: device-flow approval, token issuance, and token
 * verification all defer to this port, which is backed by recoder.xyz.
 */
export interface AuthPort {
  /**
   * Verify a recoder.xyz browser session (the cookie the user approves the
   * device grant with). Returns null when the session is invalid/expired.
   */
  verifySession(rawSessionToken: string): Promise<AuthSessionRef | null>;

  /** Fetch the authoritative plan/profile for a verified user. */
  getUserProfile(userId: string): Promise<RecoderUserProfile | null>;

  /**
   * Verify a previously-issued CLI access token against recoder.xyz. Returns
   * the user profile when the token is valid, else null. This is what
   * cli-token-verifier defers to (never a local-only check).
   */
  verifyCliAccessToken(accessToken: string): Promise<RecoderUserProfile | null>;
}
