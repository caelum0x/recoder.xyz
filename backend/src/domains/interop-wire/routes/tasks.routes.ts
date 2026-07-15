/**
 * A2A task routes — owner-scoped reads over the task PROJECTION plus the shared
 * scratchpad / context bundle:
 *
 *   GET  /tasks/:id                 the task row + its message log
 *   POST /tasks/:id/cancel          cancel a task (mutating; fail-closed transition)
 *   GET  /tasks/:id/context         the compact context bundle (messages + notes)
 *   GET  /tasks/:id/scratchpad      the live scratchpad notes
 *   POST /tasks/:id/scratchpad      append a note (mutating)
 *
 * Owner (`userId`) comes from the resolved `Principal`. The canonical Run state of
 * record stays in agent-os; this is the A2A projection surface only.
 */
import { Router } from 'express';
import { ErrorCode, createError, sendError, sendSuccess, asyncHandler } from '../../../shared/errors.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { TaskLifecycleService } from '../dispatch/task-lifecycle.js';
import type { ContextBridgeService } from '../bridge/context-bridge.js';
import type { ScratchpadService } from '../bridge/scratchpad.js';

export interface TasksRouterDeps {
  readonly tasks: TaskLifecycleService;
  readonly contextBridge: ContextBridgeService;
  readonly scratchpad: ScratchpadService;
  readonly middleware: AuthMiddleware;
}

/** Build the `/api/interop/tasks` router. */
export function buildTasksRoutes(deps: TasksRouterDeps): Router {
  const router = Router();
  const { tasks, contextBridge, scratchpad, middleware } = deps;

  router.get(
    '/:id',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const task = await tasks.get(req.params.id, req.principal!.userId);
      if (!task) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'task not found'));
        return;
      }
      sendSuccess(res, { task, messages: await tasks.messages(req.params.id) });
    }),
  );

  router.post(
    '/:id/cancel',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const result = await tasks.cancel(req.params.id, req.principal!.userId);
      if (!result.ok) {
        const code = result.code === 'not_found' ? ErrorCode.NOT_FOUND : ErrorCode.VALIDATION_ERROR;
        sendError(res, createError(code, result.reason));
        return;
      }
      sendSuccess(res, { task: result.task });
    }),
  );

  router.get(
    '/:id/context',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const bundle = await contextBridge.build({ taskId: req.params.id, userId: req.principal!.userId });
      sendSuccess(res, { bundle });
    }),
  );

  router.get(
    '/:id/scratchpad',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      // Owner scope is enforced by requiring the task to be visible first.
      const task = await tasks.get(req.params.id, req.principal!.userId);
      if (!task) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'task not found'));
        return;
      }
      sendSuccess(res, { notes: await scratchpad.read(req.params.id) });
    }),
  );

  router.post(
    '/:id/scratchpad',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const task = await tasks.get(req.params.id, req.principal!.userId);
      if (!task) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'task not found'));
        return;
      }
      const body = asObject(req.body);
      const entry = await scratchpad.append({
        taskId: req.params.id,
        author: req.principal!.userId,
        note: requireString(body, 'note'),
        ...(typeof body.ttlMs === 'number' ? { ttlMs: body.ttlMs } : {}),
      });
      sendSuccess(res, { entry }, { statusCode: 201 });
    }),
  );

  return router;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'request body must be a JSON object');
  }
  return value as Record<string, unknown>;
}

function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw createError(ErrorCode.VALIDATION_ERROR, `\`${key}\` is required`);
  }
  return value;
}
