/**
 * Zero-Trust Network (OpenZiti) API Routes
 *
 * Provision zero-trust identities/enrollment for runners. Fail-safe.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error helpers are unchanged. The
 * `ziti-client` collaborators are lazily imported exactly as before; only the
 * `authenticateRequest` middleware is injected via the factory.
 */

import express, { Router } from 'express';
import {
  ErrorCode,
  createError,
  asyncHandler,
  sendError,
  sendSuccess,
} from '../errors/index.js';

interface AuthenticatedRequest extends express.Request {
  userId?: string;
  sessionId?: string;
}

type AuthMiddleware = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
) => void;

export interface ZitiRouterDeps {
  authenticateRequest: AuthMiddleware;
}

export function createZitiRouter(deps: ZitiRouterDeps): Router {
  const { authenticateRequest } = deps;
  const router = Router();

  router.get('/api/ziti/health', asyncHandler(async (_req: express.Request, res: express.Response) => {
    const { zitiHealth } = await import('../ziti-client.js');
    sendSuccess(res, await zitiHealth());
  }));

  router.get('/api/ziti/identities', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { listIdentities } = await import('../ziti-client.js');
    sendSuccess(res, await listIdentities(req.query.filter as string | undefined));
  }));

  router.post('/api/ziti/identities', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { name, isAdmin, roleAttributes } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'name (string) is required'));
    }
    const { createIdentity } = await import('../ziti-client.js');
    const result = await createIdentity({ name: name.trim(), isAdmin, roleAttributes });
    if (!result.available) return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, result.reason ?? 'Ziti unavailable'));
    sendSuccess(res, result);
  }));

  router.post('/api/ziti/runners', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { name } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'name (string) is required'));
    }
    const { provisionRunnerIdentity } = await import('../ziti-client.js');
    const result = await provisionRunnerIdentity(name.trim());
    if (!result.available) return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, result.reason ?? 'Ziti unavailable'));
    sendSuccess(res, result);
  }));

  router.delete('/api/ziti/identities/:id', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { deleteIdentity } = await import('../ziti-client.js');
    sendSuccess(res, await deleteIdentity(req.params.id));
  }));

  return router;
}
