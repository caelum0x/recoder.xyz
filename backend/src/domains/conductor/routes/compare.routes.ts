/**
 * Multi-agent compare HTTP edges (product F3) — read-only side-by-side of a
 * parallel-run group. Mounted onto the `/api/conductor` router:
 *
 *   GET /api/conductor/workspaces/compare?taskGroup=<id>   aggregate a group's siblings
 *   GET /api/conductor/workspaces/:id/siblings             the group a workspace belongs to
 *   GET /api/conductor/workspaces/compare/:taskGroup/converge-plan  step-2 per-file converge plan (read)
 *   POST /api/conductor/workspaces/compare/:taskGroup/converge      step-2 compose (GATED workspace.branch)
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
import type { ConductorWriteResult } from '../conductor-module.js';

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

  // Arrange the parallel-run group's worktree-bound operator grid (GATED
  // `workspace.grid`). Unlike the two reads above this MUTATES the shared tmux
  // server (a dedicated `recoder-group-<taskGroup>` session), so it uses
  // `authenticateMutating` + the module's governance gate. Degrade-truthful: dmux
  // absent / <2 real worktrees ⇒ a 200 with `grid:null` (no honest grid to build).
  router.post(
    '/workspaces/compare/:taskGroup/grid',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const taskGroup = req.params.taskGroup?.trim();
      if (!taskGroup) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, '`taskGroup` path param is required'));
        return;
      }
      const result = await module.arrangeCompareGrid(taskGroup, req.principal!);
      finishGridWrite(res, result);
    }),
  );

  // Convergence PLAN (product step 2) — the read-only fold of the group's N sibling
  // diffs + an optional per-contested-file selection into a resolved file→source
  // map. No gate (pure read). Call with no `selection` to see the contested/
  // unresolved set; call with a selection to confirm a compose-ready (`complete`)
  // plan. A malformed `selection` is a truthful 400 (never silently ignored).
  router.get(
    '/workspaces/compare/:taskGroup/converge-plan',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const taskGroup = req.params.taskGroup?.trim();
      if (!taskGroup) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, '`taskGroup` path param is required'));
        return;
      }
      const selection = parseSelectionQuery(req.query.selection);
      if (selection === null) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, '`selection` must be a JSON object of path→workspaceId'));
        return;
      }
      sendSuccess(res, { plan: await module.planConvergence(taskGroup, selection) });
    }),
  );

  // Convergence COMPOSE (product step 2 → 3) — GATED (`workspace.branch`).
  // Pre-validates the plan (a group with <2 candidates, no changed files, or any
  // UNRESOLVED contested path is a truthful 400 with the offending paths — a user
  // selection error, NOT a server fault), then materializes the complete plan into
  // a new convergence workspace via the module's governed op.
  router.post(
    '/workspaces/compare/:taskGroup/converge',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const taskGroup = req.params.taskGroup?.trim();
      if (!taskGroup) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, '`taskGroup` path param is required'));
        return;
      }
      const body = asObject(req.body);
      const selection = parseSelectionValue(body.selection);
      if (selection === null) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, '`selection` must be an object of path→workspaceId'));
        return;
      }

      // Pre-validate as a READ so a bad selection is a 400 (not a governance/service
      // error). `complete` requires ≥1 winning file AND no unresolved contested path.
      const plan = await module.planConvergence(taskGroup, selection);
      if (plan.siblingCount < 2) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, `convergence needs ≥2 candidate workspaces (found ${plan.siblingCount})`));
        return;
      }
      if (!plan.complete) {
        sendError(
          res,
          createError(
            ErrorCode.VALIDATION_ERROR,
            plan.files.length === 0 && plan.unresolved.length === 0
              ? 'no changed files to converge'
              : `unresolved contested path(s): ${plan.unresolved.map((u) => u.path).join(', ')}`,
          ),
        );
        return;
      }

      const branch = typeof body.branch === 'string' ? body.branch.trim() : undefined;
      // Guard the caller-supplied branch name (a user error ⇒ 400, not a 503 from
      // deep in the git op): no leading `-`, git-safe charset, no `..`.
      if (branch && (branch.startsWith('-') || branch.includes('..') || !/^[A-Za-z0-9._/-]+$/.test(branch))) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, '`branch` is not a valid branch name'));
        return;
      }
      const result = await module.composeConvergence(
        { taskGroup, selection, ...(branch ? { branch } : {}), createdBy: req.principal!.userId },
        req.principal!,
      );
      finishConvergeWrite(res, result);
    }),
  );

  return router;
}

/** Map the governed compose result onto the response envelope (deny ⇒ 403, fault ⇒ 503). */
function finishConvergeWrite<T>(res: import('express').Response, result: ConductorWriteResult<T>): void {
  if (result.ok) {
    sendSuccess(res, {
      convergence: result.value,
      verdict: {
        effect: result.verdict.effect,
        tier: result.verdict.tier,
        degraded: result.verdict.degraded,
        engine: result.verdict.engine,
      },
    });
    return;
  }
  if (result.verdict.effect === 'allow') {
    sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, result.reason ?? 'convergence compose failed'));
    return;
  }
  sendError(
    res,
    createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, result.reason ?? 'blocked by governance gate'),
  );
}

/**
 * Parse a `selection` query param (the `GET …/converge-plan` optional JSON) into a
 * path→workspaceId record. Absent ⇒ `{}` (a valid empty selection); a present but
 * malformed value ⇒ `null` (the route maps to 400).
 */
function parseSelectionQuery(value: unknown): Readonly<Record<string, string>> | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null || raw === '') return {};
  if (typeof raw !== 'string') return null;
  try {
    return parseSelectionValue(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Narrow an arbitrary value into a path→workspaceId record (`{}` for absent, `null` for malformed). */
function parseSelectionValue(value: unknown): Readonly<Record<string, string>> | null {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (typeof val !== 'string') return null;
    out[key] = val;
  }
  return out;
}

/** Coerce a request body into a plain object (never throws). */
function asObject(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

/** Map the governed grid-arrange result onto the response envelope (deny ⇒ 403). */
function finishGridWrite<T>(res: import('express').Response, result: ConductorWriteResult<T>): void {
  if (result.ok) {
    sendSuccess(res, {
      grid: result.value ?? null,
      verdict: {
        effect: result.verdict.effect,
        tier: result.verdict.tier,
        degraded: result.verdict.degraded,
        engine: result.verdict.engine,
      },
    });
    return;
  }
  if (result.verdict.effect === 'allow') {
    sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, result.reason ?? 'grid arrange failed'));
    return;
  }
  sendError(
    res,
    createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, result.reason ?? 'blocked by governance gate'),
  );
}

/** First non-empty string from a query value (handles the `?k=a&k=b` array form). */
function firstString(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
}
