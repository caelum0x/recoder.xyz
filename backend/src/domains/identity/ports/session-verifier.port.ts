/**
 * `SessionVerifier` — THE load-bearing identity seam.
 *
 * This is the one credential-resolution port every other domain guards a
 * request with. It turns *any* inbound credential (Better Auth session cookie
 * or bearer, `sk_` platform key, CLI device token, `INTERNAL_SERVICE_KEY`) into
 * a canonical {@link Principal}, or `null` when nothing resolves.
 *
 * FROZEN CONTRACT — Phase 2 seam. Downstream domains (edge, agent-os,
 * governance, billing, conductor, …) compile against `verify(cred) → Principal`
 * while the concrete `PrincipalService` impl is still being written. Do not
 * widen or narrow this signature without a cross-domain migration.
 *
 * Semantics:
 *  - Returns a resolved `Principal` for a valid credential.
 *  - Returns `null` when no credential is present OR a presented credential is
 *    invalid/expired — it NEVER throws for an auth failure (a thrown error means
 *    an infrastructure fault, which callers surface as 503, not 401).
 *  - Never mints the `anonymous` fallback here; that decision is the caller's
 *    (the middleware, gated by `STRICT_AUTH`).
 */
import type { Credential, Principal } from '../types.js';

export interface SessionVerifier {
  /**
   * Resolve inbound credential material to a canonical principal.
   *
   * @param cred raw credential material extracted from the request
   * @returns the resolved principal, or `null` when unauthenticated
   */
  verify(cred: Credential): Promise<Principal | null>;
}
