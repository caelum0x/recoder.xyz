/**
 * Repo-config + PR-status HTTP edges — a self-contained sub-router mounted onto
 * the `/api/conductor` router. It adds:
 *
 *   GET  /api/conductor/repo-setup-script?repoKey=…   read a repo's setup script
 *   PUT  /api/conductor/repo-setup-script             upsert a repo's setup script (GATED)
 *   GET  /api/conductor/workspaces/:id/pr-status       the workspace's PR status via gh
 *
 * Security posture mirrors `conductor.routes.ts`:
 *  - the read edges use `authenticate`; the write edge uses `authenticateMutating`
 *    (a real, non-anonymous principal), and the ACTOR is the resolved `Principal`,
 *    never the request body;
 *  - the setup-script write goes through {@link RepoSetupService.setScript}, which
 *    runs the governance gate BEFORE the mutation — a deny is a truthful 403, never
 *    a faked 200;
 *  - PR-status is degrade-truthful: no gh / no PR is a 200 with `available`/`hasPr`
 *    false, never an error.
 */
import { Router } from 'express';
import {
  ErrorCode,
  createError,
  sendError,
  sendSuccess,
  asyncHandler,
} from '../../../shared/errors.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { ConductorModule } from '../index.js';
import type { ConductorWriteResult } from '../conductor-module.js';
import type { RepoSetupService } from '../services/repo-setup.service.js';
import type { PrStatusService } from '../services/pr-status.service.js';

export interface RepoConfigRouterDeps {
  readonly module: ConductorModule;
  readonly middleware: AuthMiddleware;
  readonly repoSetup: RepoSetupService;
  readonly prStatus: PrStatusService;
}

/** Build the repo-config + pr-status sub-router (mount under `/api/conductor`). */
export function buildRepoConfigRoutes(deps: RepoConfigRouterDeps): Router {
  const router = Router();
  const { module, middleware, repoSetup, prStatus } = deps;

  // --- per-repo setup script -------------------------------------------------

  // Read a repo's configured setup script (null `config` when none is set).
  router.get(
    '/repo-setup-script',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const repoKey = requireQueryString(req.query.repoKey, 'repoKey');
      sendSuccess(res, { config: await repoSetup.getScript(repoKey) });
    })
  );

  // Upsert a repo's setup script — GATED (`workspace.repo_setup`). An empty
  // string clears the script; a deny is a truthful 403.
  router.put(
    '/repo-setup-script',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const repoKey = requireString(body, 'repoKey');
      const script = requireStringField(body, 'script'); // '' allowed (clears)
      const result = await repoSetup.setScript(repoKey, script, req.principal!);
      finishWrite(res, result, { key: 'config' });
    })
  );

  // --- pull-request status ---------------------------------------------------

  // The workspace's PR status via the `gh` CLI. Degrade-truthful: no gh / no PR
  // is a 200 with `available`/`hasPr` false (never an error). A missing
  // workspace is a truthful 404.
  router.get(
    '/workspaces/:id/pr-status',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const workspace = await module.getWorkspace(req.params.id);
      if (!workspace) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'workspace not found'));
        return;
      }
      sendSuccess(res, await prStatus.status(workspace));
    })
  );

  return router;
}

/** Map a governed write result onto the response envelope (deny ⇒ truthful 403). */
function finishWrite<T>(
  res: import('express').Response,
  result: ConductorWriteResult<T>,
  opts: { key: string; statusCode?: number }
): void {
  if (result.ok) {
    sendSuccess(
      res,
      { [opts.key]: result.value ?? null, verdict: verdictView(result) },
      {
        ...(opts.statusCode ? { statusCode: opts.statusCode } : {}),
      }
    );
    return;
  }
  if (result.verdict.effect === 'allow') {
    sendError(
      res,
      createError(
        ErrorCode.SERVICE_UNAVAILABLE,
        result.reason ?? 'operation failed'
      )
    );
    return;
  }
  sendError(
    res,
    createError(
      ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
      result.reason ?? 'blocked by governance gate'
    )
  );
}

function verdictView<T>(
  result: ConductorWriteResult<T>
): Record<string, unknown> {
  const v = result.verdict;
  return {
    effect: v.effect,
    tier: v.tier,
    degraded: v.degraded,
    engine: v.engine,
  };
}

// --- validation helpers (fail-fast, uniform error envelope) ------------------

function asObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      'request body must be a JSON object'
    );
  }
  return value as Record<string, unknown>;
}

/** Require a non-empty string field (used for `repoKey`). */
function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw createError(ErrorCode.VALIDATION_ERROR, `\`${key}\` is required`);
  }
  return value;
}

/** Require a string field that MAY be empty (used for `script`: '' clears it). */
function requireStringField(
  body: Record<string, unknown>,
  key: string
): string {
  const value = body[key];
  if (typeof value !== 'string') {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      `\`${key}\` must be a string`
    );
  }
  return value;
}

/** Require a non-empty query-string param (arrays take their first element). */
function requireQueryString(raw: unknown, key: string): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.length === 0) {
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      `\`${key}\` query param is required`
    );
  }
  return value;
}
