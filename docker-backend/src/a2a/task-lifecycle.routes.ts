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
 * | GET    | /:taskId/timeline             | Get unified task→artifact→pr→preview→approval timeline |
 * | GET    | /                             | List tasks with optional filters         |
 * | POST   | /:taskId/execute              | Execute a task via Pi/OpenCode agent     |
 * | POST   | /:taskId/pause                | Pause a running task pending PM approval |
 * | POST   | /:taskId/resume               | Resume a paused task after approval      |
 * | POST   | /:taskId/reject               | Reject (terminate) a task via PM decision|
 * | POST   | /:taskId/handoff              | Reassign a task to a new assignee        |
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
import { getRecentContext } from './memory-store';
import { buildTaskTimeline } from './task-timeline.service';
import { getApprovalGateService } from './approval-gate.service';

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

async function dispatchTaskToBridgeIfOnline(task: TaskEnvelope): Promise<void> {
  const assigneeId = task.assignee?.agent_id;
  if (!assigneeId) return;

  const bridge = getAgentBridgeService();
  if (!bridge.isAgentOnline(assigneeId)) {
    return;
  }

  const prompt = extractBridgePrompt(task.payload);
  const intent = extractBridgeIntent(task.payload);

  // Fetch agent's recent memory context before dispatch
  const connected = bridge.getAgent(assigneeId);
  const memoryContext = connected?.userId && prompt
    ? await getRecentContext({ query: prompt, userId: connected.userId })
    : [];

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
      ...(memoryContext.length > 0 ? { memoryContext } : {}),
    },
  });

  if (delivered) {
    if (connected) connected.status = 'working';
    logger.info({ taskId: task.id, assigneeId, memoryEntries: memoryContext.length }, 'REST-created task dispatched to bridge-connected agent');
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

      // Bridge dispatch is best-effort and async (memory lookup) — fire-and-forget.
      void dispatchTaskToBridgeIfOnline(result.data);

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
// GET /:taskId/timeline -- Unified task→artifact→pr→preview→approval timeline
// ---------------------------------------------------------------------------
// Read-only projection that surfaces the full product path for a task/run from
// existing history (lifecycle transitions, result artifacts, embedded PR /
// preview URLs, and approval-gate requests). No new storage is introduced.

taskLifecycleRouter.get(
  '/:taskId/timeline',
  (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;

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

      const approvals = getApprovalGateService().listForTask(result.data.workspace_id, result.data.id);
      const timeline = buildTaskTimeline(result.data, approvals);

      sendSuccess(res, timeline);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in GET /api/a2a/tasks/:taskId/timeline');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while building task timeline',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:taskId/claim -- Claim a task for exclusive processing by a session
// ---------------------------------------------------------------------------

taskLifecycleRouter.post(
  '/:taskId/claim',
  (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const { session_id, agent_id } = req.body ?? {};

      if (!session_id || typeof session_id !== 'string') {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.MissingEnvelopeField,
          message: 'session_id is required',
        }));
        return;
      }

      const service = getTaskLifecycleService();
      const result = service.claimTask(taskId, session_id, typeof agent_id === 'string' ? agent_id : 'unknown');

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      sendSuccess(res, result.data);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in POST /api/a2a/tasks/:taskId/claim');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while claiming task',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:taskId/pause -- Pause a running task pending PM approval
// ---------------------------------------------------------------------------

taskLifecycleRouter.post(
  '/:taskId/pause',
  (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const { reason, triggered_by, approval_id } = req.body ?? {};

      const service = getTaskLifecycleService();
      const result = service.pauseTask(taskId, {
        reason: typeof reason === 'string' ? reason : undefined,
        triggeredBy: typeof triggered_by === 'string' ? triggered_by : undefined,
        approvalId: typeof approval_id === 'string' ? approval_id : undefined,
      });

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      sendSuccess(res, result.data);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in POST /api/a2a/tasks/:taskId/pause');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while pausing task',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:taskId/resume -- Resume a paused task after PM approval
// ---------------------------------------------------------------------------

taskLifecycleRouter.post(
  '/:taskId/resume',
  (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const { reason, triggered_by } = req.body ?? {};

      const service = getTaskLifecycleService();
      const result = service.resumeTask(taskId, {
        reason: typeof reason === 'string' ? reason : undefined,
        triggeredBy: typeof triggered_by === 'string' ? triggered_by : undefined,
      });

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      sendSuccess(res, result.data);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in POST /api/a2a/tasks/:taskId/resume');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while resuming task',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:taskId/reject -- Reject (terminate) a task via PM decision
// ---------------------------------------------------------------------------

taskLifecycleRouter.post(
  '/:taskId/reject',
  (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const { reason, triggered_by, approval_id } = req.body ?? {};

      const service = getTaskLifecycleService();
      const result = service.rejectTask(taskId, {
        reason: typeof reason === 'string' ? reason : undefined,
        triggeredBy: typeof triggered_by === 'string' ? triggered_by : undefined,
        approvalId: typeof approval_id === 'string' ? approval_id : undefined,
      });

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      sendSuccess(res, result.data);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in POST /api/a2a/tasks/:taskId/reject');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while rejecting task',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:taskId/handoff -- Reassign a task to a new assignee
// ---------------------------------------------------------------------------
// Preserves task state, history, artifacts, and audit lineage while handing
// ownership to a new assignee. Body: { assignee: TaskAgentRef, reason?, triggered_by? }.

taskLifecycleRouter.post(
  '/:taskId/handoff',
  (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const { assignee, reason, triggered_by } = req.body ?? {};

      if (!assignee || typeof assignee !== 'object' ||
          typeof assignee.agent_id !== 'string' || typeof assignee.platform !== 'string') {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.MissingEnvelopeField,
          message: 'assignee.agent_id and assignee.platform are required for handoff',
        }));
        return;
      }

      const service = getTaskLifecycleService();
      const result = service.handoffTask(
        taskId,
        {
          agent_id: assignee.agent_id,
          platform: assignee.platform,
          name: typeof assignee.name === 'string' ? assignee.name : undefined,
          instance_id: typeof assignee.instance_id === 'string' ? assignee.instance_id : undefined,
        },
        {
          reason: typeof reason === 'string' ? reason : undefined,
          triggeredBy: typeof triggered_by === 'string' ? triggered_by : undefined,
        },
      );

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      sendSuccess(res, result.data);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in POST /api/a2a/tasks/:taskId/handoff');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while handing off task',
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

// ---------------------------------------------------------------------------
// POST /:taskId/execute -- Execute a task via Pi or OpenCode agent
// ---------------------------------------------------------------------------
// Takes a task that has a prompt in its payload and dispatches it to the
// coding agent. The agent creates/edits files in the Daytona sandbox and
// returns the result. The task is transitioned to "working" → "completed".

taskLifecycleRouter.post(
  '/:taskId/execute',
  async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const { project_id, sandbox_id } = req.body ?? {};

      if (!taskId || taskId === 'undefined') {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.MissingEnvelopeField,
          message: 'taskId parameter is required',
        }));
        return;
      }

      const service = getTaskLifecycleService();

      // Get the task
      const taskResult = service.getTask(taskId);
      if (!taskResult.ok) {
        sendError(res, taskResult.httpStatus, taskResult.error);
        return;
      }

      const task = taskResult.data;
      const payload = Array.isArray(task.payload) ? task.payload[0] : task.payload;
      const prompt = (payload as any)?.prompt || (payload as any)?.message || (payload as any)?.content;

      if (!prompt || typeof prompt !== 'string') {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.MissingEnvelopeField,
          message: 'Task payload must contain a prompt, message, or content field',
        }));
        return;
      }

      // Transition to working
      service.transitionTask(taskId, { target_state: 'working' as any, triggered_by: 'a2a-execute' });

      // Try Pi agent first, then OpenCode
      const targetProjectId = project_id || task.metadata?.project_id || taskId;
      let result: { success: boolean; text: string; filesChanged?: string[] } | undefined;

      if (sandbox_id) {
        try {
          const { promptPiSession } = await import('./pi-runtime-adapter.js');
          result = await promptPiSession(targetProjectId, sandbox_id, prompt);
        } catch {
          // Pi unavailable — try OpenCode
        }
      }

      if (!result) {
        try {
          const { handleOpencodeServicePrompt } = await import('./opencode-service-handler.js');
          const ocResult = await handleOpencodeServicePrompt({
            projectId: targetProjectId,
            prompt,
          });
          result = {
            success: ocResult.success,
            text: ocResult.text,
          };
        } catch {
          // OpenCode also unavailable
        }
      }

      if (!result) {
        service.transitionTask(taskId, { target_state: 'failed' as any, reason: 'No coding agent available' });
        sendError(res, 503, buildA2AError({
          code: A2AErrorCodeEnum.InternalError,
          message: 'No coding agent available to execute the task',
        }));
        return;
      }

      // Transition to completed or failed
      if (result.success) {
        service.transitionTask(taskId, { target_state: 'completed' as any, reason: result.text });
      } else {
        service.transitionTask(taskId, { target_state: 'failed' as any, reason: result.text });
      }

      sendSuccess(res, {
        task_id: taskId,
        success: result.success,
        text: result.text,
        files_changed: result.filesChanged || [],
      });
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in POST /api/a2a/tasks/:taskId/execute');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while executing task',
      }));
    }
  },
);
