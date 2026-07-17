/**
 * `agent-os.routes` — the control-plane HTTP edges (domain doc §6). Kept focused
 * for Phase 5a: truthful read models over the repository port. The edge domain
 * mounts this router under `/api/agent-os` and threads the interop chain
 * (authorize → risk → policy → audit). The `INTERNAL_SERVICE_KEY`-gated ingest
 * edges (events / steps / runtime-evidence / outbox drain) live in
 * `internal-agent-os.routes.ts`, mounted by the composer.
 *
 * Additional per-aggregate CRUD edges (tasks/runs/approvals/artifacts/…) land in
 * their own route files during integration; this file wires the load-bearing
 * summary surfaces the spine needs first.
 */
import { Router, type Request, type Response } from 'express';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { AgentOsRepositoryPort } from '../ports/agent-os-repository.port.js';
import { sendSuccess, sendError, createError, ErrorCode } from '../../../shared/errors.js';

export interface AgentOsRoutesDeps {
  readonly repository: AgentOsRepositoryPort;
  readonly middleware: AuthMiddleware;
}

export function buildAgentOsRouter(deps: AgentOsRoutesDeps): Router {
  const { repository, middleware } = deps;
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

  return router;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'agent-os request failed';
}
