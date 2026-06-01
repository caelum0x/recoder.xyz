/**
 * @module multi-dispatch.routes
 *
 * Express route handlers for multi-agent dispatch within workspaces.
 *
 * | Method | Path                                       | Description           |
 * |--------|--------------------------------------------|-----------------------|
 * | POST   | /:wsId/dispatch                            | Multi-agent dispatch  |
 * | GET    | /:wsId/dispatch/:dispatchId                | Dispatch status       |
 * | GET    | /:wsId/dispatch/:dispatchId/results        | Aggregated results    |
 * | POST   | /:wsId/dispatch/:dispatchId/cancel         | Cancel all tasks      |
 */

import { Router, type Request, type Response } from 'express';
import {
  A2AErrorCodeEnum,
  buildA2AError,
  type A2AError,
} from '@recoder/shared/a2a';
import { getMultiDispatchService } from './multi-dispatch.service';
import { createLogger } from '../logger';

const logger = createLogger('a2a-multi-dispatch-routes');

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface ErrorResponse {
  success: false;
  error: A2AError;
}

function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const response: SuccessResponse<T> = { success: true, data };
  res.status(statusCode).json(response);
}

function sendError(res: Response, httpStatus: number, error: A2AError): void {
  const response: ErrorResponse = { success: false, error };
  res.status(httpStatus).json(response);
}

// ---------------------------------------------------------------------------
// Router (mounted under /api/a2a/workspaces/:wsId/dispatch)
// ---------------------------------------------------------------------------

export const multiDispatchRouter = Router({ mergeParams: true });

// ── POST / — Multi-agent dispatch ───────────────────────────────────────

multiDispatchRouter.post('/', async (req: Request, res: Response) => {
  try {
    const wsId = req.params.wsId;
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    if (!body?.prompt) {
      return sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.InvalidParams,
        message: 'prompt is required',
      }));
    }

    const dispatch = await getMultiDispatchService().dispatch(wsId, {
      prompt: body.prompt,
      agentIds: body.agentIds,
      autoRoute: body.autoRoute,
      orchestrationPattern: body.orchestrationPattern,
      aggregationStrategy: body.aggregationStrategy,
      priority: body.priority,
      worktreeIsolation: body.worktreeIsolation,
      // Capability-routing inputs — without these the auto-router silently
      // falls back to empty defaults and ignores caller-supplied routing intent.
      requiredCapabilities: body.requiredCapabilities,
      preferredCapabilities: body.preferredCapabilities,
      intent: body.intent,
      requireHealthy: body.requireHealthy,
    });

    sendSuccess(res, dispatch, 201);
  } catch (err: any) {
    logger.error({ err }, 'failed to dispatch');
    sendError(res, err.message?.includes('not found') ? 404 : 500, buildA2AError({
      code: err.message?.includes('not found') ? A2AErrorCodeEnum.TaskNotFound : A2AErrorCodeEnum.InternalError,
      message: err.message || 'Failed to dispatch',
    }));
  }
});

// ── GET /:dispatchId — Dispatch status ──────────────────────────────────

multiDispatchRouter.get('/:dispatchId', (req: Request, res: Response) => {
  const record = getMultiDispatchService().get(req.params.dispatchId);
  if (!record) {
    return sendError(res, 404, buildA2AError({
      code: A2AErrorCodeEnum.TaskNotFound,
      message: `Dispatch not found: ${req.params.dispatchId}`,
    }));
  }
  sendSuccess(res, record);
});

// ── GET /:dispatchId/results — Aggregated results ───────────────────────

multiDispatchRouter.get('/:dispatchId/results', (req: Request, res: Response) => {
  const record = getMultiDispatchService().getResults(req.params.dispatchId);
  if (!record) {
    return sendError(res, 404, buildA2AError({
      code: A2AErrorCodeEnum.TaskNotFound,
      message: `Dispatch not found: ${req.params.dispatchId}`,
    }));
  }
  sendSuccess(res, {
    dispatchId: record.dispatchId,
    status: record.status,
    results: record.results,
    taskIds: record.taskIds,
    agentIds: record.agentIds,
  });
});

// ── POST /:dispatchId/cancel — Cancel all tasks ─────────────────────────

multiDispatchRouter.post('/:dispatchId/cancel', async (req: Request, res: Response) => {
  try {
    const cancelled = await getMultiDispatchService().cancel(req.params.dispatchId);
    if (!cancelled) {
      return sendError(res, 404, buildA2AError({
        code: A2AErrorCodeEnum.TaskNotFound,
        message: `Dispatch not found: ${req.params.dispatchId}`,
      }));
    }
    sendSuccess(res, { cancelled: true });
  } catch (err: any) {
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: err.message,
    }));
  }
});
