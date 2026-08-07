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
  type Space,
  type TaskSpec,
} from '@recoder/agent-os';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../../http/middleware/validate.js';
import { sendSuccess, sendError, createError, ErrorCode } from '../../../shared/errors.js';
import type {
  AgentOsRepositoryPort,
  ListPage,
  PageQuery,
} from '../ports/agent-os-repository.port.js';
import {
  spacePolicyToKernelConfigJson,
  type PolicyUpdatedEvent,
} from '../services/policy-update.emitter.js';
import {
  canAccessSpace,
  ownerIdForCreate,
  visibleSpaces,
} from '../services/space-authz.js';
import {
  agentUpsertSchema,
  artifactCreateSchema,
  eventsQuerySchema,
  idParamSchema,
  memoryCandidateCreateSchema,
  paginationQuerySchema,
  runCreateSchema,
  runTransitionSchema,
  spacePolicyPutSchema,
  spaceUpsertSchema,
  taskUpsertSchema,
} from './agent-os-crud.schemas.js';

export interface AgentOsCrudRoutesDeps {
  readonly repository: AgentOsRepositoryPort;
  readonly middleware: AuthMiddleware;
  /**
   * OPTIONAL `policy.updated` sink (§4c): fired AFTER a forbidden/secret-path or
   * approval policy artifact is durably written (space upsert / policy PUT), so
   * the bootstrap hook can hot-swap the governance kernel bundle. Absent ⇒ no
   * emission (unchanged behavior); a fire never blocks the write path.
   */
  readonly onPolicyChange?: (event: PolicyUpdatedEvent) => void;
  /**
   * Solo/desktop mode (bootstrap-injected from `RECODER_SOLO_MODE`). When true
   * the space tenant-scoping guards fail OPEN (single local owner is never
   * locked out). Defaults to false — cloud deploys keep owner-scoped isolation.
   */
  readonly soloMode?: boolean;
  /**
   * OPTIONAL `Idempotency-Key` replay guard (BE-10.3), mounted on exactly the
   * duplicate-spawning `POST /runs` edge AFTER `authenticateMutating` so a client
   * retry replays the original run instead of minting a second one. Absent ⇒
   * identity (no behavior change).
   */
  readonly idempotency?: RequestHandler;
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

/** The validated `{ limit, offset }` bound (`validateQuery` has already coerced + defaulted). */
function pageQueryOf(req: Request): PageQuery {
  const { limit, offset } = req.query as unknown as z.infer<typeof paginationQuerySchema>;
  return { limit, offset };
}

/** The bounded array envelope: `data` stays the list, pagination totals ride in `meta`. */
function sendPage<T>(res: Response, page: ListPage<T>): void {
  sendSuccess(res, page.items, {
    meta: { total: page.total, limit: page.limit, offset: page.offset },
  });
}

/** Build the CRUD edge table (mounted inside the `/api/agent-os` router). */
export function buildAgentOsCrudRouter(deps: AgentOsCrudRoutesDeps): Router {
  const { repository, middleware, onPolicyChange } = deps;
  const soloMode = deps.soloMode ?? false;
  const taskService = new TaskService();
  const router = Router();

  const read = middleware.authenticate;
  const write = middleware.authenticateMutating;
  // Optional Idempotency-Key replay seam (BE-10.3): absent ⇒ identity passthrough.
  const idempotency: RequestHandler = deps.idempotency ?? ((_req, _res, next) => next());

  // — Spaces (tenant-isolated: owner-scoped, with operator + solo bypass) —
  router.get('/spaces', read, validateQuery(paginationQuerySchema), handle(async (req, res) => {
    // Tenant-scope the list: a caller sees only their own spaces (operator/solo
    // see all). Never leak another tenant's spaces. Pagination is applied AFTER
    // the tenant filter (a repo-side page would leak filtered-out holes), with
    // the truthful visible total in `meta`.
    const visible = visibleSpaces(await repository.listSpaces(), req.principal, soloMode);
    const page = pageQueryOf(req);
    sendPage(res, {
      items: visible.slice(page.offset, page.offset + page.limit),
      total: visible.length,
      limit: page.limit,
      offset: page.offset,
    });
  }));

  router.get(
    '/spaces/:spaceId',
    read,
    validateParams(idParamSchema('spaceId')),
    handle(async (req, res) => {
      const spaces = await repository.listSpaces();
      const space = spaces.find((s) => s.spaceId === req.params.spaceId);
      // A non-owned space is indistinguishable from a missing one — 404, no oracle.
      if (!space || !canAccessSpace(space, req.principal, soloMode)) {
        return notFound(res, 'space', req.params.spaceId);
      }
      sendSuccess(res, space);
    }),
  );

  router.post(
    '/spaces',
    write,
    validateBody(spaceUpsertSchema),
    handle(async (req, res) => {
      const body = req.body as z.infer<typeof spaceUpsertSchema>;
      const existing = (await repository.listSpaces()).find((s) => s.spaceId === body.spaceId);
      // An upsert that targets an EXISTING space the caller doesn't own is
      // refused as a 404 (no existence oracle); operator/solo callers bypass.
      if (existing && !canAccessSpace(existing, req.principal, soloMode)) {
        return notFound(res, 'space', body.spaceId);
      }
      const now = new Date().toISOString();
      // Ownership is derived from the authenticated principal — NEVER the body.
      // Create ⇒ stamp the caller; operator/solo overwrite of an existing space
      // ⇒ PRESERVE the tenant owner (no hijack).
      const ownerId = existing ? existing.ownerId : ownerIdForCreate(req.principal);
      const space: Space = {
        ...body,
        ownerId,
        createdAt: existing?.createdAt ?? body.createdAt ?? now,
        updatedAt: now,
      };
      const saved = await repository.upsertSpace(space);
      // A space upsert carries its forbidden/secret-path + approval policy — signal
      // a hot-swap AFTER the durable write (never before; a failed write emits nothing).
      onPolicyChange?.({
        source: `space:${space.spaceId}`,
        configJson: spacePolicyToKernelConfigJson(space.policy),
      });
      sendSuccess(res, saved);
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
      const space = spaces.find((s) => s.spaceId === spaceId);
      // GOVERNANCE-BYPASS FIX: only the space owner (or an operator/solo caller)
      // may rewrite `forbiddenPaths` / approval gates. Unknown OR non-owned ⇒
      // 404 (no oracle) — never let one tenant edit another's policy.
      if (!space || !canAccessSpace(space, req.principal, soloMode)) {
        return notFound(res, 'space', spaceId);
      }
      const policy = req.body as z.infer<typeof spacePolicyPutSchema>;
      const saved = await repository.upsertSpacePolicy(spaceId, policy);
      // The forbidden/secret-path + approval policy changed — hot-swap the kernel
      // bundle AFTER the durable write succeeds.
      onPolicyChange?.({
        source: `space:${spaceId}`,
        configJson: spacePolicyToKernelConfigJson(policy),
      });
      sendSuccess(res, saved);
    }),
  );

  // — Agents —
  router.get('/agents', read, validateQuery(paginationQuerySchema), handle(async (req, res) => {
    sendPage(res, await repository.listAgentsPage(pageQueryOf(req)));
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
      // Owner-scope by the task's space — a foreign/absent id is a 404 no-oracle,
      // mirroring the space edges. (recoder-ctoj: single-record read IDOR)
      const taskSpace = (await repository.listSpaces()).find((s) => s.spaceId === task.spaceId);
      if (!taskSpace || !canAccessSpace(taskSpace, req.principal, soloMode)) {
        return notFound(res, 'task', req.params.taskId);
      }
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
      // Owner-scope by the run's space — a foreign/absent id is a 404 no-oracle,
      // mirroring the space + transition edges. (recoder-ctoj: single-record read IDOR)
      const runSpace = (await repository.listSpaces()).find((s) => s.spaceId === run.spaceId);
      if (!runSpace || !canAccessSpace(runSpace, req.principal, soloMode)) {
        return notFound(res, 'run', req.params.runId);
      }
      sendSuccess(res, run);
    }),
  );

  router.post(
    '/runs',
    write,
    idempotency,
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
      // Owner-scope: the run's space must be accessible to the caller, else this is a
      // cross-tenant IDOR write — forging another tenant's run lifecycle (incl.
      // waiting_for_approval -> approved). 404 no-oracle, mirroring the space edges.
      // (recoder-yb5r; same-tenant approval-gate depth tracked separately.)
      const runSpace = (await repository.listSpaces()).find((s) => s.spaceId === run.spaceId);
      if (!runSpace || !canAccessSpace(runSpace, req.principal, soloMode)) {
        return notFound(res, 'run', req.params.runId);
      }
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
  router.get('/approvals', read, validateQuery(paginationQuerySchema), handle(async (req, res) => {
    sendPage(res, await repository.listApprovalsPage(pageQueryOf(req)));
  }));

  router.get(
    '/approvals/:approvalId',
    read,
    validateParams(idParamSchema('approvalId')),
    handle(async (req, res) => {
      // Repo point read (keyed lookup) — never a list-then-find scan.
      const approval = await repository.getApproval(req.params.approvalId);
      if (!approval) return notFound(res, 'approval', req.params.approvalId);
      sendSuccess(res, approval);
    }),
  );

  // — Artifacts —
  router.get('/artifacts', read, validateQuery(paginationQuerySchema), handle(async (req, res) => {
    sendPage(res, await repository.listArtifactsPage(pageQueryOf(req)));
  }));

  router.get(
    '/artifacts/:artifactId',
    read,
    validateParams(idParamSchema('artifactId')),
    handle(async (req, res) => {
      // Repo point read (keyed lookup) — never a list-then-find scan.
      const artifact = await repository.getArtifact(req.params.artifactId);
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
  router.get('/memory/items', read, validateQuery(paginationQuerySchema), handle(async (req, res) => {
    sendPage(res, await repository.listMemoryItemsPage(pageQueryOf(req)));
  }));

  router.get('/memory/candidates', read, validateQuery(paginationQuerySchema), handle(async (req, res) => {
    sendPage(res, await repository.listMemoryCandidatesPage(pageQueryOf(req)));
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
  router.get('/instructions', read, validateQuery(paginationQuerySchema), handle(async (req, res) => {
    sendPage(res, await repository.listInstructionBundlesPage(pageQueryOf(req)));
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
  router.get('/policies', read, validateQuery(paginationQuerySchema), handle(async (req, res) => {
    sendPage(res, await repository.listPolicyDecisionsPage(pageQueryOf(req)));
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
      // Bounded NEWEST-FIRST page; the taskId/runId filters run IN the driver
      // (WHERE + LIMIT/OFFSET) — never the whole log filtered in JS.
      const query = req.query as unknown as z.infer<typeof eventsQuerySchema>;
      sendPage(
        res,
        await repository.listEventsPage({
          limit: query.limit,
          offset: query.offset,
          ...(query.taskId ? { taskId: query.taskId } : {}),
          ...(query.runId ? { runId: query.runId } : {}),
        }),
      );
    }),
  );

  return router;
}

function notFound(res: Response, kind: string, id: string): void {
  sendError(res, createError(ErrorCode.NOT_FOUND, `${kind} not found: ${id}`));
}
