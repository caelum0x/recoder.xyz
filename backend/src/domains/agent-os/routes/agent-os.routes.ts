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
  router.get('/summary', middleware.authenticate, async (_req: Request, res: Response) => {
    try {
      sendSuccess(res, await repository.snapshot());
    } catch (error) {
      sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, message(error)));
    }
  });

  // Bounded list edges: `?limit=`/`?offset=` validated at the boundary, threaded
  // as a REAL `LIMIT/OFFSET` into the repository (never a fetch-all-then-slice).
  // Backward compatible — absent params ⇒ first page at the default cap, and
  // `data` stays the array (pagination totals ride in `meta`).
  router.get(
    '/tasks',
    middleware.authenticate,
    validateQuery(paginationQuerySchema),
    async (req: Request, res: Response) => {
      try {
        const page = await repository.listTasksPage(pageQueryOf(req));
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
        const page = await repository.listRunsPage(pageQueryOf(req));
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
