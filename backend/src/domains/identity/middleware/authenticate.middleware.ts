/**
 * Express auth middleware — built on the {@link SessionVerifier} seam.
 *
 * Replaces the legacy `server.ts` auth block. Every factory extracts a
 * {@link Credential} from the request, resolves a {@link Principal} through the
 * verifier, and attaches it to `req.principal` (+ `req.userId`/`req.sessionId`
 * for back-compat). Truthful failures:
 *   - unauthenticated + `strictAuth` on  → 401 `AUTH_REQUIRED`
 *   - unauthenticated + `strictAuth` off → anonymous fallback (read-only paths)
 *   - internal gate misconfigured        → 503 `SERVICE_UNAVAILABLE` (fail-closed)
 *   - authorization denied               → 403 `AUTHZ_PROJECT_ACCESS_DENIED`
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ErrorCode, createError, sendError } from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';
import type { SessionVerifier } from '../ports/session-verifier.port.js';
import type { PermissionEvaluator, AuthzResource } from '../ports/rbac.port.js';
import type { Credential, Permission, Principal } from '../types.js';
import type { IdentityConfig } from '../config.js';
import type { PrincipalService } from '../principal.service.js';

// --- Express request augmentation: the resolved principal + back-compat ids. ---
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: Principal;
      userId?: string;
      sessionId?: string;
    }
  }
}

/** Build a {@link Credential} from an express request's headers. */
export function credentialFromRequest(req: Request): Credential {
  const header = (name: string): string | null => {
    const v = req.headers[name];
    if (Array.isArray(v)) return v[0] ?? null;
    return typeof v === 'string' ? v : null;
  };
  return {
    cookieHeader: header('cookie'),
    authorizationHeader: header('authorization'),
    apiKey: header('x-api-key'),
    internalKey: header('x-internal-service-key'),
    deviceToken: header('x-device-token'),
    ip: req.ip ?? null,
    requestId: (req as { requestId?: string }).requestId ?? header('x-request-id'),
  };
}

/** Attach a resolved principal to the request (immutably from the caller's view). */
function attach(req: Request, principal: Principal): void {
  req.principal = principal;
  req.userId = principal.userId;
  if (principal.sessionId) req.sessionId = principal.sessionId;
}

export interface AuthMiddlewareDeps {
  readonly verifier: SessionVerifier;
  readonly principal: PrincipalService;
  readonly config: IdentityConfig;
  readonly logger: Logger;
  /** Optional RBAC evaluator; absent → `requirePermission` fails closed. */
  readonly evaluator?: PermissionEvaluator;
  /** Admin allowlist (userIds); a principal with `admin` scope also passes. */
  readonly adminUserIds?: readonly string[];
}

/** The middleware surface every domain guards its routes with. */
export interface AuthMiddleware {
  /** Require auth; allow the anonymous fallback on read paths when not strict. */
  authenticate: RequestHandler;
  /** Require a real (non-anonymous) principal — for mutating routes. */
  authenticateMutating: RequestHandler;
  /** Require an admin principal (allowlist or `admin` scope). Runs after auth. */
  requireAdmin: RequestHandler;
  /** Require a valid `INTERNAL_SERVICE_KEY` (constant-time; fail-closed). */
  requireInternal: RequestHandler;
  /** Require a permission via the RBAC evaluator; org-isolation aware. */
  requirePermission: (action: Permission, resource?: (req: Request) => AuthzResource) => RequestHandler;
  /** Verify the principal's org scope matches the request's target org. */
  verifyOrgAccess: (orgIdOf?: (req: Request) => string | undefined) => RequestHandler;
}

/** Build the auth middleware bound to a verifier + config. */
export function createAuthMiddleware(deps: AuthMiddlewareDeps): AuthMiddleware {
  const { verifier, principal, config, logger, evaluator } = deps;
  const adminIds = new Set(deps.adminUserIds ?? []);

  const resolve = async (req: Request): Promise<Principal | null> => {
    try {
      return await verifier.verify(credentialFromRequest(req));
    } catch (err) {
      // A thrown error is an infra fault — surface as 503, not a silent allow.
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'verifier faulted');
      return null;
    }
  };

  const authenticate: RequestHandler = (req, res, next) => {
    void resolve(req).then((p) => {
      if (p) {
        attach(req, p);
        return next();
      }
      if (!config.strictAuth) {
        attach(req, principal.getAnonymousFallbackIdentity());
        return next();
      }
      sendError(res, createError(ErrorCode.AUTH_REQUIRED));
    });
  };

  const authenticateMutating: RequestHandler = (req, res, next) => {
    void resolve(req).then((p) => {
      if (p && !p.isAnonymous) {
        attach(req, p);
        return next();
      }
      // Solo/desktop mode (RECODER_SOLO_MODE): a single local user on their own
      // machine. There is no sign-in plane and the minted sk_ key can't validate
      // without a DB, so the caller resolves anonymous — which would 401 every
      // mutating route (create workspace, run agent, merge). Promote the local
      // caller to a synthetic non-anonymous owner. A cloud deploy never sets
      // RECODER_SOLO_MODE, so it keeps the fail-closed AUTH_REQUIRED below.
      if (process.env.RECODER_SOLO_MODE === '1') {
        attach(req, principal.getSoloOwnerIdentity());
        return next();
      }
      sendError(res, createError(ErrorCode.AUTH_REQUIRED));
    });
  };

  const requireAdmin: RequestHandler = (req, res, next) => {
    const p = req.principal;
    if (!p || p.isAnonymous) {
      sendError(res, createError(ErrorCode.AUTH_REQUIRED));
      return;
    }
    const isAdmin = p.kind === 'internal' || adminIds.has(p.userId) || p.scopes.includes('admin');
    if (!isAdmin) {
      sendError(res, createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'Admin access required.'));
      return;
    }
    next();
  };

  const requireInternal: RequestHandler = (req, res, next) => {
    if (!config.internalServiceKeyPresent) {
      // Fail-closed: an unconfigured gate denies rather than opening internal routes.
      sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Internal service gate not configured.'));
      return;
    }
    const cred = credentialFromRequest(req);
    const p = principal.resolveInternalServiceSession(cred.internalKey ?? null);
    if (!p) {
      sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Invalid internal service key.'));
      return;
    }
    attach(req, p);
    next();
  };

  const requirePermission =
    (action: Permission, resourceOf?: (req: Request) => AuthzResource): RequestHandler =>
    (req, res, next) => {
      const p = req.principal;
      if (!p || p.isAnonymous) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      const resource = resourceOf?.(req);
      if (!evaluator) {
        // No RBAC wired yet: allow only fully-trusted principals, else fail closed.
        if (p.kind === 'internal' || p.scopes.includes('admin')) {
          next();
          return;
        }
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Authorization service unavailable.'));
        return;
      }
      void evaluator
        .can(p, action, resource)
        .then((allowed) => {
          if (allowed) return next();
          sendError(res, createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED));
        })
        .catch((err: unknown) => {
          logger.error({ err: err instanceof Error ? err.message : String(err), action }, 'permission eval faulted');
          sendError(res, createError(ErrorCode.AUTHZ_SERVICE_ERROR));
        });
    };

  const verifyOrgAccess =
    (orgIdOf?: (req: Request) => string | undefined): RequestHandler =>
    (req, res, next) => {
      const p = req.principal;
      if (!p || p.isAnonymous) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      const target = orgIdOf ? orgIdOf(req) : (req.params.orgId ?? req.params.id);
      if (!target) return next(); // no org scope on this route
      if (p.kind === 'internal' || p.scopes.includes('admin')) return next();
      if (p.orgId && p.orgId === target) return next();
      sendError(res, createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'Org access denied.'));
    };

  return {
    authenticate,
    authenticateMutating,
    requireAdmin,
    requireInternal,
    requirePermission,
    verifyOrgAccess,
  };
}
