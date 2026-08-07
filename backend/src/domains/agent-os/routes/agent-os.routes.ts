/**
 * `agent-os.routes` — the control-plane HTTP edges (domain doc §6). Kept focused
 * for Phase 5a: truthful read models over the repository port. The edge domain
 * mounts this router under `/api/agent-os` and threads the interop chain
 * (authorize → risk → policy → audit). The `INTERNAL_SERVICE_KEY`-gated ingest
 * edges (events / steps / runtime-evidence / outbox drain) live in
 * `internal-agent-os.routes.ts`, mounted by the composer.
 *
 * The per-aggregate CRUD edge table (spaces/agents/tasks/runs/approvals/
 * artifacts/memory/instructions/policies/events) lives in
 * `agent-os-crud.routes.ts` and is mounted here after the summary surfaces.
 */
import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { z } from 'zod';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { AgentOsRepositoryPort, PageQuery } from '../ports/agent-os-repository.port.js';
import { sendSuccess, sendError, createError, ErrorCode } from '../../../shared/errors.js';
import { validateQuery } from '../../../http/middleware/validate.js';
import { buildAgentOsCrudRouter } from './agent-os-crud.routes.js';
import { paginationQuerySchema } from './agent-os-crud.schemas.js';
import { seesAllSpaces, visibleSpaces } from '../services/space-authz.js';
import { scopeAndPage } from '../services/list-scope.js';
import type { PolicyUpdatedEvent } from '../services/policy-update.emitter.js';

export interface AgentOsRoutesDeps {
  readonly repository: AgentOsRepositoryPort;
  readonly middleware: AuthMiddleware;
  /** OPTIONAL `policy.updated` sink threaded into the CRUD policy-write edges (§4c). */
  readonly onPolicyChange?: (event: PolicyUpdatedEvent) => void;
  /**
   * Solo/desktop mode (bootstrap-injected from `RECODER_SOLO_MODE`). When true
   * the space tenant-scoping guards fail OPEN (single local owner). Defaults to
   * false — a cloud deploy keeps the owner-scoped isolation.
   */
  readonly soloMode?: boolean;
  /**
   * OPTIONAL `Idempotency-Key` replay guard (BE-10.3), threaded into the CRUD
   * router's duplicate-spawning `POST /runs` edge. Absent ⇒ no behavior change.
   */
  readonly idempotency?: RequestHandler;
}

export function buildAgentOsRouter(deps: AgentOsRoutesDeps): Router {
  const { repository, middleware, onPolicyChange } = deps;
  const soloMode = deps.soloMode ?? false;
  const router = Router();

  // — Read models (authenticated) —
  router.get('/summary', middleware.authenticate, async (req: Request, res: Response) => {
    try {
      // snapshot() aggregates EVERY tenant's agents/tasks/runs/artifacts/events —
      // a control-plane OPERATOR view that cannot be meaningfully tenant-scoped
      // without rebuilding per-tenant. Fail closed: operator/solo only; a tenant
      // caller is refused rather than shown another tenant's data. (recoder-ctoj)
      if (!seesAllSpaces(req.principal, soloMode)) {
        sendError(
          res,
          createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'The agent-os summary is an operator-only surface.'),
        );
        return;
      }
      sendSuccess(res, await repository.snapshot());
    } catch (error) {
      sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, message(error)));
    }
  });

  // Owned-space scope for the tenant-scoped list edges: the set of spaceIds the
  // caller owns (operator/solo `seeAll` skips the fetch). Tasks/runs carry a
  // direct `spaceId`, so no taskId indirection is needed here. (recoder-ctoj)
  async function ownedSpaceScope(
    req: Request,
  ): Promise<{ seeAll: boolean; ownedSpaceIds: ReadonlySet<string> }> {
    const seeAll = seesAllSpaces(req.principal, soloMode);
    if (seeAll) return { seeAll, ownedSpaceIds: new Set() };
    const spaces = await repository.listSpaces();
    return {
      seeAll,
      ownedSpaceIds: new Set(visibleSpaces(spaces, req.principal, soloMode).map((s) => s.spaceId)),
    };
  }

  // Bounded, TENANT-SCOPED list edges (recoder-ctoj): filter to the caller's own
  // rows FIRST, then slice (a repo-side page over unfiltered rows would leak
  // another tenant's rows + skew totals). Backward compatible — `data` stays the
  // array, pagination totals ride in `meta`. Operator/solo callers see all.
  router.get(
    '/tasks',
    middleware.authenticate,
    validateQuery(paginationQuerySchema),
    async (req: Request, res: Response) => {
      try {
        const scope = await ownedSpaceScope(req);
        // Operator/solo take the efficient driver page; a tenant filter-then-pages.
        const page = scope.seeAll
          ? await repository.listTasksPage(pageQueryOf(req))
          : scopeAndPage(await repository.listTasks(), (t) => t.spaceId, scope.seeAll, scope.ownedSpaceIds, pageQueryOf(req));
        sendSuccess(res, page.items, { meta: metaOf(page) });
      } catch (error) {
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, message(error)));
      }
    },
  );

  router.get(
    '/runs',
    middleware.authenticate,
    validateQuery(paginationQuerySchema),
    async (req: Request, res: Response) => {
      try {
        const scope = await ownedSpaceScope(req);
        const page = scope.seeAll
          ? await repository.listRunsPage(pageQueryOf(req))
          : scopeAndPage(await repository.listRuns(), (r) => r.spaceId, scope.seeAll, scope.ownedSpaceIds, pageQueryOf(req));
        sendSuccess(res, page.items, { meta: metaOf(page) });
      } catch (error) {
        sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, message(error)));
      }
    },
  );

  // — Full per-aggregate CRUD edge table (self-gated per route) —
  router.use(
    buildAgentOsCrudRouter({
      repository,
      middleware,
      soloMode,
      ...(onPolicyChange ? { onPolicyChange } : {}),
      ...(deps.idempotency ? { idempotency: deps.idempotency } : {}),
    }),
  );

  return router;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'agent-os request failed';
}

/** The validated `{ limit, offset }` bound (validateQuery has already coerced + defaulted). */
function pageQueryOf(req: Request): PageQuery {
  const { limit, offset } = req.query as unknown as z.infer<typeof paginationQuerySchema>;
  return { limit, offset };
}

/** Pagination `meta` for the success envelope. */
function metaOf(page: { total: number; limit: number; offset: number }): {
  total: number;
  limit: number;
  offset: number;
} {
  return { total: page.total, limit: page.limit, offset: page.offset };
}
