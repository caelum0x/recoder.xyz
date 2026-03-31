/**
 * @module task-lifecycle.routes
 *
 * Express route handlers for A2A task lifecycle operations.
 *
 * Provides the following endpoints under the `/api/a2a/tasks` prefix:
 *
 * | Method | Path                          | Description                              |
 * |--------|-------------------------------|------------------------------------------|
 * | POST   | /                             | Create a new task (state: submitted)     |
 * | PATCH  | /:taskId/transition           | Transition task to a new state           |
 * | GET    | /:taskId                      | Get a task with full envelope            |
 * | GET    | /:taskId/history              | Get transition history for a task        |
 * | GET    | /                             | List tasks with optional filters         |
 *
 * All error responses use the canonical A2A error taxonomy from
 * `@recoder/shared/a2a/schemas`.
 */

import { Router, type Request, type Response } from 'express';
import {
  A2AErrorCodeEnum,
  buildA2AError,
  type A2AError,
  type TaskEnvelope,
} from '@recoder/shared/a2a';
import { getAgentBridgeService } from './agent-bridge.service';
import {
  getTaskLifecycleService,
  type CreateTaskInput,
  type TransitionTaskInput,
  type TaskListFilter,
} from './task-lifecycle.service';
import {
  validateCreateTaskBody,
  validateTransitionBody,
  loadTaskEnvelope,
  parseJsonTextBody,
} from './task-lifecycle.middleware';
import { createLogger } from '../logger';

const logger = createLogger('a2a-task-routes');

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

interface A2ASuccessResponse<T> {
  success: true;
  data: T;
}

interface A2AErrorResponse {
  success: false;
  error: A2AError;
}

function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const response: A2ASuccessResponse<T> = { success: true, data };
  res.status(statusCode).json(response);
}

function sendError(res: Response, httpStatus: number, error: A2AError): void {
  const response: A2AErrorResponse = { success: false, error };
  res.status(httpStatus).json(response);
}

function extractBridgePrompt(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload;
  }

  if (Array.isArray(payload)) {
    for (const part of payload) {
      const prompt = extractBridgePrompt(part);
      if (prompt) return prompt;
    }
    return '';
  }

  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const record = payload as Record<string, unknown>;
  if (record.kind === 'text' && typeof record.text === 'string') {
    return record.text;
  }
  if (typeof record.task === 'string') {
    return record.task;
  }
  if (typeof record.prompt === 'string') {
    return record.prompt;
  }
  if (typeof record.content === 'string') {
    return record.content;
  }

  return '';
}

function extractBridgeIntent(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }

  const intent = (payload as Record<string, unknown>).intent;
  return typeof intent === 'string' && intent.trim() ? intent : undefined;
}

function dispatchTaskToBridgeIfOnline(task: TaskEnvelope): void {
  const assigneeId = task.assignee?.agent_id;
  if (!assigneeId) return;

  const bridge = getAgentBridgeService();
  if (!bridge.isAgentOnline(assigneeId)) {
    return;
  }

  const prompt = extractBridgePrompt(task.payload);
  const intent = extractBridgeIntent(task.payload);
  const delivered = bridge.sendToAgent(assigneeId, {
    type: 'task.assigned',
    taskId: task.id,
    prompt,
    ...(intent ? { intent } : {}),
    context: {
      source: 'a2a-rest',
      from: task.requester?.agent_id || 'unknown',
      workspace_id: task.workspace_id,
      thread_id: task.thread_id,
      trace_id: task.trace_id,
      connector: task.connector,
      payload: task.payload,
    },
  });

  if (delivered) {
    const connected = bridge.getAgent(assigneeId);
    if (connected) connected.status = 'working';
    logger.info({ taskId: task.id, assigneeId }, 'REST-created task dispatched to bridge-connected agent');
  } else {
    logger.warn({ taskId: task.id, assigneeId }, 'failed to dispatch REST-created task to bridge-connected agent');
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const taskLifecycleRouter = Router();

// All routes expect JSON bodies. Since the parent A2A mount may use
// express.text() for raw verification, we parse it back first.
taskLifecycleRouter.use(parseJsonTextBody);

// ---------------------------------------------------------------------------
// POST / -- Create a new task
// ---------------------------------------------------------------------------

taskLifecycleRouter.post(
  '/',
  validateCreateTaskBody,
  (req: Request, res: Response) => {
    try {
      const service = getTaskLifecycleService();
      const input: CreateTaskInput = {
        workspace_id: req.body.workspace_id,
        thread_id: req.body.thread_id,
        trace_id: req.body.trace_id,
        parent_id: req.body.parent_id,
        requester: req.body.requester,
        assignee: req.body.assignee,
        connector: req.body.connector,
        payload: req.body.payload,
        metadata: req.body.metadata,
        tags: req.body.tags,
      };

      const result = service.createTask(input);

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      // Bridge dispatch is best-effort — task creation should still succeed.
      try { dispatchTaskToBridgeIfOnline(result.data); } catch {}

      sendSuccess(res, result.data, 201);
    } catch (err) {
      logger.error({ err }, 'unhandled error in POST /api/a2a/tasks');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while creating task',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /:taskId/transition -- Transition task state
// ---------------------------------------------------------------------------

taskLifecycleRouter.patch(
  '/:taskId/transition',
  validateTransitionBody,
  (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const service = getTaskLifecycleService();

      const input: TransitionTaskInput = {
        target_state: req.body.target_state,
        reason: req.body.reason,
        triggered_by: req.body.triggered_by,
        result: req.body.result,
        error: req.body.error,
      };

      const result = service.transitionTask(taskId, input);

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      sendSuccess(res, result.data);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in PATCH /api/a2a/tasks/:taskId/transition');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while transitioning task',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:taskId -- Get task with full envelope
// ---------------------------------------------------------------------------

taskLifecycleRouter.get(
  '/:taskId',
  (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;

      // Guard against matching the literal string "undefined" or empty
      if (!taskId || taskId === 'undefined') {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.MissingEnvelopeField,
          message: 'taskId parameter is required',
        }));
        return;
      }

      const service = getTaskLifecycleService();
      const result = service.getTask(taskId);

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      sendSuccess(res, result.data);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in GET /api/a2a/tasks/:taskId');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while fetching task',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:taskId/history -- Get transition history
// ---------------------------------------------------------------------------

taskLifecycleRouter.get(
  '/:taskId/history',
  (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const service = getTaskLifecycleService();
      const result = service.getTaskHistory(taskId);

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      sendSuccess(res, {
        task_id: taskId,
        transitions: result.data,
        transition_count: result.data.length,
      });
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in GET /api/a2a/tasks/:taskId/history');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while fetching task history',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET / -- List tasks with optional filters
// ---------------------------------------------------------------------------

taskLifecycleRouter.get(
  '/',
  (req: Request, res: Response) => {
    try {
      const service = getTaskLifecycleService();

      const filter: TaskListFilter = {};
      if (typeof req.query.workspace_id === 'string') filter.workspace_id = req.query.workspace_id;
      if (typeof req.query.thread_id === 'string') filter.thread_id = req.query.thread_id;
      if (typeof req.query.state === 'string') filter.state = req.query.state as any;
      if (typeof req.query.assignee_agent_id === 'string') filter.assignee_agent_id = req.query.assignee_agent_id;
      if (typeof req.query.limit === 'string') {
        const parsed = parseInt(req.query.limit, 10);
        if (!isNaN(parsed) && parsed > 0) filter.limit = Math.min(parsed, 1000);
      }
      if (typeof req.query.offset === 'string') {
        const parsed = parseInt(req.query.offset, 10);
        if (!isNaN(parsed) && parsed >= 0) filter.offset = parsed;
      }

      const result = service.listTasks(filter);

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      sendSuccess(res, {
        tasks: result.data,
        count: result.data.length,
        filter,
      });
    } catch (err) {
      logger.error({ err }, 'unhandled error in GET /api/a2a/tasks');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while listing tasks',
      }));
    }
  },
);
