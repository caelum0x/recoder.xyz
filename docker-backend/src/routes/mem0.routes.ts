/**
 * mem0 Intelligent Agent Memory API Routes
 *
 * LLM-managed memory (extract/dedupe/update) on top of the raw Qdrant store.
 * Fail-safe: reports availability truthfully; recall returns empty when off.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error helpers are unchanged. The
 * `mem0-client` collaborators are lazily imported exactly as before; only the
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

export interface Mem0RouterDeps {
  authenticateRequest: AuthMiddleware;
}

export function createMem0Router(deps: Mem0RouterDeps): Router {
  const { authenticateRequest } = deps;
  const router = Router();

  router.get('/api/memory/mem0/health', asyncHandler(async (_req: express.Request, res: express.Response) => {
    const { mem0Health } = await import('../mem0-client.js');
    sendSuccess(res, await mem0Health());
  }));

  router.post('/api/memory/mem0/add', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { messages, userId, agentId, runId, metadata } = req.body ?? {};
    const scopeUserId = userId || req.userId;
    if (!Array.isArray(messages) || messages.length === 0) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'messages (non-empty array) is required'));
    }
    if (!scopeUserId) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'userId is required'));
    }
    const { mem0Add } = await import('../mem0-client.js');
    const result = await mem0Add(messages, { userId: scopeUserId, agentId, runId, metadata });
    sendSuccess(res, result);
  }));

  router.post('/api/memory/mem0/search', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { query, userId, agentId, runId, limit } = req.body ?? {};
    const scopeUserId = userId || req.userId;
    if (typeof query !== 'string' || !query.trim()) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'query (string) is required'));
    }
    if (!scopeUserId) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'userId is required'));
    }
    const { mem0Search } = await import('../mem0-client.js');
    const result = await mem0Search(query, { userId: scopeUserId, agentId, runId }, typeof limit === 'number' ? limit : 10);
    sendSuccess(res, result);
  }));

  router.get('/api/memory/mem0/all', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const scopeUserId = (req.query.userId as string | undefined) || req.userId;
    const agentId = req.query.agentId as string | undefined;
    if (!scopeUserId) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'userId is required'));
    }
    const { mem0GetAll } = await import('../mem0-client.js');
    const result = await mem0GetAll({ userId: scopeUserId, agentId });
    sendSuccess(res, result);
  }));

  router.delete('/api/memory/mem0/:memoryId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { mem0Delete } = await import('../mem0-client.js');
    const result = await mem0Delete(req.params.memoryId);
    sendSuccess(res, result);
  }));

  return router;
}
