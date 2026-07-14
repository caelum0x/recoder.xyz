/**
 * API Key Management Routes
 *
 * Per-user public API key lifecycle: list, create, delete, revoke (deactivate),
 * and aggregated usage stats. All routes require authentication and reject the
 * anonymous user.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error helpers are unchanged. Only the
 * `authenticateRequest` middleware is injected via the factory; the api-key store
 * helpers are imported directly from their existing module.
 */

import express, { Router } from 'express';
import {
  ErrorCode,
  createError,
  asyncHandler,
  sendError,
  sendSuccess,
} from '../errors/index.js';
import {
  createApiKey,
  listUserApiKeys,
  deleteApiKey,
  revokeApiKey,
  getUsage,
} from '../public-api/api-keys.js';

interface AuthenticatedRequest extends express.Request {
  userId?: string;
  sessionId?: string;
}

type AuthMiddleware = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
) => void;

export interface ApiKeysRouterDeps {
  authenticateRequest: AuthMiddleware;
}

export function createApiKeysRouter(deps: ApiKeysRouterDeps): Router {
  const { authenticateRequest } = deps;
  const router = Router();

  // GET /api/v1/api-keys - list keys for authenticated user
  router.get('/api/v1/api-keys', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Authentication required'));
    }

    const keys = listUserApiKeys(userId);
    sendSuccess(res, { keys });
  }));

  // POST /api/v1/api-keys - create a new API key
  router.post('/api/v1/api-keys', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Authentication required'));
    }

    const { name, scopes, allowedIps, expiresAt, isTestKey, metadata } = req.body;
    if (!name || !scopes || !Array.isArray(scopes) || scopes.length === 0) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'name and scopes[] are required'));
    }

    try {
      const result = createApiKey(userId, { name, scopes, allowedIps, expiresAt, isTestKey, metadata });
      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, createError(ErrorCode.VALIDATION_ERROR, err.message));
    }
  }));

  // DELETE /api/v1/api-keys/:id - delete an API key
  router.delete('/api/v1/api-keys/:id', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Authentication required'));
    }

    const keyId = req.params.id;
    const deleted = deleteApiKey(keyId, userId);
    if (!deleted) {
      return sendError(res, createError(ErrorCode.NOT_FOUND, 'API key not found or access denied'));
    }

    sendSuccess(res, { deleted: true, id: keyId });
  }));

  // PATCH /api/v1/api-keys/:id - revoke (deactivate) an API key without deleting
  router.patch('/api/v1/api-keys/:id', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Authentication required'));
    }

    const keyId = req.params.id;
    const revoked = revokeApiKey(keyId, userId);
    if (!revoked) {
      return sendError(res, createError(ErrorCode.NOT_FOUND, 'API key not found or access denied'));
    }

    sendSuccess(res, { revoked: true, id: keyId, status: 'inactive' });
  }));

  // GET /api/v1/api-keys/usage - get aggregated usage stats for user's keys
  router.get('/api/v1/api-keys/usage', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      return sendError(res, createError(ErrorCode.AUTH_REQUIRED, 'Authentication required'));
    }

    const keys = listUserApiKeys(userId);
    const usageByKey: Record<string, { name: string; keyPrefix: string; usage: ReturnType<typeof getUsage>; totalRequests: number }> = {};
    let totalRequests = 0;

    for (const key of keys) {
      const usage = getUsage(key.id);
      usageByKey[key.id] = {
        name: key.name,
        keyPrefix: key.keyPrefix,
        usage,
        totalRequests: key.totalRequests,
      };
      totalRequests += key.totalRequests;
    }

    sendSuccess(res, {
      totalKeys: keys.length,
      activeKeys: keys.filter(k => k.isActive).length,
      totalRequests,
      keys: usageByKey,
    });
  }));

  return router;
}
