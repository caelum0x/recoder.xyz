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
import { Router, type Request, type Response } from 'express';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { AgentOsRepositoryPort } from '../ports/agent-os-repository.port.js';
import { sendSuccess, sendError, createError, ErrorCode } from '../../../shared/errors.js';
import { buildAgentOsCrudRouter } from './agent-os-crud.routes.js';
import type { PolicyUpdatedEvent } from '../services/policy-update.emitter.js';

export interface AgentOsRoutesDeps {
  readonly repository: AgentOsRepositoryPort;
  readonly middleware: AuthMiddleware;
  /** OPTIONAL `policy.updated` sink threaded into the CRUD policy-write edges (§4c). */
  readonly onPolicyChange?: (event: PolicyUpdatedEvent) => void;
}

export function buildAgentOsRouter(deps: AgentOsRoutesDeps): Router {
  const { repository, middleware, onPolicyChange } = deps;
  const router = Router();

  // — Read models (authenticated) —
  router.get('/summary', middleware.authenticate, async (_req: Request, res: Response) => {
    try {
      sendSuccess(res, await repository.snapshot());
    } catch (error) {
      sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, message(error)));
    }
  });

  router.get('/tasks', middleware.authenticate, async (_req: Request, res: Response) => {
    try {
      sendSuccess(res, await repository.listTasks());
    } catch (error) {
      sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, message(error)));
    }
  });

  router.get('/runs', middleware.authenticate, async (_req: Request, res: Response) => {
    try {
      sendSuccess(res, await repository.listRuns());
    } catch (error) {
      sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, message(error)));
    }
  });

  // — Full per-aggregate CRUD edge table (self-gated per route) —
  router.use(
    buildAgentOsCrudRouter({ repository, middleware, ...(onPolicyChange ? { onPolicyChange } : {}) }),
  );

  return router;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'agent-os request failed';
}
