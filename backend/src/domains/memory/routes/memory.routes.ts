/**
 * Memory routes — the HTTP edges for recall, candidate lifecycle, and relations.
 *
 * Mount under `/api/agent-os` so paths resolve to:
 *   POST   /api/agent-os/memory/recall               fuse recall for a query
 *   GET    /api/agent-os/memory/candidates           list the caller's wisps
 *   POST   /api/agent-os/memory/candidates           propose an evidenced wisp
 *   GET    /api/agent-os/memory/candidates/:id        fetch one wisp
 *   POST   /api/agent-os/memory/candidates/:id/accept promote (GATED) → item
 *   POST   /api/agent-os/memory/candidates/:id/reject reject a wisp
 *   GET    /api/agent-os/memory/relations?from=:id    list a memory's edges
 *   POST   /api/agent-os/memory/relations             relate(from, to, kind)
 *   DELETE /api/agent-os/memory/relations/:id         remove an edge
 *
 * Security posture (mirrors governance routes):
 *  - Reads use `authenticate`; mutations use `authenticateMutating` (real principal).
 *  - The ACTOR (`userId`, `proposedBy`, reviewer) comes from the resolved
 *    {@link Principal}, NEVER from the body — a caller cannot forge identity.
 *  - A gated accept that is not allowed returns a truthful `{ promoted:false, verdict }`
 *    200 (the promotion ran the gate; the outcome is "not promoted"), not a fake success.
 *  - Bodies validated fail-fast with the uniform `sendError` envelope.
 */
import { Router } from 'express';
import { ErrorCode, createError, sendError, sendSuccess, asyncHandler } from '../../../shared/errors.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { RecallService } from '../recall/recall-fusion.js';
import type { CandidateService, MemoryScope } from '../lifecycle/candidate-service.js';
import type { MemoryLifecycle } from '../lifecycle/memory-lifecycle.js';
import type { ForgetService } from '../lifecycle/forget.js';
import type { RelateService } from '../lifecycle/relate.js';

export interface MemoryRouterDeps {
  readonly recall: RecallService;
  readonly candidates: CandidateService;
  readonly lifecycle: MemoryLifecycle;
  readonly forget: ForgetService;
  readonly relations: RelateService;
  readonly middleware: AuthMiddleware;
}

const MEMORY_SCOPES: readonly MemoryScope[] = ['user', 'org', 'space', 'repo', 'path', 'agent', 'task-type'];

/** Build the memory router (mount under `/api/agent-os`). */
export function buildMemoryRouter(deps: MemoryRouterDeps): Router {
  const router = Router();
  const { recall, candidates, lifecycle, forget, relations, middleware } = deps;

  // --- recall ----------------------------------------------------------------

  router.post(
    '/memory/recall',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const query = requireString(body, 'query');
      const result = await recall.recall({
        query,
        userId: req.principal!.userId,
        ...(optionalString(body, 'scope') ? { scope: optionalString(body, 'scope')! } : {}),
        ...(optionalString(body, 'scopeRef') ? { scopeRef: optionalString(body, 'scopeRef')! } : {}),
        ...(optionalNumber(body, 'limit') != null ? { limit: optionalNumber(body, 'limit')! } : {}),
      });
      sendSuccess(res, result);
    }),
  );

  // --- candidates ------------------------------------------------------------

  router.get(
    '/memory/candidates',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const scope = typeof req.query.scope === 'string' ? req.query.scope : undefined;
      const records = await candidates.list(req.principal!.userId, scope);
      sendSuccess(res, { candidates: records });
    }),
  );

  router.post(
    '/memory/candidates',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const evidence = asObject(body.evidence);
      const candidate = await candidates.propose({
        userId: req.principal!.userId,
        scope: requireScope(body),
        title: requireString(body, 'title'),
        body: requireString(body, 'body'),
        proposedBy: req.principal!.userId,
        evidence: {
          taskId: requireString(evidence, 'taskId'),
          artifactId: requireString(evidence, 'artifactId'),
        },
        ...(optionalString(body, 'discoveredFrom') ? { discoveredFrom: optionalString(body, 'discoveredFrom')! } : {}),
        ...(optionalString(body, 'expiresAt') ? { expiresAt: optionalString(body, 'expiresAt')! } : {}),
      });
      sendSuccess(res, { candidate }, { statusCode: 201 });
    }),
  );

  router.get(
    '/memory/candidates/:id',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const candidate = await candidates.get(req.principal!.userId, req.params.id);
      if (!candidate) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'memory candidate not found'));
        return;
      }
      sendSuccess(res, { candidate });
    }),
  );

  // Promote a candidate → durable item. GATED by governance; a non-allow verdict
  // returns a truthful `{ promoted:false, verdict }` (never a fabricated success).
  router.post(
    '/memory/candidates/:id/accept',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const result = await lifecycle.accept({
        userId: req.principal!.userId,
        candidateId: req.params.id,
        principal: req.principal!,
        ...(optionalString(body, 'supersedesMemoryId') ? { supersedesMemoryId: optionalString(body, 'supersedesMemoryId')! } : {}),
        ...(optionalString(body, 'taskId') ? { taskId: optionalString(body, 'taskId')! } : {}),
        ...(optionalString(body, 'runId') ? { runId: optionalString(body, 'runId')! } : {}),
      });
      sendSuccess(res, result);
    }),
  );

  router.post(
    '/memory/candidates/:id/reject',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const result = await lifecycle.reject({
        userId: req.principal!.userId,
        candidateId: req.params.id,
        principal: req.principal!,
        reason: requireString(body, 'reason'),
      });
      sendSuccess(res, result);
    }),
  );

  // --- items -----------------------------------------------------------------

  // Forget a durable memory item. GATED by governance; a non-allow verdict
  // returns a truthful `{ forgotten:false, verdict }` (never a fabricated delete).
  router.post(
    '/memory/items/:id/forget',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const result = await forget.forget({
        userId: req.principal!.userId,
        memoryId: req.params.id,
        principal: req.principal!,
        reason: requireString(body, 'reason'),
        ...(optionalString(body, 'taskId') ? { taskId: optionalString(body, 'taskId')! } : {}),
        ...(optionalString(body, 'runId') ? { runId: optionalString(body, 'runId')! } : {}),
      });
      sendSuccess(res, result);
    }),
  );

  // --- relations -------------------------------------------------------------

  router.get(
    '/memory/relations',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const from = typeof req.query.from === 'string' ? req.query.from : '';
      if (!from) {
        sendError(res, createError(ErrorCode.MISSING_REQUIRED_FIELD, '"from" query param is required'));
        return;
      }
      const records = await relations.list(req.principal!.userId, from);
      sendSuccess(res, { relations: records });
    }),
  );

  router.post(
    '/memory/relations',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const relation = await relations.relate({
        userId: req.principal!.userId,
        fromMemoryId: requireString(body, 'fromMemoryId'),
        toMemoryId: requireString(body, 'toMemoryId'),
        kind: requireString(body, 'kind'),
      });
      sendSuccess(res, { relation }, { statusCode: 201 });
    }),
  );

  router.delete(
    '/memory/relations/:id',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const removed = await relations.unrelate(req.principal!.userId, req.params.id);
      if (!removed) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'no such relation held by you'));
        return;
      }
      sendSuccess(res, { removed: true });
    }),
  );

  return router;
}

// --- request parsing helpers -------------------------------------------------

function asObject(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

function requireString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createError(ErrorCode.MISSING_REQUIRED_FIELD, `"${field}" is required`);
  }
  return value;
}

function optionalString(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  return value;
}

function optionalNumber(body: Record<string, unknown>, field: string): number | undefined {
  const value = body[field];
  if (value == null) return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw createError(ErrorCode.INVALID_INPUT, `"${field}" must be a positive number`);
  }
  return Math.trunc(n);
}

function requireScope(body: Record<string, unknown>): MemoryScope {
  const value = body.scope;
  if (typeof value !== 'string' || !MEMORY_SCOPES.includes(value as MemoryScope)) {
    throw createError(ErrorCode.INVALID_INPUT, `"scope" must be one of: ${MEMORY_SCOPES.join(', ')}`);
  }
  return value as MemoryScope;
}
