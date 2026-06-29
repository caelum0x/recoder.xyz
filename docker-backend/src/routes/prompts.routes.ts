/**
 * Prompt Library Routes
 *
 * CRUD + resolution endpoints for the per-user prompt library.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error helpers are unchanged.
 */

import express, { Router } from 'express';
import * as promptStore from '../integrations/prompt-store.js';
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

export interface PromptsRouterDeps {
  authenticateRequest: AuthMiddleware;
}

export function createPromptsRouter(deps: PromptsRouterDeps): Router {
  const { authenticateRequest } = deps;
  const router = Router();

  router.get('/api/prompts', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const prompts = promptStore.listPrompts(req.userId!);
    sendSuccess(res, { prompts });
  }));

  // Create prompt
  router.post('/api/prompts', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { title, description, content } = req.body;
    if (!title || typeof title !== 'string' || !title.trim()) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Title is required'));
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Content is required'));
    }
    const prompt = promptStore.createPrompt(req.userId!, title, description || '', content);
    sendSuccess(res, { prompt });
  }));

  // Update prompt
  router.put('/api/prompts/:promptId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { promptId } = req.params;
    const existing = promptStore.getPrompt(promptId);
    if (!existing) {
      return sendError(res, createError(ErrorCode.NOT_FOUND, 'Prompt not found'));
    }
    if (existing.createdBy !== req.userId) {
      return sendError(res, createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'Not your prompt'));
    }
    const updates: Partial<{ title: string; description: string; content: string }> = {};
    if (req.body.title !== undefined) updates.title = req.body.title;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.content !== undefined) updates.content = req.body.content;

    const updated = promptStore.updatePrompt(promptId, updates);
    sendSuccess(res, { prompt: updated });
  }));

  // Delete prompt
  router.delete('/api/prompts/:promptId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { promptId } = req.params;
    const existing = promptStore.getPrompt(promptId);
    if (!existing) {
      return sendError(res, createError(ErrorCode.NOT_FOUND, 'Prompt not found'));
    }
    if (existing.createdBy !== req.userId) {
      return sendError(res, createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'Not your prompt'));
    }
    promptStore.deletePrompt(promptId);
    sendSuccess(res, { deleted: true });
  }));

  // Replace prompt references in text (utility endpoint for chat pipeline)
  router.post('/api/prompts/resolve', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'Text is required'));
    }
    const resolved = promptStore.replacePromptReferences(text);
    sendSuccess(res, { resolved });
  }));

  return router;
}
