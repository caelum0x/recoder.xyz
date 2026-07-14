/**
 * Browser Verification API Routes
 *
 * Drive a headless browser to verify a preview URL actually renders/behaves.
 * Deterministic checks (Puppeteer) + optional AI checks (Stagehand, fail-safe).
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error helpers are unchanged. The
 * `browser-verify` collaborators are lazily imported exactly as before; only the
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

export interface BrowserVerifyRouterDeps {
  authenticateRequest: AuthMiddleware;
}

export function createBrowserVerifyRouter(deps: BrowserVerifyRouterDeps): Router {
  const { authenticateRequest } = deps;
  const router = Router();

  router.get('/api/browser/verify/health', asyncHandler(async (_req: express.Request, res: express.Response) => {
    const { browserVerifyHealth } = await import('../browser-verify.js');
    sendSuccess(res, await browserVerifyHealth());
  }));

  router.post('/api/browser/verify', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { url, checks, timeoutMs, viewport, settleMs } = req.body ?? {};
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'url (http/https) is required'));
    }
    if (checks !== undefined && !Array.isArray(checks)) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'checks must be an array'));
    }
    const { browserVerify } = await import('../browser-verify.js');
    const result = await browserVerify({ url, checks, timeoutMs, viewport, settleMs });
    sendSuccess(res, result);
  }));

  router.post('/api/browser/verify/ai', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { url, instruction, timeoutMs } = req.body ?? {};
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'url (http/https) is required'));
    }
    if (typeof instruction !== 'string' || !instruction.trim()) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'instruction (string) is required'));
    }
    const { browserAiVerify } = await import('../browser-verify.js');
    const result = await browserAiVerify({ url, instruction, timeoutMs });
    sendSuccess(res, result);
  }));

  return router;
}
