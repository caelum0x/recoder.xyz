/**
 * Edge auth middleware — built on the frozen Phase-2 {@link SessionVerifier} seam
 * (CONSUMES identity; never re-implements credential resolution). Each factory
 * extracts a {@link Credential} from the untrusted request via identity's single
 * `credentialFromRequest` mapper, resolves a {@link Principal} through the
 * verifier, and attaches it to `req.principal` (+ back-compat `userId`/`sessionId`).
 *
 * Truthful failures (never a silent allow):
 *  - unauthenticated on a required route → 401 `AUTH_REQUIRED`
 *  - the verifier THROWS (infra fault)   → 503 `SERVICE_UNAVAILABLE`
 * The verifier itself returns `null` (not throw) for a missing/invalid credential,
 * so a thrown error is always an infrastructure fault surfaced as 503, not 401.
 */
import type { Request, RequestHandler } from 'express';
import { ErrorCode, createError, sendError } from '../../shared/errors.js';
import type { Logger } from '../../shared/logger.js';
import type { SessionVerifier } from '../../domains/identity/ports/session-verifier.port.js';
import type { Principal } from '../../domains/identity/types.js';
import { credentialFromRequest } from '../../domains/identity/middleware/authenticate.middleware.js';

export interface AuthDeps {
  readonly verifier: SessionVerifier;
  readonly logger: Logger;
}

/** Attach a resolved principal to the request (immutable from the caller's view). */
function attach(req: Request, principal: Principal): void {
  req.principal = principal;
  req.userId = principal.userId;
  if (principal.sessionId) req.sessionId = principal.sessionId;
}

/**
 * Resolve the principal for a request through the verifier. Returns `null` for an
 * absent/invalid credential; re-throws an infra fault for the caller to map to 503.
 */
export async function resolveSession(verifier: SessionVerifier, req: Request): Promise<Principal | null> {
  return verifier.verify(credentialFromRequest(req));
}

/**
 * Require a resolved principal. 401 when none resolves; 503 when the verifier
 * faults. Use on every mount that must not serve an unauthenticated caller.
 */
export function authenticateRequest(deps: AuthDeps): RequestHandler {
  return (req, res, next) => {
    void resolveSession(deps.verifier, req)
      .then((principal) => {
        if (principal) {
          attach(req, principal);
          return next();
        }
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
      })
      .catch((err: unknown) => {
        deps.logger.error(
          { err: err instanceof Error ? err.message : String(err), path: req.path },
          'session verifier faulted — failing to 503',
        );
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Authentication service unavailable.'));
      });
  };
}

/**
 * Attach a principal WHEN one resolves, but never reject: an anonymous/absent
 * caller passes through. For public-read mounts that personalize when signed in.
 * A verifier fault is logged and treated as "no principal" (availability-biased).
 */
export function optionalAuth(deps: AuthDeps): RequestHandler {
  return (req, res, next) => {
    void resolveSession(deps.verifier, req)
      .then((principal) => {
        if (principal) attach(req, principal);
        next();
      })
      .catch((err: unknown) => {
        deps.logger.error(
          { err: err instanceof Error ? err.message : String(err), path: req.path },
          'optional-auth verifier faulted — proceeding unauthenticated',
        );
        next();
      });
  };
}
