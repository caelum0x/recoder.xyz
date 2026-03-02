/**
 * @module context-bridge.routes
 *
 * Express route handlers for the A2A Context Bridge.
 *
 * Provides the following endpoints under the `/api/a2a/context` prefix:
 *
 * | Method | Path                    | Description                                    |
 * |--------|-------------------------|------------------------------------------------|
 * | POST   | /:taskId                | Create or append a context entry for a task    |
 * | GET    | /:taskId                | Get all context entries for a task              |
 * | GET    | /:taskId/:type          | Get context entries of a specific type          |
 * | POST   | /transfer               | Transfer context from one task to another       |
 * | DELETE | /:taskId                | Delete all context for a task                   |
 */

import { Router, type Request, type Response } from 'express';
import {
  getContextBridgeService,
  type ContextType,
} from './context-bridge.service';
import {
  parseContextJsonBody,
  validateTaskIdParam,
  validateContextTypeParam,
  validateCreateContextBody,
  validateTransferContextBody,
} from './context-bridge.middleware';
import { createLogger } from '../logger';

const logger = createLogger('a2a-context-routes');

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface ErrorResponse {
  success: false;
  error: { message: string; details?: Record<string, unknown> };
}

function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const response: SuccessResponse<T> = { success: true, data };
  res.status(statusCode).json(response);
}

function sendError(res: Response, httpStatus: number, message: string, details?: Record<string, unknown>): void {
  const response: ErrorResponse = {
    success: false,
    error: { message, ...(details ? { details } : {}) },
  };
  res.status(httpStatus).json(response);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const contextBridgeRouter = Router();

// Parse JSON from text body (A2A routes use express.text())
contextBridgeRouter.use(parseContextJsonBody);

// ---------------------------------------------------------------------------
// POST /transfer -- Transfer context between tasks
// (Must be defined BEFORE /:taskId to avoid route conflict)
// ---------------------------------------------------------------------------

contextBridgeRouter.post(
  '/transfer',
  validateTransferContextBody,
  async (req: Request, res: Response) => {
    try {
      const service = getContextBridgeService();
      const { fromTaskId, toTaskId } = req.body;

      const result = await service.transferContext(fromTaskId, toTaskId);

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      sendSuccess(res, result.data);
    } catch (err) {
      logger.error({ err }, 'unhandled error in POST /api/a2a/context/transfer');
      sendError(res, 500, 'Internal server error while transferring context');
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:taskId -- Create/append context for a task
// ---------------------------------------------------------------------------

contextBridgeRouter.post(
  '/:taskId',
  validateTaskIdParam,
  validateCreateContextBody,
  async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const { type, data } = req.body;
      const service = getContextBridgeService();

      const result = await service.createContext(taskId, type as ContextType, data);

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      sendSuccess(res, result.data, 201);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in POST /api/a2a/context/:taskId');
      sendError(res, 500, 'Internal server error while creating context');
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:taskId -- Get all context for a task
// ---------------------------------------------------------------------------

contextBridgeRouter.get(
  '/:taskId',
  validateTaskIdParam,
  async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const service = getContextBridgeService();

      const result = await service.getContext(taskId);

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      sendSuccess(res, result.data);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in GET /api/a2a/context/:taskId');
      sendError(res, 500, 'Internal server error while fetching context');
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:taskId/:type -- Get context by type for a task
// ---------------------------------------------------------------------------

contextBridgeRouter.get(
  '/:taskId/:type',
  validateTaskIdParam,
  validateContextTypeParam,
  async (req: Request, res: Response) => {
    try {
      const { taskId, type } = req.params;
      const service = getContextBridgeService();

      const result = await service.getContextByType(taskId, type as ContextType);

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      sendSuccess(res, {
        task_id: taskId,
        type,
        entries: result.data,
        count: result.data.length,
      });
    } catch (err) {
      logger.error(
        { err, taskId: req.params.taskId, type: req.params.type },
        'unhandled error in GET /api/a2a/context/:taskId/:type',
      );
      sendError(res, 500, 'Internal server error while fetching context by type');
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /:taskId -- Delete all context for a task
// ---------------------------------------------------------------------------

contextBridgeRouter.delete(
  '/:taskId',
  validateTaskIdParam,
  async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const service = getContextBridgeService();

      const result = await service.deleteContext(taskId);

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      sendSuccess(res, result.data);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in DELETE /api/a2a/context/:taskId');
      sendError(res, 500, 'Internal server error while deleting context');
    }
  },
);
