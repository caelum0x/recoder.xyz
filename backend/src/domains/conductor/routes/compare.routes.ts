/**
 * Multi-agent compare HTTP edges (product F3) — read-only side-by-side of a
 * parallel-run group. Mounted onto the `/api/conductor` router:
 *
 *   GET /api/conductor/workspaces/compare?taskGroup=<id>   aggregate a group's siblings
 *   GET /api/conductor/workspaces/:id/siblings             the group a workspace belongs to
 *   GET /api/conductor/workspaces/compare/:taskGroup/pairwise       true line-level A-vs-B per-file diff (`?a=&b=&paths=`)
 *   GET /api/conductor/workspaces/compare/:taskGroup/converge-plan  step-2 per-file converge plan (read; `?probe=1` adds synthesizability)
 *   POST /api/conductor/workspaces/compare/:taskGroup/converge      step-2 compose (GATED workspace.branch)
 *
 * Read-only by contract: neither edge mutates, so there is NO governance gate
 * (unlike every conductor write). Both are authenticated reads that surface
 * truthful, degrade-safe aggregates — a missing group is an empty view, a missing
 * workspace is a 404, and an uncomputable per-sibling diff is an absent stat with
 * a reason (never a fabricated one).
 *
 * GROUP OWNERSHIP (recoder-kybr): these edges are keyed on a shared `taskGroup`
 * (NOT a single workspace id), so the single-id `requireWorkspaceAccess` guard the
 * `:id` routes carry does NOT cover them. Each group aggregation therefore threads
 * the caller's `principal` into the module so it folds ONLY the siblings the caller
 * may access (same createdBy/tenant + admin + solo fail-open semantics as the `:id`
 * guard, via `canAccessWorkspace`). A group the caller owns NO sibling of is a
 * no-oracle 404 (byte-identical to a genuinely-unknown group) — never a leak of
 * another tenant's parallel run, and a converge folds only the caller's worktrees.
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
import { requireWorkspaceAccess } from './workspace-access.js';

export interface CompareRouterDeps {
  readonly module: ConductorModule;
  readonly middleware: AuthMiddleware;
  /** Solo/desktop single-user mode (from `cfg.soloMode`); fails the ownership guard OPEN. */
  readonly soloMode?: boolean;
}

/** Build the read-only `/api/conductor` compare sub-router (mount BEFORE the main router). */
export function buildCompareRoutes(deps: CompareRouterDeps): Router {
  const router = Router();
  const { module, middleware } = deps;
  // Ownership guard for the `:id`-scoped sibling read (recoder-tf68).
  const access = requireWorkspaceAccess(module, { soloMode: deps.soloMode === true });

  // Aggregate every sibling of a parallel-run group the CALLER OWNS for side-by-side
  // review (recoder-kybr: the group is narrowed to the caller's own siblings). A
  // group the caller owns no sibling of is a no-oracle 404 — identical to a
  // genuinely-unknown group, so it never confirms another tenant's group exists.
  router.get(
    '/workspaces/compare',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const taskGroup = firstString(req.query.taskGroup);
      if (!taskGroup) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, '`taskGroup` query param is required'));
        return;
      }
      const compare = await module.compareTaskGroup(taskGroup, req.principal!);
      if (compare.count === 0) {
        // No accessible sibling ⇒ no-oracle 404 (byte-identical to a missing workspace).
        sendError(res, createError(ErrorCode.NOT_FOUND, 'workspace not found'));
        return;
      }
      sendSuccess(res, { compare });
    }),
  );

  // The compare view for the group a single workspace belongs to (its own
  // singleton set when ungrouped). A missing workspace is a truthful 404.
  router.get(
    '/workspaces/:id/siblings',
    middleware.authenticate,
    access,
    asyncHandler(async (req, res) => {
      // The `access` guard already proved the caller owns `:id`; the principal
      // additionally narrows the RETURNED group to the caller's own siblings
      // (recoder-kybr) — a foreign sibling of the same taskGroup never leaks in.
      const compare = await module.workspaceSiblings(req.params.id, req.principal!);
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
      // OPT-IN synthesizability probe (`?probe=1`): a read-only dry-run 3-way over the
      // contested paths. Off by default so the desktop's debounced plan poll never
      // pays for the probe unless it explicitly asks.
      const probe = isTruthyFlag(req.query.probe);
      // recoder-kybr: plan over ONLY the caller's own siblings of the group.
      const plan = await module.planConvergence(taskGroup, selection, { probe }, req.principal!);
      if (plan.siblingCount === 0) {
        // Caller owns no sibling of this group ⇒ no-oracle 404.
        sendError(res, createError(ErrorCode.NOT_FOUND, 'workspace not found'));
        return;
      }
      sendSuccess(res, { plan });
    }),
  );

  // Pairwise A/B line-level diff (BE-W8-PAIRWISE) — the TRUE per-file unified
  // diff of the SAME path across the TWO picked siblings' worktrees, the edge the
  // desktop PairwisePanel needs. Read-only, no gate (same as siblings/converge-plan).
  // recoder-kybr: the module resolves the group with the caller's principal and
  // requires BOTH `a` and `b` to be members of the caller-narrowed sibling set —
  // either missing ⇒ a no-oracle 404 byte-identical to an unknown workspace.
  router.get(
    '/workspaces/compare/:taskGroup/pairwise',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const taskGroup = req.params.taskGroup?.trim();
      if (!taskGroup) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, '`taskGroup` path param is required'));
        return;
      }
      const a = firstString(req.query.a);
      const b = firstString(req.query.b);
      if (!a || !b) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, '`a` and `b` workspace-id query params are required'));
        return;
      }
      const paths = parsePathsQuery(req.query.paths);
      const pairwise = await module.pairwiseDiff(taskGroup, a, b, paths, req.principal!);
      if (!pairwise) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'workspace not found'));
        return;
      }
      sendSuccess(res, { pairwise });
    }),
  );

  // N-up per-file versions (A4) — for ONE contested `path`, EACH sibling's version of
  // that file + the base version, so the desktop can render N columns of the SAME file
  // side by side. Read-only, no gate (same as siblings/pairwise/converge-plan).
  // recoder-kybr: the module resolves the group with the caller's principal, so a group
  // the caller owns no sibling of ⇒ a no-oracle 404 byte-identical to an unknown group.
  router.get(
    '/workspaces/compare/:taskGroup/file-versions',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const taskGroup = req.params.taskGroup?.trim();
      if (!taskGroup) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, '`taskGroup` path param is required'));
        return;
      }
      const relPath = firstString(req.query.path);
      if (!relPath) {
        sendError(res, createError(ErrorCode.VALIDATION_ERROR, '`path` query param is required'));
        return;
      }
      const fileVersions = await module.fileVersions(taskGroup, relPath, req.principal!);
      if (!fileVersions) {
        // Caller owns no sibling of this group ⇒ no-oracle 404.
        sendError(res, createError(ErrorCode.NOT_FOUND, 'workspace not found'));
        return;
      }
      sendSuccess(res, { fileVersions });
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
      // recoder-kybr: the plan (and the compose below) fold ONLY the caller's own
      // siblings — a group is keyed on taskGroup, so the `:id` guard cannot cover it.
      const plan = await module.planConvergence(taskGroup, selection, undefined, req.principal!);
      if (plan.siblingCount === 0) {
        // Caller owns no sibling of this group ⇒ no-oracle 404 (before any compose).
        sendError(res, createError(ErrorCode.NOT_FOUND, 'workspace not found'));
        return;
      }
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

/** Map the governed compose result onto the envelope (client-input ⇒ 400, deny ⇒ 403, fault ⇒ 503). */
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
  // A CLIENT-input failure (nothing to converge, or a path unresolvable — incl. a
  // `synthesize-conflict` surfaced by the 3-way merge) is a truthful 400 telling the
  // caller to re-pick, NOT a service fault (503) or a governance deny (403).
  if (result.code) {
    sendError(res, createError(ErrorCode.VALIDATION_ERROR, result.reason ?? 'convergence not resolvable'));
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

/** A query flag is ON only for an explicit truthy token (`1|true|yes|on`); absent/`0`/`false` ⇒ off. */
function isTruthyFlag(value: unknown): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
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

/**
 * Parse the optional `paths` query (a comma list) into a trimmed path array.
 * Absent/blank ⇒ `undefined` (the module defaults to the pair's shared files).
 */
function parsePathsQuery(value: unknown): readonly string[] | undefined {
  const raw = firstString(value);
  if (!raw) return undefined;
  const paths = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return paths.length > 0 ? paths : undefined;
}

/** First non-empty string from a query value (handles the `?k=a&k=b` array form). */
function firstString(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
}
