/**
 * Conductor board search / filter / archived-history edges — an ADDITIVE router
 * that layers query-aware reads over the base `/api/conductor` surface:
 *
 *   GET /api/conductor/workspaces?q=&repo=&agent=&state=&archived=<bool>
 *                                          record list narrowed by the board filters
 *   GET /api/conductor/workspaces/archived archived history (most-recent-first)
 *
 * Read-only by construction: both routes are plain `authenticate` reads that
 * delegate to the module's pure query methods — no gate, no audit, no mutation.
 * An empty match is a truthful empty list, never a fabricated set.
 *
 * INTEGRATION: this router must be mounted BEFORE {@link buildConductorRoutes} at
 * the SAME base so its query-aware `GET /workspaces` shadows the plain list handler
 * (behavior-preserving: with no filters it returns every record) and its literal
 * `GET /workspaces/archived` resolves before the base `GET /workspaces/:id`.
 * See the reported mountLine.
 */
import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../../../shared/errors.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { WorkspaceState } from '@recoder/agent-os';
import type { ConductorModule } from '../index.js';
import {
  parseArchivedParam,
  type WorkspaceQueryFilters,
} from '../services/workspace-query.service.js';
import {
  filterAccessibleWorkspaces,
  type WorkspaceAccessOptions,
} from './workspace-access.js';

export interface WorkspaceQueryRouterDeps {
  readonly module: ConductorModule;
  readonly middleware: AuthMiddleware;
  /**
   * Solo/desktop single-user mode (from `cfg.soloMode`). When true the list is NOT
   * narrowed by ownership (one local owner). Cloud leaves it false, so the board
   * returns ONLY the caller's own workspaces (recoder-tf68).
   */
  readonly soloMode?: boolean;
}

/** Every canonical workspace state — the validation surface for the `state=` filter. */
const WORKSPACE_STATES: readonly WorkspaceState[] = [
  'created',
  'setting_up',
  'ready',
  'running',
  'awaiting_approval',
  'awaiting_review',
  'changes_requested',
  'merging',
  'merged',
  'failed',
  'cancelled',
  'archived',
];

function isWorkspaceState(value: unknown): value is WorkspaceState {
  return typeof value === 'string' && (WORKSPACE_STATES as readonly string[]).includes(value);
}

/** First value of a possibly-repeated query param, trimmed to a non-empty string or undefined. */
function firstString(raw: unknown): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Build the board filters from the request query (unknown `state` values are ignored, not errored). */
function filtersFromQuery(query: Record<string, unknown>): WorkspaceQueryFilters {
  const stateRaw = firstString(query.state);
  return {
    ...(firstString(query.q) ? { q: firstString(query.q) } : {}),
    ...(firstString(query.repo) ? { repo: firstString(query.repo) } : {}),
    ...(firstString(query.agent) ? { agent: firstString(query.agent) } : {}),
    ...(isWorkspaceState(stateRaw) ? { state: stateRaw } : {}),
    ...(parseArchivedParam(query.archived) !== undefined
      ? { archived: parseArchivedParam(query.archived) }
      : {}),
  };
}

/** Build the additive board-query router (mount before {@link buildConductorRoutes}). */
export function buildWorkspaceQueryRoutes(deps: WorkspaceQueryRouterDeps): Router {
  const router = Router();
  const { module, middleware } = deps;
  // Ownership scoping for the board list edges (recoder-tf68): a caller sees ONLY
  // their own workspaces (privileged/solo callers see all).
  const accessOpts: WorkspaceAccessOptions = { soloMode: deps.soloMode === true };

  // Archived history — literal path, registered before the query-aware list so a
  // request for `/workspaces/archived` never falls through to `/workspaces/:id`.
  router.get(
    '/workspaces/archived',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const workspaces = await module.listArchivedWorkspaces();
      sendSuccess(res, {
        workspaces: filterAccessibleWorkspaces(workspaces, req.principal!, accessOpts),
      });
    }),
  );

  // Query-aware list. With no filters this returns every record the caller owns
  // (behavior-identical to the base `GET /workspaces`); with filters it narrows
  // truthfully. Ownership scoping is applied AFTER the board filters.
  router.get(
    '/workspaces',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const filters = filtersFromQuery(req.query as Record<string, unknown>);
      const workspaces = await module.queryWorkspaces(filters);
      sendSuccess(res, {
        workspaces: filterAccessibleWorkspaces(workspaces, req.principal!, accessOpts),
        filters,
      });
    }),
  );

  return router;
}
