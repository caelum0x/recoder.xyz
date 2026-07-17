/**
 * `internal-agent-os.routes` — the `/internal/agent-os/*` worker-to-backend
 * ingest edges (domain doc §6; api rule: `INTERNAL_SERVICE_KEY`-gated only).
 * These are the seams runtimes / workers / sidecars call to land run evidence
 * in the control plane:
 *
 *  - `POST /events`               — RunEvent ingest (single or batch)
 *  - `POST /runs/:runId/steps`    — step append (RunEvents scoped to one run)
 *  - `POST /runtime-evidence`     — runtime evidence attach
 *  - `POST /outbox/drain`         — manual at-least-once drain trigger
 *
 * Every route sits behind `requireInternal` (constant-time, fail-closed: an
 * unset `INTERNAL_SERVICE_KEY` yields 503, a wrong key 401) and validates its
 * body with a zod schema at the boundary BEFORE any domain code runs. Domain
 * outcomes (illegal transition / unknown run / gate denial) come back as
 * structured `RunEventIngestResult` rejections with a 200 — only malformed
 * payloads 400 and only infra faults 503. Composes the frozen `@recoder/agent-os`
 * contracts (`RunEvent`, `RuntimeEvidence`, `RuntimeEvidenceService`) — no
 * redefinition.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  RuntimeEvidenceService,
  RuntimeEvidenceKindEnum,
  type RunEvent,
  type RuntimeEvidenceKind,
} from '@recoder/agent-os';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import { validateBody, validateParams } from '../../../http/middleware/validate.js';
import { asyncHandler, sendSuccess, sendError, createError, ErrorCode } from '../../../shared/errors.js';
import type { AgentOsRepositoryPort } from '../ports/agent-os-repository.port.js';
import type { RunEventBusPort, RunEventSource } from '../ports/run-event.port.js';
import type { DrainStats } from '../types.js';

/** The drain seam this router triggers — `OutboxDrainService.drainOnce` satisfies it. */
export interface OutboxDrainRunner {
  drainOnce(): Promise<DrainStats>;
}

export interface InternalAgentOsRoutesDeps {
  readonly repository: AgentOsRepositoryPort;
  readonly runEventBus: RunEventBusPort;
  readonly drain: OutboxDrainRunner;
  readonly middleware: AuthMiddleware;
}

// --- Boundary schemas (shape only; transition legality is the reducer's). ---

/** The frozen `RunEventType` union from `@recoder/agent-os`, as zod literals. */
const RUN_EVENT_TYPES = [
  'started',
  'state_transition',
  'log',
  'user_message',
  'artifact',
  'needs_input',
  'verified',
  'approval_requested',
  'handoff',
  'failed',
  'completed',
] as const;

/** The frozen `TaskRunState` union from `@recoder/agent-os`, as zod literals. */
const TASK_RUN_STATES = [
  'created',
  'compiled',
  'routed',
  'claimed',
  'running',
  'needs_input',
  'verifying',
  'waiting_for_approval',
  'approved',
  'delivered',
  'completed',
  'failed',
  'cancelled',
  'rejected',
] as const;

/** Emitter provenance an internal caller may claim (never trusted for authz). */
const RUN_EVENT_SOURCES = ['conductor', 'runtime-adapter', 'engine', 'internal-api'] as const;

const runEventSchema = z.object({
  eventId: z.string().min(1),
  type: z.enum(RUN_EVENT_TYPES),
  taskId: z.string().min(1),
  runId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  state: z.enum(TASK_RUN_STATES).optional(),
  message: z.string().optional(),
  artifactId: z.string().optional(),
  createdAt: z.string().min(1),
  data: z.record(z.unknown()).optional(),
});

const eventsBodySchema = z
  .object({
    event: runEventSchema.optional(),
    events: z.array(runEventSchema).optional(),
    source: z.enum(RUN_EVENT_SOURCES).optional(),
  })
  .refine((body) => body.event !== undefined || body.events !== undefined, {
    message: 'body must carry `event` or `events`',
  });

const stepsParamsSchema = z.object({ runId: z.string().min(1) });

const stepsBodySchema = z.object({
  steps: z.array(runEventSchema).min(1),
  source: z.enum(RUN_EVENT_SOURCES).optional(),
});

/** Wire shape of `CreateRuntimeEvidenceInput` (`RuntimeEvidenceService` normalizes it). */
const runtimeEvidenceBodySchema = z.object({
  evidenceId: z.string().min(1).optional(),
  taskId: z.string().min(1),
  runId: z.string().min(1).optional(),
  kind: z.enum(
    Object.values(RuntimeEvidenceKindEnum) as [RuntimeEvidenceKind, ...RuntimeEvidenceKind[]],
  ),
  status: z.enum(['observed', 'passed', 'failed', 'warning']).optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  source: z
    .object({
      runtimeId: z.string().optional(),
      adapterId: z.string().optional(),
      sandboxId: z.string().optional(),
      sessionId: z.string().optional(),
      command: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
  artifactIds: z.array(z.string().min(1)).optional(),
  observedAt: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

type RunEventInput = z.infer<typeof runEventSchema>;

/** Narrow a parsed wire event to the frozen domain type (schema mirrors it 1:1). */
function toRunEvent(input: RunEventInput): RunEvent {
  return input as RunEvent;
}

/** Build the internal agent-os router (mount at `/internal/agent-os`). */
export function buildInternalAgentOsRouter(deps: InternalAgentOsRoutesDeps): Router {
  const { repository, runEventBus, drain, middleware } = deps;
  const router = Router();

  // Every edge in this router is worker-to-backend only — gate once, up front.
  router.use(middleware.requireInternal);

  // POST /events — RunEvent ingest (single or batch). Response shape mirrors the
  // ingest contract: one `RunEventIngestResult` (or an index-aligned array).
  router.post(
    '/events',
    validateBody(eventsBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const body = req.body as z.infer<typeof eventsBodySchema>;
      const source: RunEventSource = body.source ?? 'internal-api';
      if (body.events !== undefined) {
        sendSuccess(res, await runEventBus.ingestBatch(body.events.map(toRunEvent), source));
        return;
      }
      // The refine guarantees `event` is present when `events` is absent.
      sendSuccess(res, await runEventBus.ingest(toRunEvent(body.event as RunEventInput), source));
    }),
  );

  // POST /runs/:runId/steps — step append. Steps are RunEvents scoped to ONE
  // run: the path param is authoritative, so a step naming a different run is a
  // boundary error (fail fast), and an omitted runId inherits the param.
  router.post(
    '/runs/:runId/steps',
    validateParams(stepsParamsSchema),
    validateBody(stepsBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { runId } = req.params as z.infer<typeof stepsParamsSchema>;
      const body = req.body as z.infer<typeof stepsBodySchema>;
      const mismatched = body.steps.find((step) => step.runId !== undefined && step.runId !== runId);
      if (mismatched) {
        sendError(
          res,
          createError(
            ErrorCode.VALIDATION_ERROR,
            `step ${mismatched.eventId} targets run ${mismatched.runId}, not path run ${runId}`,
          ),
        );
        return;
      }
      const events = body.steps.map((step) => toRunEvent({ ...step, runId }));
      const results = await runEventBus.ingestBatch(events, body.source ?? 'internal-api');
      sendSuccess(res, { runId, results });
    }),
  );

  // POST /runtime-evidence — evidence attach. Normalized through the frozen
  // `RuntimeEvidenceService` (ids/defaults), persisted via the repository port.
  // A `runId` that names an unknown run is a truthful 404, never a silent attach.
  const evidenceService = new RuntimeEvidenceService();
  router.post(
    '/runtime-evidence',
    validateBody(runtimeEvidenceBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const input = req.body as z.infer<typeof runtimeEvidenceBodySchema>;
      if (input.runId !== undefined) {
        const runs = await repository.listRuns();
        if (!runs.some((run) => run.runId === input.runId)) {
          sendError(res, createError(ErrorCode.NOT_FOUND, `run not found: ${input.runId}`));
          return;
        }
      }
      const evidence = evidenceService.create(input);
      const stored = await repository.upsertRuntimeEvidence(evidence);
      sendSuccess(res, { evidence: stored });
    }),
  );

  // POST /outbox/drain — manual drain trigger. Returns truthful `DrainStats`
  // (a publish fault leaves records `pending` and shows up in `failed`).
  router.post(
    '/outbox/drain',
    asyncHandler(async (_req: Request, res: Response) => {
      sendSuccess(res, await drain.drainOnce());
    }),
  );

  return router;
}
