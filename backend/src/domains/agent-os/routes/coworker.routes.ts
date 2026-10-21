/**
 * Coworker routes — the HTTP edges for the Recoder Coworker (an AI teammate
 * that proposes one action at a time behind a one-click approval gate).
 *
 * Mounted under `/api/agent-os` (same base as the rest of the control-plane
 * state — approvals, work locks, tasks) so paths resolve to:
 *   POST   /api/agent-os/coworker/tasks                            start a task
 *   GET    /api/agent-os/coworker/tasks                            list tasks
 *   GET    /api/agent-os/coworker/tasks/:id                        fetch one task
 *   POST   /api/agent-os/coworker/tasks/:id/actions/:actionId/decide  approve/deny
 *   POST   /api/agent-os/coworker/tasks/:id/cancel                 stop a task
 *
 * Security posture mirrors `governance-approvals.routes.ts` exactly (same
 * reused helpers): the actor is bound to the authenticated `Principal`, never
 * trusted from the body; a non-privileged caller only sees/acts on its OWN
 * tasks; a foreign task is a no-oracle 404.
 */
import { Router } from 'express';
import { ErrorCode, createError, sendError, sendSuccess, asyncHandler } from '../../../shared/errors.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../../identity/types.js';
import { canDecideApproval, resolveOwnerScope } from '../../governance/routes/governance-access.js';
import type { CoworkerService, CoworkerTaskRecord } from '../services/coworker.service.js';

export interface CoworkerRouterDeps {
  readonly coworker: CoworkerService;
  readonly middleware: AuthMiddleware;
  readonly soloMode?: boolean;
}

export function buildCoworkerRouter(deps: CoworkerRouterDeps): Router {
  const router = Router();
  const { coworker, middleware } = deps;
  const access = { soloMode: deps.soloMode === true };

  router.post(
    '/coworker/tasks',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const goal = requireString(body, 'goal');
      const task = await coworker.createTask({ goal, actorId: req.principal!.userId });
      sendSuccess(res, { task }, { statusCode: 201 });
    }),
  );

  router.get(
    '/coworker/tasks',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const actorId = resolveOwnerScope(
        req.principal!,
        typeof req.query.actorId === 'string' ? req.query.actorId : undefined,
        access,
      );
      const tasks = coworker.listTasks(actorId);
      sendSuccess(res, { tasks });
    }),
  );

  router.get(
    '/coworker/tasks/:id',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const task = coworker.getTask(req.params.id);
      if (!task || !ownsTask(req.principal!, task, access)) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'coworker task not found'));
        return;
      }
      sendSuccess(res, { task });
    }),
  );

  router.post(
    '/coworker/tasks/:id/actions/:actionId/decide',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const task = coworker.getTask(req.params.id);
      if (!task || !ownsTask(req.principal!, task, access)) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'coworker task not found'));
        return;
      }
      const body = asObject(req.body);
      const decision = requireDecision(body);
      try {
        const updated = await coworker.decideAction({
          taskId: task.id,
          actionId: req.params.actionId,
          decision,
          decidedBy: req.principal!.userId,
          reason: optionalString(body, 'reason'),
        });
        sendSuccess(res, { task: updated });
      } catch (err) {
        sendError(res, createError(ErrorCode.INVALID_INPUT, errorMessage(err)));
      }
    }),
  );

  router.post(
    '/coworker/tasks/:id/cancel',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const task = coworker.getTask(req.params.id);
      if (!task || !ownsTask(req.principal!, task, access)) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'coworker task not found'));
        return;
      }
      const updated = await coworker.cancelTask(task.id);
      sendSuccess(res, { task: updated });
    }),
  );

  return router;
}

function ownsTask(principal: Principal, task: CoworkerTaskRecord, access: { soloMode: boolean }): boolean {
  return canDecideApproval(principal, { requestedBy: task.actorId }, access);
}

function asObject(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

function requireString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createError(ErrorCode.MISSING_REQUIRED_FIELD, `"${field}" is required`);
  }
  return value;
}

function optionalString(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function requireDecision(body: Record<string, unknown>): 'approved' | 'denied' {
  const value = body.decision;
  if (value !== 'approved' && value !== 'denied') {
    throw createError(ErrorCode.INVALID_INPUT, `"decision" must be 'approved' or 'denied'`);
  }
  return value;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
