/**
 * Unified Multi-Model LLM Router API Routes
 *
 * One endpoint routes to any provider by `provider/model`, BYOK-aware.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error helpers are unchanged. The
 * `llm-router` collaborators are lazily imported exactly as before; only the
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

export interface LlmRouterRouterDeps {
  authenticateRequest: AuthMiddleware;
}

export function createLlmRouterRouter(deps: LlmRouterRouterDeps): Router {
  const { authenticateRequest } = deps;
  const router = Router();

  router.get('/api/llm/providers', authenticateRequest, asyncHandler(async (_req: AuthenticatedRequest, res: express.Response) => {
    const { listProviders, llmRouterHealth } = await import('../llm-router.js');
    sendSuccess(res, { health: llmRouterHealth(), providers: listProviders() });
  }));

  router.post('/api/llm/route', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { prompt, provider } = req.body ?? {};
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'prompt (string) is required'));
    }
    const { recommendModel } = await import('../llm-router.js');
    sendSuccess(res, recommendModel({ prompt, provider }));
  }));

  router.post('/api/llm/chat', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { model, messages, provider, apiKey, temperature, maxTokens, timeoutMs, autoModel } = req.body ?? {};
    // autoModel: pick a model by prompt complexity when no explicit model given.
    let resolvedModel = model;
    if ((!resolvedModel || autoModel === true) && Array.isArray(messages) && messages.length > 0) {
      const { recommendModel } = await import('../llm-router.js');
      const lastUser = [...messages].reverse().find((m: { role?: string; content?: string }) => m.role === 'user');
      const rec = recommendModel({ prompt: String(lastUser?.content ?? ''), provider });
      resolvedModel = `${rec.provider}/${rec.model}`;
    }
    if (typeof resolvedModel !== 'string' || !resolvedModel.trim()) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'model (string) is required (or pass autoModel:true)'));
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'messages (non-empty array) is required'));
    }
    const { chatComplete } = await import('../llm-router.js');
    const result = await chatComplete({
      model: resolvedModel,
      messages,
      provider,
      apiKey,
      userId: req.userId,
      temperature,
      maxTokens,
      timeoutMs,
    });
    if (!result.ok) {
      return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, result.error ?? 'chat completion failed'));
    }
    sendSuccess(res, result);
  }));

  return router;
}
