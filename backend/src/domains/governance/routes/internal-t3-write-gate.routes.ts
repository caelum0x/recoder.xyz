/**
 * `internal-t3-write-gate.routes` — the `/internal/agent-os/t3-write-gate/*`
 * worker-to-backend loopback edge docs/RECODER-T3CODE-COMPOSITION.md section
 * 5 names ("the t3 server asks the Recoder backend for verdicts... over
 * loopback"). `third_party/t3code/apps/server` (the forked t3 Effect-TS
 * session runtime) calls this BEFORE every worktree/PR/checkpoint write —
 * never the other way around, so the two state machines cannot fight (same
 * one-way rule `docs/RECODER-T3CODE-COMPOSITION.md` section 3 already states
 * for the backend/t3 relationship generally).
 *
 *   POST /internal/agent-os/t3-write-gate/decide — classify + (if risky) open
 *     a durable approval for one write/merge action BEFORE it happens.
 *
 * Sits behind `requireInternal` (constant-time, fail-closed: an unset
 * `INTERNAL_SERVICE_KEY` yields 503, a wrong key 401), same as every other
 * `/internal/agent-os/*` edge. Body validated with zod at the boundary.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler, sendSuccess } from '../../../shared/errors.js';
import { validateBody } from '../../../http/middleware/validate.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { T3WriteCommandGate, T3WriteAction } from '../adapters/t3-write-gate.adapter.js';

export interface InternalT3WriteGateRoutesDeps {
  readonly gate: T3WriteCommandGate;
  readonly middleware: AuthMiddleware;
}

const T3_WRITE_ACTIONS = [
  'worktree.create',
  'worktree.remove',
  'pr.create',
  'pr.link',
  'pr.merge',
  'checkpoint.revert',
  'git.push',
] as const satisfies readonly T3WriteAction[];

const decideBodySchema = z.object({
  actorId: z.string().min(1),
  action: z.enum(T3_WRITE_ACTIONS),
  target: z.string().min(1),
  taskId: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/** Build the internal t3-write-gate router (mount at `/internal/agent-os/t3-write-gate`). */
export function buildInternalT3WriteGateRouter(deps: InternalT3WriteGateRoutesDeps): Router {
  const { gate, middleware } = deps;
  const router = Router();

  // Worker-to-backend only — gate once, up front, same as every other
  // internal router in this repo.
  router.use(middleware.requireInternal);

  router.post(
    '/decide',
    validateBody(decideBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as z.infer<typeof decideBodySchema>;
      const outcome = await gate.gate({
        actorId: body.actorId,
        action: body.action,
        target: body.target,
        taskId: body.taskId,
        metadata: body.metadata,
      });
      sendSuccess(res, outcome);
    }),
  );

  return router;
}
