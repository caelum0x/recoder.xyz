/**
 * @module rbac.middleware
 *
 * Express middleware for A2A authentication and authorization.
 *
 * Provides a layered middleware chain:
 *
 * 1. `extractA2AIdentity` -- extracts the caller identity from request
 *    headers (API key, Bearer token, or agent-id). Sets `req.a2aPrincipal`
 *    but does NOT reject anonymous requests (allows public endpoints).
 *
 * 2. `requireA2AAuth` -- gate that rejects requests without a principal
 *    (HTTP 401).
 *
 * 3. `requireA2APermission(resource, action)` -- checks RBAC permission
 *    for the authenticated principal (HTTP 403 on denial).
 *
 * 4. `requireA2ARole(...roles)` -- checks the principal's role against an
 *    allowed set (HTTP 403 on mismatch).
 *
 * Identity extraction priority order:
 *   x-api-key > Authorization: Bearer <token> > x-agent-id
 *
 * P18-002: A2A auth middleware (identity + enforcement)
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import {
  A2AErrorCodeEnum,
  buildA2AError,
  type A2AError,
} from '@recoder/shared/a2a';
import {
  getA2ARBACService,
  type A2ARole,
  type A2AResource,
  type A2AAction,
} from './rbac.service';
import { createLogger } from '../logger';

const logger = createLogger('a2a-rbac-middleware');

// ---------------------------------------------------------------------------
// Augment Express Request
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      /** The authenticated A2A principal, set by `extractA2AIdentity`. */
      a2aPrincipal?: {
        id: string;
        role: A2ARole;
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function sendAuthError(res: Response, httpStatus: number, error: A2AError): void {
  res.status(httpStatus).json({
    success: false,
    error,
  });
}

// ---------------------------------------------------------------------------
// extractA2AIdentity
// ---------------------------------------------------------------------------

/**
 * Extracts agent identity from the request headers and sets
 * `req.a2aPrincipal`. Does NOT reject anonymous requests -- downstream
 * middleware (e.g. `requireA2AAuth`) is responsible for enforcement.
 *
 * Resolution order:
 * 1. `x-api-key` header -- resolved via `rbacService.resolveApiKey()`
 * 2. `authorization: Bearer <token>` -- token treated as principal ID
 * 3. `x-agent-id` header -- treated as principal ID (service-to-service)
 */
export function extractA2AIdentity(req: Request, _res: Response, next: NextFunction): void {
  const rbac = getA2ARBACService();
  let principalId: string | undefined;

  // 1. x-api-key header
  const apiKey = req.headers['x-api-key'];
  if (apiKey && typeof apiKey === 'string') {
    principalId = rbac.resolveApiKey(apiKey);
    if (principalId) {
      const role = rbac.getRole(principalId);
      if (role) {
        req.a2aPrincipal = { id: principalId, role };
        logger.debug(`Identity resolved via x-api-key for principal ${principalId}`);
        next();
        return;
      }
    }
  }

  // 2. Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  if (authHeader && typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) {
      principalId = match[1];
      const role = rbac.getRole(principalId);
      if (role) {
        req.a2aPrincipal = { id: principalId, role };
        logger.debug(`Identity resolved via Bearer token for principal ${principalId}`);
        next();
        return;
      }
    }
  }

  // 3. x-agent-id header (internal service-to-service)
  const agentId = req.headers['x-agent-id'];
  if (agentId && typeof agentId === 'string') {
    principalId = agentId;
    const role = rbac.getRole(principalId);
    if (role) {
      req.a2aPrincipal = { id: principalId, role };
      logger.debug(`Identity resolved via x-agent-id for principal ${principalId}`);
      next();
      return;
    }
  }

  // No identity found -- allow anonymous access (downstream can enforce)
  req.a2aPrincipal = undefined;
  next();
}

// ---------------------------------------------------------------------------
// requireA2AAuth
// ---------------------------------------------------------------------------

/**
 * Gate middleware that rejects with HTTP 401 if `req.a2aPrincipal` is not
 * set. Must be placed after `extractA2AIdentity` in the chain.
 */
export function requireA2AAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.a2aPrincipal) {
    sendAuthError(res, 401, buildA2AError({
      code: A2AErrorCodeEnum.AuthenticationFailed,
      message: 'Authentication required. Provide x-api-key, Bearer token, or x-agent-id header.',
    }));
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// requireA2APermission
// ---------------------------------------------------------------------------

/**
 * Returns middleware that checks whether the authenticated principal has
 * permission for the given resource + action combination. Rejects with
 * HTTP 403 if denied.
 *
 * Assumes `req.a2aPrincipal` is already set (use after `requireA2AAuth`).
 */
export function requireA2APermission(resource: A2AResource, action: A2AAction): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const principal = req.a2aPrincipal;

    if (!principal) {
      sendAuthError(res, 401, buildA2AError({
        code: A2AErrorCodeEnum.AuthenticationFailed,
        message: 'Authentication required before permission check.',
      }));
      return;
    }

    const rbac = getA2ARBACService();
    const allowed = rbac.isAllowed(principal.id, resource, action);

    if (!allowed) {
      sendAuthError(res, 403, buildA2AError({
        code: A2AErrorCodeEnum.AuthorizationDenied,
        message: `Principal '${principal.id}' (role: ${principal.role}) is not allowed to ${action} on ${resource}.`,
        details: {
          principal_id: principal.id,
          role: principal.role,
          resource,
          action,
        },
      }));
      return;
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// requireA2ARole
// ---------------------------------------------------------------------------

/**
 * Returns middleware that checks whether the authenticated principal's role
 * is in the provided list. Rejects with HTTP 403 if not.
 *
 * Assumes `req.a2aPrincipal` is already set (use after `requireA2AAuth`).
 */
export function requireA2ARole(...roles: A2ARole[]): RequestHandler {
  const allowedRoles = new Set(roles);

  return (req: Request, res: Response, next: NextFunction): void => {
    const principal = req.a2aPrincipal;

    if (!principal) {
      sendAuthError(res, 401, buildA2AError({
        code: A2AErrorCodeEnum.AuthenticationFailed,
        message: 'Authentication required before role check.',
      }));
      return;
    }

    if (!allowedRoles.has(principal.role)) {
      sendAuthError(res, 403, buildA2AError({
        code: A2AErrorCodeEnum.AuthorizationDenied,
        message: `Principal '${principal.id}' has role '${principal.role}', but one of [${roles.join(', ')}] is required.`,
        details: {
          principal_id: principal.id,
          current_role: principal.role,
          required_roles: roles,
        },
      }));
      return;
    }

    next();
  };
}
