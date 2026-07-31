/**
 * Conductor checkpoint HTTP edges — the snapshot/restore surface, mounted onto
 * the same `/api/conductor` router as the rest of the conductor edges:
 *
 *   POST /api/conductor/workspaces/:id/checkpoints              create a snapshot (GATED)
 *   GET  /api/conductor/workspaces/:id/checkpoints              list snapshots
 *   POST /api/conductor/workspaces/:id/checkpoints/:cid/restore restore to a snapshot (GATED)
 *   POST /api/conductor/workspaces/:id/checkpoints/:cid/branch  branch a NEW workspace (GATED)
 *
 * Security posture (identical to `conductor.routes.ts`): writes use
 * `authenticateMutating` (a real, non-anonymous principal — the ACTOR is the
 * resolved `Principal`, never the body); every write passes the module's
 * governance gate BEFORE the mutation, so a deny is a truthful 403, never a faked
 * 200. Bodies are validated fail-fast with the uniform `sendError` envelope.
 *
 * INTEGRATION: this router is mounted by `buildConductorRoutes` — see the
 * one-line mount in `conductor.routes.ts`. It carries the FULL paths (relative to
 * the `/api/conductor` base) so it composes without a nested base path.
 */
import { Router } from 'express';
import { ErrorCode, createError, sendError, sendSuccess, asyncHandler } from '../../../shared/errors.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { ConductorModule } from '../index.js';
import type { ConductorWriteResult } from '../conductor-module.js';
import { requireWorkspaceAccess } from './workspace-access.js';

export interface CheckpointRouterDeps {
  readonly module: ConductorModule;
  readonly middleware: AuthMiddleware;
  /** Solo/desktop single-user mode (from `cfg.soloMode`); fails the ownership guard OPEN. */
  readonly soloMode?: boolean;
}

/** Build the checkpoint sub-router (mounted into the `/api/conductor` router). */
export function buildCheckpointRoutes(deps: CheckpointRouterDeps): Router {
  const router = Router();
  const { module, middleware } = deps;
  // Ownership guard for every `:id`-scoped checkpoint edge (recoder-tf68). Keyed on
  // the workspace `:id`; the checkpoint `:cid` is scoped under an owned workspace.
  const access = requireWorkspaceAccess(module, { soloMode: deps.soloMode === true });

  // --- read: list a workspace's checkpoints (newest-first) --------------------
  router.get(
    '/workspaces/:id/checkpoints',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      const checkpoints = await module.listWorkspaceCheckpoints(req.params.id);
      sendSuccess(res, { checkpoints });
    }),
  );

  // --- write: capture a checkpoint (GATED) ------------------------------------
  router.post(
    '/workspaces/:id/checkpoints',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const result = await module.checkpointWorkspace(
        req.params.id,
        {
          ...(typeof body.label === 'string' ? { label: body.label } : {}),
          ...(typeof body.description === 'string' ? { description: body.description } : {}),
        },
        req.principal!,
      );
      finishWrite(res, result, { statusCode: 201, key: 'checkpoint' });
    }),
  );

  // --- write: restore a workspace to a checkpoint (GATED) ---------------------
  router.post(
    '/workspaces/:id/checkpoints/:cid/restore',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const result = await module.restoreCheckpoint(req.params.id, req.params.cid, req.principal!);
      finishWrite(res, result, { key: 'restore' });
    }),
  );

  // --- write: branch a NEW workspace from a checkpoint (GATED) -----------------
  router.post(
    '/workspaces/:id/checkpoints/:cid/branch',
    middleware.authenticateMutating,
    access,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const result = await module.branchFromCheckpoint(
        req.params.id,
        req.params.cid,
        {
          ...(typeof body.branch === 'string' ? { branch: body.branch } : {}),
          ...(typeof body.runtimeId === 'string' ? { runtimeId: body.runtimeId } : {}),
          ...(typeof body.taskId === 'string' ? { taskId: body.taskId } : {}),
          ...(typeof body.prompt === 'string' ? { prompt: body.prompt } : {}),
        },
        req.principal!,
      );
      finishWrite(res, result, { statusCode: 201, key: 'workspace' });
    }),
  );

  return router;
}

/** Map a governed write result onto the response envelope (deny ⇒ truthful 403). */
function finishWrite<T>(
  res: import('express').Response,
  result: ConductorWriteResult<T>,
  opts: { key: string; statusCode?: number },
): void {
  if (result.ok) {
    sendSuccess(
      res,
      { [opts.key]: result.value ?? null, verdict: verdictView(result) },
      { ...(opts.statusCode ? { statusCode: opts.statusCode } : {}) },
    );
    return;
  }
  if (result.verdict.effect === 'allow') {
    // Gate allowed but execution could not complete — truthful 503, not a fake 200.
    sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, result.reason ?? 'operation failed'));
    return;
  }
  sendError(
    res,
    createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, result.reason ?? 'blocked by governance gate'),
  );
}

function verdictView<T>(result: ConductorWriteResult<T>): Record<string, unknown> {
  const v = result.verdict;
  return { effect: v.effect, tier: v.tier, degraded: v.degraded, engine: v.engine };
}

function asObject(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'request body must be a JSON object');
  }
  return value as Record<string, unknown>;
}
