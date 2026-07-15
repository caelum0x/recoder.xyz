/**
 * `agent-os.routes` — the control-plane HTTP edges (domain doc §6). Kept focused
 * for Phase 5a: truthful read models over the repository port + the internal
 * run-event ingest edge. The edge domain mounts this router under
 * `/api/agent-os` and threads the interop chain (authorize → risk → policy →
 * audit); the `requireInternal` gate fail-closes the ingest edge when
 * `INTERNAL_SERVICE_KEY` is unset.
 *
 * Additional per-aggregate CRUD edges (tasks/runs/approvals/artifacts/…) land in
 * their own route files during integration; this file wires the load-bearing
 * summary + ingest surfaces the spine needs first.
 */
import { Router, type Request, type Response } from 'express';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { AgentOsRepositoryPort } from '../ports/agent-os-repository.port.js';
import type { RunEventBusPort, RunEventSource } from '../ports/run-event.port.js';
import { sendSuccess, sendError, createError, ErrorCode } from '../../../shared/errors.js';
import type { RunEvent } from '@recoder/agent-os';

export interface AgentOsRoutesDeps {
  readonly repository: AgentOsRepositoryPort;
  readonly runEventBus: RunEventBusPort;
  readonly middleware: AuthMiddleware;
}

export function buildAgentOsRouter(deps: AgentOsRoutesDeps): Router {
  const { repository, runEventBus, middleware } = deps;
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

  // — Internal run-event ingest (fail-closed without INTERNAL_SERVICE_KEY) —
  router.post('/internal/events', middleware.requireInternal, async (req: Request, res: Response) => {
    const body = req.body as { event?: RunEvent; events?: RunEvent[]; source?: RunEventSource };
    const source = body.source ?? 'internal-api';
    try {
      if (Array.isArray(body.events)) {
        sendSuccess(res, await runEventBus.ingestBatch(body.events, source));
        return;
      }
      if (body.event) {
        sendSuccess(res, await runEventBus.ingest(body.event, source));
        return;
      }
      sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'body must carry `event` or `events`'));
    } catch (error) {
      // Only INFRA faults reach here — ingest returns rejections, not throws.
      sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, message(error)));
    }
  });

  return router;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'agent-os request failed';
}
