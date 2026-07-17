/**
 * `internal-billing.routes` — the `/internal/billing/*` worker-to-backend usage
 * ingest edge (domain doc §5; api rule: `INTERNAL_SERVICE_KEY`-gated only).
 *
 *  - `POST /meter` — a worker/conductor/runtime reports one usage event
 *    (per-run / per-token / per-engine) into the durable metering ledger.
 *
 * The route sits behind `requireInternal` (constant-time, fail-closed: an unset
 * `INTERNAL_SERVICE_KEY` yields 503, a wrong/absent key 401) and zod-validates the
 * body at the boundary. The write is idempotent (a repeated `idempotencyKey` is a
 * durable no-op → `recorded:false`) and degrade-safe: with no DB the metering
 * service no-ops truthfully rather than faking a record. This is the seam an
 * out-of-process worker uses to reach the SAME ledger the in-process conductor +
 * inference emitters write through directly.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import { validateBody } from '../../../http/middleware/validate.js';
import { asyncHandler, sendSuccess } from '../../../shared/errors.js';
import type { MeteringService } from '../services/metering.service.js';
import { USAGE_KINDS, type UsageKind } from '../types.js';

export interface InternalBillingRoutesDeps {
  /** The durable usage ledger writer (billing's `MeteringService`). */
  readonly metering: MeteringService;
  /** The composed identity auth middleware (supplies `requireInternal`). */
  readonly middleware: AuthMiddleware;
}

/** The meter-emit wire shape (mirrors the metering service `MeterInput`). */
const meterBodySchema = z.object({
  subjectId: z.string().min(1),
  kind: z.enum([...USAGE_KINDS] as [UsageKind, ...UsageKind[]]),
  /** Units consumed (tokens / runs …). Absent ⇒ `1`; non-positive rejected. */
  quantity: z.number().int().positive().optional(),
  runId: z.string().min(1).nullable().optional(),
  engine: z.string().min(1).nullable().optional(),
  idempotencyKey: z.string().min(1).optional(),
  occurredAt: z.string().min(1).optional(),
});

/** Build the internal billing router (mount at `/internal/billing`). */
export function buildInternalBillingRouter(deps: InternalBillingRoutesDeps): Router {
  const { metering, middleware } = deps;
  const router = Router();

  // Worker-to-backend only — gate once, up front (fail-closed).
  router.use(middleware.requireInternal);

  // POST /meter — record one usage event durably + idempotently. `recorded:false`
  // means a duplicate idempotency key (a truthful no-op), NOT a failure.
  router.post(
    '/meter',
    validateBody(meterBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as z.infer<typeof meterBodySchema>;
      const write = await metering.record({
        subjectId: body.subjectId,
        kind: body.kind,
        ...(body.quantity !== undefined ? { quantity: body.quantity } : {}),
        ...(body.runId !== undefined ? { runId: body.runId } : {}),
        ...(body.engine !== undefined ? { engine: body.engine } : {}),
        ...(body.idempotencyKey !== undefined ? { idempotencyKey: body.idempotencyKey } : {}),
        ...(body.occurredAt !== undefined ? { occurredAt: body.occurredAt } : {}),
      });
      sendSuccess(res, { recorded: write.inserted });
    }),
  );

  return router;
}
