/**
 * `internal-memory.routes` — the `/internal/agent-os/memory/*` worker-to-backend
 * ingest edge (api rule: `INTERNAL_SERVICE_KEY`-gated only). This is the seam a
 * runtime / worker / sidecar calls to land a run-completion HARVEST (the write
 * half of the "launch recall / completion harvest" loop) in the control plane
 * WITHOUT a user session — the actor `userId` is supplied by the trusted worker.
 *
 *  - `POST /harvest` — distill a durable-worthy fact from a finished run into an
 *    EPHEMERAL candidate wisp. EVIDENCE is required ({ taskId, artifactId }); an
 *    unevidenced harvest is skipped (`{ harvested: false, reason }`), never
 *    silently stored, and never durable memory (that is the governed accept path).
 *
 * Every route sits behind `requireInternal` (constant-time, fail-closed: an unset
 * `INTERNAL_SERVICE_KEY` yields 503, a wrong key 401) and validates its body with
 * a zod schema at the boundary BEFORE any domain code runs. The harvest outcome
 * (skipped for missing evidence, or a store fault) comes back as a truthful
 * `HarvestResult` with a 200 — only malformed payloads 400.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import { validateBody } from '../../../http/middleware/validate.js';
import { asyncHandler, sendSuccess } from '../../../shared/errors.js';
import type { HarvestService } from '../lifecycle/harvest.js';
import type { MemoryScope } from '../lifecycle/candidate-service.js';

export interface InternalMemoryRoutesDeps {
  readonly harvest: HarvestService;
  readonly middleware: AuthMiddleware;
}

/** The scope vocabulary a harvest may file under (mirrors agent-os). */
const MEMORY_SCOPES = ['user', 'org', 'space', 'repo', 'path', 'agent', 'task-type'] as const;

const harvestBodySchema = z.object({
  /** The worker-supplied actor id the wisp is filed under (trusted internal edge). */
  userId: z.string().min(1),
  scope: z.enum(MEMORY_SCOPES),
  title: z.string().min(1),
  body: z.string().min(1),
  /** Who/what produced the fact (agent id or principal id). */
  proposedBy: z.string().min(1),
  /** The run evidence anchor (required by the harvest service). */
  taskId: z.string().min(1),
  artifactId: z.string().min(1),
  discoveredFrom: z.string().min(1).optional(),
});

/** Build the internal memory router (mount at `/internal/agent-os/memory`). */
export function buildInternalMemoryRouter(deps: InternalMemoryRoutesDeps): Router {
  const { harvest, middleware } = deps;
  const router = Router();

  // Every edge here is worker-to-backend only — gate once, up front.
  router.use(middleware.requireInternal);

  // POST /harvest — evidence-backed run-completion harvest → candidate wisp.
  router.post(
    '/harvest',
    validateBody(harvestBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as z.infer<typeof harvestBodySchema>;
      const result = await harvest.harvest({
        userId: body.userId,
        scope: body.scope as MemoryScope,
        title: body.title,
        body: body.body,
        proposedBy: body.proposedBy,
        taskId: body.taskId,
        artifactId: body.artifactId,
        ...(body.discoveredFrom ? { discoveredFrom: body.discoveredFrom } : {}),
      });
      sendSuccess(res, result);
    }),
  );

  return router;
}
