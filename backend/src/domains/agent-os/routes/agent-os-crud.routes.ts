/**
 * `agent-os-crud.routes` — the full `/api/agent-os` CRUD edge table (api rule
 * surfaces: spaces / agents / tasks / runs / approvals / artifacts / memory /
 * instructions / policies / events). GAP Wave 4 item "Full /api/agent-os CRUD
 * edge table".
 *
 * Posture (mirrors the existing summary edges):
 *  - self-gated: reads behind `middleware.authenticate`, writes behind
 *    `middleware.authenticateMutating` (never an anonymous principal).
 *  - every body/param/query is zod-validated at the boundary BEFORE domain code.
 *  - COMPOSES the frozen `@recoder/agent-os` contracts: run creation via
 *    `TaskService.createRun`, run moves via `isAllowedTaskRunTransition` /
 *    `transitionTaskRun` — legality is never re-derived here.
 *  - approvals + instructions + policies are READ-ONLY mirrors on this surface
 *    (authoritative approval lifecycle is the governance domain's; bundles are
 *    compiler-produced; decisions are gate-produced).
 *  - infra faults surface as truthful 503s (`SERVICE_UNAVAILABLE`), unknown ids
 *    as 404s, illegal transitions as 409-shaped `INVALID_INPUT` — never faked.
 */
import { Router, type Request, type RequestHandler, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  TaskService,
  isAllowedTaskRunTransition,
  transitionTaskRun,
  type AgentProfile,
  type Artifact,
  type MemoryCandidate,
  type RunEvent,
  type Space,
  type TaskSpec,
} from '@recoder/agent-os';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../../http/middleware/validate.js';
import { sendSuccess, sendError, createError, ErrorCode } from '../../../shared/errors.js';
import type { AgentOsRepositoryPort } from '../ports/agent-os-repository.port.js';
import {
  agentUpsertSchema,
  artifactCreateSchema,
  eventsQuerySchema,
  idParamSchema,
  memoryCandidateCreateSchema,
  runCreateSchema,
  runTransitionSchema,
  spacePolicyPutSchema,
  spaceUpsertSchema,
  taskUpsertSchema,
} from './agent-os-crud.schemas.js';

export interface AgentOsCrudRoutesDeps {
  readonly repository: AgentOsRepositoryPort;
  readonly middleware: AuthMiddleware;
}

/** The actor recorded on writes when the body names none (never anonymous — gate is upstream). */
function actorOf(req: Request): string {
  return req.principal?.userId ?? 'unknown';
}

/**
 * Wrap a handler so an infra fault (repository/pool down) surfaces as a
 * truthful 503 `SERVICE_UNAVAILABLE` — the same posture as the base
 * `agent-os.routes` read models. Never a faked success, never a raw stack.
 */
function handle(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res) => {
    void fn(req, res).catch((error: unknown) => {
      if (res.headersSent) return;
      sendError(
        res,
        createError(
          ErrorCode.SERVICE_UNAVAILABLE,
          error instanceof Error ? error.message : 'agent-os request failed',
        ),
      );
    });
  };
}

/** Build the CRUD edge table (mounted inside the `/api/agent-os` router). */
export function buildAgentOsCrudRouter(deps: AgentOsCrudRoutesDeps): Router {
  const { repository, middleware } = deps;
  const taskService = new TaskService();
  const router = Router();

  const read = middleware.authenticate;
  const write = middleware.authenticateMutating;

  // — Spaces —
  router.get('/spaces', read, handle(async (_req, res) => {
    sendSuccess(res, await repository.listSpaces());
  }));

  router.get(
    '/spaces/:spaceId',
    read,
    validateParams(idParamSchema('spaceId')),
    handle(async (req, res) => {
      const spaces = await repository.listSpaces();
      const space = spaces.find((s) => s.spaceId === req.params.spaceId);
      if (!space) return notFound(res, 'space', req.params.spaceId);
      sendSuccess(res, space);
    }),
  );

  router.post(
    '/spaces',
    write,
    validateBody(spaceUpsertSchema),
    handle(async (req, res) => {
      const body = req.body as z.infer<typeof spaceUpsertSchema>;
      const now = new Date().toISOString();
      const space: Space = {
        ...body,
        createdAt: body.createdAt ?? now,
        updatedAt: body.updatedAt ?? now,
      };
      sendSuccess(res, await repository.upsertSpace(space));
    }),
  );

  router.put(
    '/spaces/:spaceId/policy',
    write,
    validateParams(idParamSchema('spaceId')),
    validateBody(spacePolicyPutSchema),
    handle(async (req, res) => {
      const spaceId = req.params.spaceId;
      const spaces = await repository.listSpaces();
      if (!spaces.some((s) => s.spaceId === spaceId)) return notFound(res, 'space', spaceId);
      const policy = req.body as z.infer<typeof spacePolicyPutSchema>;
      sendSuccess(res, await repository.upsertSpacePolicy(spaceId, policy));
    }),
  );

  // — Agents —
  router.get('/agents', read, handle(async (_req, res) => {
    sendSuccess(res, await repository.listAgents());
  }));

  router.get(
    '/agents/:agentId',
    read,
    validateParams(idParamSchema('agentId')),
    handle(async (req, res) => {
      const agents = await repository.listAgents();
      const agent = agents.find((a) => a.agentId === req.params.agentId);
      if (!agent) return notFound(res, 'agent', req.params.agentId);
      sendSuccess(res, agent);
    }),
  );

  router.post(
    '/agents',
    write,
    validateBody(agentUpsertSchema),
    handle(async (req, res) => {
      const body = req.body as z.infer<typeof agentUpsertSchema>;
      const agent: AgentProfile = {
        ...body,
        lastSeenAt: body.lastSeenAt ?? new Date().toISOString(),
      } as AgentProfile;
      sendSuccess(res, await repository.upsertAgent(agent));
    }),
  );

  // — Tasks (GET /tasks lives in the base router) —
  router.get(
    '/tasks/:taskId',
    read,
    validateParams(idParamSchema('taskId')),
    handle(async (req, res) => {
      const tasks = await repository.listTasks();
      const task = tasks.find((t) => t.taskId === req.params.taskId);
      if (!task) return notFound(res, 'task', req.params.taskId);
      sendSuccess(res, task);
    }),
  );

  router.post(
    '/tasks',
    write,
    validateBody(taskUpsertSchema),
    handle(async (req, res) => {
      const task = req.body as TaskSpec;
      sendSuccess(res, await repository.upsertTask(task));
    }),
  );

  // — Runs (GET /runs lives in the base router; creation + transition compose
  //   the frozen package contracts) —
  router.get(
    '/runs/:runId',
    read,
    validateParams(idParamSchema('runId')),
    handle(async (req, res) => {
      const runs = await repository.listRuns();
      const run = runs.find((r) => r.runId === req.params.runId);
      if (!run) return notFound(res, 'run', req.params.runId);
      sendSuccess(res, run);
    }),
  );

  router.post(
    '/runs',
    write,
    validateBody(runCreateSchema),
    handle(async (req, res) => {
      const body = req.body as z.infer<typeof runCreateSchema>;
      const tasks = await repository.listTasks();
      const task = tasks.find((t) => t.taskId === body.taskId);
      if (!task) return notFound(res, 'task', body.taskId);
      const run = taskService.createRun({
        runId: body.runId ?? randomUUID(),
        task,
        ...(body.assigneeAgentId ? { assigneeAgentId: body.assigneeAgentId } : {}),
        ...(body.instructionBundleId ? { instructionBundleId: body.instructionBundleId } : {}),
      });
      sendSuccess(res, await repository.upsertRun(run));
    }),
  );

  router.post(
    '/runs/:runId/transition',
    write,
    validateParams(idParamSchema('runId')),
    validateBody(runTransitionSchema),
    handle(async (req, res) => {
      const body = req.body as z.infer<typeof runTransitionSchema>;
      const runs = await repository.listRuns();
      const run = runs.find((r) => r.runId === req.params.runId);
      if (!run) return notFound(res, 'run', req.params.runId);
      if (!isAllowedTaskRunTransition(run.state, body.to)) {
        sendError(
          res,
          createError(
            ErrorCode.INVALID_INPUT,
            `illegal run transition: ${run.state} -> ${body.to}`,
            { details: { runId: run.runId, from: run.state, to: body.to } },
          ),
        );
        return;
      }
      const next = transitionTaskRun(run, body.to, {
        ...(body.metadata ? { metadata: body.metadata } : {}),
      });
      sendSuccess(res, await repository.upsertRun(next));
    }),
  );

  // — Approvals (READ-ONLY mirror; authoritative lifecycle = governance domain) —
  router.get('/approvals', read, handle(async (_req, res) => {
    sendSuccess(res, await repository.listApprovals());
  }));

  router.get(
    '/approvals/:approvalId',
    read,
    validateParams(idParamSchema('approvalId')),
    handle(async (req, res) => {
      const approvals = await repository.listApprovals();
      const approval = approvals.find((a) => a.approvalId === req.params.approvalId);
      if (!approval) return notFound(res, 'approval', req.params.approvalId);
      sendSuccess(res, approval);
    }),
  );

  // — Artifacts —
  router.get('/artifacts', read, handle(async (_req, res) => {
    sendSuccess(res, await repository.listArtifacts());
  }));

  router.get(
    '/artifacts/:artifactId',
    read,
    validateParams(idParamSchema('artifactId')),
    handle(async (req, res) => {
      const artifacts = await repository.listArtifacts();
      const artifact = artifacts.find((a) => a.artifactId === req.params.artifactId);
      if (!artifact) return notFound(res, 'artifact', req.params.artifactId);
      sendSuccess(res, artifact);
    }),
  );

  router.post(
    '/artifacts',
    write,
    validateBody(artifactCreateSchema),
    handle(async (req, res) => {
      const body = req.body as z.infer<typeof artifactCreateSchema>;
      const artifact: Artifact = {
        ...body,
        artifactId: body.artifactId ?? randomUUID(),
        createdAt: body.createdAt ?? new Date().toISOString(),
        createdBy: body.createdBy ?? actorOf(req),
      };
      sendSuccess(res, await repository.upsertArtifact(artifact));
    }),
  );

  // — Runtime evidence (read model; ingest is the internal edge's) —
  router.get('/runtime-evidence', read, handle(async (_req, res) => {
    sendSuccess(res, await repository.listRuntimeEvidence());
  }));

  // — Memory (items read-only here; candidates are evidence-backed proposals —
  //   promotion to durable stays a reviewed action, never this edge) —
  router.get('/memory/items', read, handle(async (_req, res) => {
    sendSuccess(res, await repository.listMemoryItems());
  }));

  router.get('/memory/candidates', read, handle(async (_req, res) => {
    sendSuccess(res, await repository.listMemoryCandidates());
  }));

  router.post(
    '/memory/candidates',
    write,
    validateBody(memoryCandidateCreateSchema),
    handle(async (req, res) => {
      const body = req.body as z.infer<typeof memoryCandidateCreateSchema>;
      const candidate: MemoryCandidate = {
        ...body,
        candidateId: body.candidateId ?? randomUUID(),
        status: 'candidate_created',
        proposedBy: body.proposedBy ?? actorOf(req),
        proposedAt: body.proposedAt ?? new Date().toISOString(),
      };
      sendSuccess(res, await repository.upsertMemoryCandidate(candidate));
    }),
  );

  // — Instructions (READ-ONLY: bundles are compiler-produced artifacts) —
  router.get('/instructions', read, handle(async (_req, res) => {
    sendSuccess(res, await repository.listInstructionBundles());
  }));

  router.get(
    '/instructions/:bundleId',
    read,
    validateParams(idParamSchema('bundleId')),
    handle(async (req, res) => {
      const bundles = await repository.listInstructionBundles();
      const bundle = bundles.find((b) => b.bundleId === req.params.bundleId);
      if (!bundle) return notFound(res, 'instruction bundle', req.params.bundleId);
      sendSuccess(res, bundle);
    }),
  );

  // — Policies (READ-ONLY: decisions are governance-gate-produced) —
  router.get('/policies', read, handle(async (_req, res) => {
    sendSuccess(res, await repository.listPolicyDecisions());
  }));

  router.get(
    '/policies/:decisionId',
    read,
    validateParams(idParamSchema('decisionId')),
    handle(async (req, res) => {
      const decisions = await repository.listPolicyDecisions();
      const decision = decisions.find((d) => d.decisionId === req.params.decisionId);
      if (!decision) return notFound(res, 'policy decision', req.params.decisionId);
      sendSuccess(res, decision);
    }),
  );

  // — Events (append-only log read; ingest is the internal edge's) —
  router.get(
    '/events',
    read,
    validateQuery(eventsQuerySchema),
    handle(async (req, res) => {
      const query = req.query as z.infer<typeof eventsQuerySchema>;
      let events: RunEvent[] = await repository.listEvents();
      if (query.taskId) events = events.filter((e) => e.taskId === query.taskId);
      if (query.runId) events = events.filter((e) => e.runId === query.runId);
      sendSuccess(res, events);
    }),
  );

  return router;
}

function notFound(res: Response, kind: string, id: string): void {
  sendError(res, createError(ErrorCode.NOT_FOUND, `${kind} not found: ${id}`));
}
