/**
 * E2B Secure Runner API Routes
 *
 * Run AI-generated code / shell commands in secure, ephemeral E2B sandboxes.
 * Fail-safe: when the SDK or E2B_API_KEY is missing, health reports the reason
 * and exec/run return explicit errors — never fake success.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error helpers are unchanged. The
 * `e2b-client` collaborators are lazily imported exactly as before; only the
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

export interface E2bRouterDeps {
  authenticateRequest: AuthMiddleware;
}

export function createE2bRouter(deps: E2bRouterDeps): Router {
  const { authenticateRequest } = deps;
  const router = Router();

  router.get('/api/e2b/health', asyncHandler(async (_req: express.Request, res: express.Response) => {
    const { e2bHealth } = await import('../e2b-client.js');
    sendSuccess(res, await e2bHealth());
  }));

  router.post('/api/e2b/exec', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { command, timeoutMs, envs, sandboxId, keepAlive } = req.body ?? {};
    if (typeof command !== 'string' || !command.trim()) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'command (string) is required'));
    }
    const { e2bExec, E2bOwnershipError } = await import('../e2b-client.js');
    try {
      const result = await e2bExec({ command, timeoutMs, envs, sandboxId, keepAlive, userId: req.userId });
      sendSuccess(res, result);
    } catch (err) {
      if (err instanceof E2bOwnershipError) {
        return sendError(res, createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, err.message));
      }
      sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, err instanceof Error ? err.message : 'E2B exec failed'));
    }
  }));

  router.post('/api/e2b/run', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { code, language, timeoutMs, envs, sandboxId, keepAlive } = req.body ?? {};
    if (typeof code !== 'string' || !code.trim()) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'code (string) is required'));
    }
    if (language && !['python', 'node', 'bash'].includes(language)) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'language must be python, node, or bash'));
    }
    const { e2bRunCode, E2bOwnershipError } = await import('../e2b-client.js');
    try {
      const result = await e2bRunCode({ code, language, timeoutMs, envs, sandboxId, keepAlive, userId: req.userId });
      sendSuccess(res, result);
    } catch (err) {
      if (err instanceof E2bOwnershipError) {
        return sendError(res, createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, err.message));
      }
      sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, err instanceof Error ? err.message : 'E2B run failed'));
    }
  }));

  router.delete('/api/e2b/sandbox/:sandboxId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { sandboxId } = req.params;
    const { e2bKill, E2bOwnershipError } = await import('../e2b-client.js');
    try {
      const killed = await e2bKill(sandboxId, req.userId);
      sendSuccess(res, { killed });
    } catch (err) {
      if (err instanceof E2bOwnershipError) {
        return sendError(res, createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, err.message));
      }
      throw err;
    }
  }));

  return router;
}
