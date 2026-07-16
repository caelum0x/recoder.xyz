/**
 * Conductor HTTP edges — the `/api/conductor` router (mount base from
 * `DOMAIN_REGISTRY.conductor`). The terminal product's control-plane surface:
 *
 *   GET    /api/conductor/workspaces              list workspace records
 *   GET    /api/conductor/workspaces/:id          fetch one workspace
 *   POST   /api/conductor/workspaces              create + launch (GATED)
 *   POST   /api/conductor/workspaces/:id/steer    send-keys to a live agent (GATED)
 *   GET    /api/conductor/substrates              truthful per-substrate availability
 *   GET    /api/conductor/runtimes                installed agent CLIs (PATH-probed)
 *   GET    /api/conductor/github/status           GitHub connection + identity (token-free)
 *   GET    /api/conductor/health                  conductor readiness summary
 *   GET    /api/conductor/reconcile/findings      reconcile findings (operator review)
 *   POST   /api/conductor/reconcile               run a reconcile pass (GATED)
 *
 * Security posture:
 *  - Mutating routes use `authenticateMutating` (a real, non-anonymous principal);
 *    the ACTOR is taken from the resolved `Principal`, never the request body.
 *  - Every write goes through the module, which runs the governance gate BEFORE
 *    the mutation. A gate deny is a truthful 403 (`AUTHZ_PROJECT_ACCESS_DENIED`
 *    with the verdict reason), never a faked 200.
 *  - Bodies validated fail-fast with the uniform `sendError` envelope.
 */
import { Router } from 'express';
import { runtimeAvailability } from '@recoder/substrate';
import { ErrorCode, createError, sendError, sendSuccess, asyncHandler } from '../../../shared/errors.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { WorkspaceSubstrate } from '@recoder/agent-os';
import type { ConductorModule } from '../index.js';
import type { CreateConductorWorkspaceInput, ConductorWriteResult } from '../conductor-module.js';

export interface ConductorRouterDeps {
  readonly module: ConductorModule;
  readonly middleware: AuthMiddleware;
}

const SUBSTRATES: readonly WorkspaceSubstrate[] = ['tmux_worktree', 'daytona', 'in_process', 'ssh'];

/** Build the `/api/conductor` router. */
export function buildConductorRoutes(deps: ConductorRouterDeps): Router {
  const router = Router();
  const { module, middleware } = deps;

  // --- reads -----------------------------------------------------------------

  router.get(
    '/workspaces',
    middleware.authenticate,
    asyncHandler(async (_req, res) => {
      sendSuccess(res, { workspaces: await module.listWorkspaces() });
    }),
  );

  router.get(
    '/workspaces/:id',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const workspace = await module.getWorkspace(req.params.id);
      if (!workspace) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'workspace not found'));
        return;
      }
      sendSuccess(res, { workspace });
    }),
  );

  router.get(
    '/substrates',
    middleware.authenticate,
    asyncHandler(async (_req, res) => {
      sendSuccess(res, { substrates: module.substrates() });
    }),
  );

  // Installed agent CLIs (claude/codex/…) — a fresh PATH probe per request so the
  // cockpit's "N agents ready" is truthful, never a cached assumption.
  router.get(
    '/runtimes',
    middleware.authenticate,
    asyncHandler(async (_req, res) => {
      sendSuccess(res, { runtimes: await runtimeAvailability() });
    }),
  );

  // GitHub connection + detected identity for zero-config onboarding. TOKEN-FREE
  // by contract: only { connected, source, account? } — never a token value.
  router.get(
    '/github/status',
    middleware.authenticate,
    asyncHandler(async (_req, res) => {
      sendSuccess(res, await module.githubStatus());
    }),
  );

  // Conductor readiness summary the cockpit polls: can work be launched here.
  router.get(
    '/health',
    middleware.authenticate,
    asyncHandler(async (_req, res) => {
      const substrates = module.substrates();
      const tmux = substrates.find((s) => s.id === 'tmux_worktree');
      const available = substrates.some((s) => s.available);
      sendSuccess(res, {
        available,
        tmux: tmux?.available === true,
        ...(available ? {} : { reason: tmux?.reason ?? 'no substrate available' }),
      });
    }),
  );

  router.get(
    '/reconcile/findings',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const workspaceId = optionalString(req.query.workspaceId);
      sendSuccess(res, { findings: await module.listReconcileFindings(workspaceId) });
    }),
  );

  // --- writes (gated) --------------------------------------------------------

  router.post(
    '/workspaces',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const input: CreateConductorWorkspaceInput = {
        spaceId: requireString(body, 'spaceId'),
        projectId: requireString(body, 'projectId'),
        taskId: requireString(body, 'taskId'),
        repoPath: requireString(body, 'repoPath'),
        runtimeId: requireString(body, 'runtimeId'),
        ...(isSubstrate(body.substrate) ? { substrate: body.substrate } : {}),
        ...(typeof body.prompt === 'string' ? { prompt: body.prompt } : {}),
        ...(typeof body.command === 'string' ? { command: body.command } : {}),
        ...(typeof body.model === 'string' ? { model: body.model } : {}),
        ...(typeof body.branch === 'string' ? { branch: body.branch } : {}),
        ...(typeof body.baseRef === 'string' ? { baseRef: body.baseRef } : {}),
        ...(typeof body.interactive === 'boolean' ? { interactive: body.interactive } : {}),
      };
      const result = await module.createWorkspace(input, req.principal!);
      finishWrite(res, result, { statusCode: 201, key: 'workspace' });
    }),
  );

  router.post(
    '/workspaces/:id/steer',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const result = await module.steerWorkspace(
        {
          workspaceId: req.params.id,
          keys: requireString(body, 'keys'),
          ...(typeof body.submit === 'boolean' ? { submit: body.submit } : {}),
        },
        req.principal!,
      );
      finishWrite(res, result, { key: 'steered' });
    }),
  );

  router.post(
    '/reconcile',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const result = await module.reconcile(req.principal!);
      finishWrite(res, result, { key: 'report' });
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
    sendSuccess(res, { [opts.key]: result.value ?? null, verdict: verdictView(result) }, {
      ...(opts.statusCode ? { statusCode: opts.statusCode } : {}),
    });
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

// --- validation helpers (fail-fast, uniform error envelope) ------------------

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

function optionalString(value: unknown): string | undefined {
  if (Array.isArray(value)) value = value[0];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isSubstrate(value: unknown): value is WorkspaceSubstrate {
  return typeof value === 'string' && (SUBSTRATES as readonly string[]).includes(value);
}
