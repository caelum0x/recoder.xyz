/**
 * Multi-agent compare HTTP edges (product F3) — read-only side-by-side of a
 * parallel-run group. Mounted onto the `/api/conductor` router:
 *
 *   GET /api/conductor/workspaces/compare?taskGroup=<id>   aggregate a group's siblings
 *   GET /api/conductor/workspaces/:id/siblings             the group a workspace belongs to
 *
 * Read-only by contract: neither edge mutates, so there is NO governance gate
 * (unlike every conductor write). Both are authenticated reads that surface
 * truthful, degrade-safe aggregates — a missing group is an empty view, a missing
 * workspace is a 404, and an uncomputable per-sibling diff is an absent stat with
 * a reason (never a fabricated one).
 *
 * MOUNT ORDER (critical): this router MUST be mounted BEFORE `buildConductorRoutes`
 * so `GET /workspaces/compare` resolves here and never falls through to the main
 * router's `GET /workspaces/:id` (which would read a workspace literally named
 * "compare"). See `ConductorComposer.routes()`.
 */
import { Router } from 'express';
import { ErrorCode, createError, sendError, sendSuccess, asyncHandler } from '../../../shared/errors.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { ConductorModule } from '../index.js';

export interface CompareRouterDeps {
  readonly module: ConductorModule;
  readonly middleware: AuthMiddleware;
}

/** Build the read-only `/api/conductor` compare sub-router (mount BEFORE the main router). */
export function buildCompareRoutes(deps: CompareRouterDeps): Router {
  const router = Router();
  const { module, middleware } = deps;

  // Aggregate every sibling of a parallel-run group for side-by-side review.
  // A blank/absent `taskGroup` is a truthful empty view (never an error).
  router.get(
    '/workspaces/compare',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const taskGroup = firstString(req.query.taskGroup);
      if (!taskGroup) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, '`taskGroup` query param is required'));
        return;
      }
      sendSuccess(res, { compare: await module.compareTaskGroup(taskGroup) });
    }),
  );

  // The compare view for the group a single workspace belongs to (its own
  // singleton set when ungrouped). A missing workspace is a truthful 404.
  router.get(
    '/workspaces/:id/siblings',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const compare = await module.workspaceSiblings(req.params.id);
      if (!compare) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'workspace not found'));
        return;
      }
      sendSuccess(res, { compare });
    }),
  );

  return router;
}

/** First non-empty string from a query value (handles the `?k=a&k=b` array form). */
function firstString(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
}
