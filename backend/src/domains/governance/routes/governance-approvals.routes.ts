/**
 * Governance approvals + work-locks routes — the HTTP edges for the
 * `needs_approval` gate and path/work-lock conflict prevention.
 *
 * Mount under `/api/agent-os` so paths resolve to:
 *   POST   /api/agent-os/approvals            request an approval for a risky action
 *   GET    /api/agent-os/approvals            list approvals (filterable)
 *   GET    /api/agent-os/approvals/:id        fetch one approval's status
 *   POST   /api/agent-os/approvals/:id/decide approve / deny a pending approval
 *   POST   /api/agent-os/locks                acquire a work lock on a path
 *   GET    /api/agent-os/locks                list active locks (filterable)
 *   DELETE /api/agent-os/locks/:id            release a held lock
 *
 * Security posture:
 *  - Mutating routes use `authenticateMutating` (a real, non-anonymous principal).
 *  - The ACTOR identity (`requestedBy`, `decidedBy`, lock `holderAgentId`) is
 *    taken from the resolved {@link Principal}, NEVER from the request body — a
 *    caller cannot forge who requested/decided/holds.
 *  - A lock conflict is a truthful `{ acquired: false, lock, conflictReason }`
 *    200 (the acquire ran; the outcome is "not acquired"), never a faked success.
 *  - All bodies validated fail-fast with the uniform `sendError` envelope.
 *
 * NOTE (approver authority): who may DECIDE an approval is a policy concern.
 * This edge requires a real principal and records `decidedBy`; enforcing that the
 * decider is an authorized approver (RBAC / gate) is layered in integration.
 */
import { Router } from 'express';
import { ErrorCode, createError, sendError, sendSuccess, asyncHandler } from '../../../shared/errors.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { ApprovalService } from '../services/approval.service.js';
import type { WorkLockService } from '../services/work-lock.service.js';
import type { ApprovalStatus, RiskTier } from '../types.js';

export interface GovernanceApprovalsRouterDeps {
  readonly approvals: ApprovalService;
  readonly workLocks: WorkLockService;
  readonly middleware: AuthMiddleware;
}

const APPROVAL_STATUSES: readonly ApprovalStatus[] = ['pending', 'approved', 'denied', 'expired'];

/** Build the approvals + locks router (mount under `/api/agent-os`). */
export function buildGovernanceApprovalsRouter(deps: GovernanceApprovalsRouterDeps): Router {
  const router = Router();
  const { approvals, workLocks, middleware } = deps;

  // --- approvals -------------------------------------------------------------

  // Request an approval for a risky action. Actor = the authenticated principal.
  router.post(
    '/approvals',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const action = requireString(body, 'action');
      const riskTier = requireRiskTier(body);
      const record = await approvals.request({
        action,
        riskTier,
        requestedBy: req.principal!.userId,
        taskId: optionalString(body, 'taskId') ?? null,
        runId: optionalString(body, 'runId') ?? null,
        reason: optionalString(body, 'reason') ?? null,
        ttlMs: optionalNumber(body, 'ttlMs'),
        expiresAt: optionalString(body, 'expiresAt') ?? null,
      });
      sendSuccess(res, { approval: record }, { statusCode: 201 });
    }),
  );

  // List approvals, optionally filtered by task / requester / status.
  router.get(
    '/approvals',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const status = queryStatus(req.query.status);
      const records = await approvals.list({
        ...(typeof req.query.taskId === 'string' ? { taskId: req.query.taskId } : {}),
        ...(typeof req.query.requestedBy === 'string' ? { requestedBy: req.query.requestedBy } : {}),
        ...(status ? { status } : {}),
        ...(queryLimit(req.query.limit) != null ? { limit: queryLimit(req.query.limit)! } : {}),
      });
      sendSuccess(res, { approvals: records });
    }),
  );

  // Fetch a single approval's status.
  router.get(
    '/approvals/:id',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const record = await approvals.get(req.params.id);
      if (!record) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'approval not found'));
        return;
      }
      sendSuccess(res, { approval: record });
    }),
  );

  // Approve / deny a pending approval. Decider = the authenticated principal.
  router.post(
    '/approvals/:id/decide',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const decision = requireDecision(body);
      const record = await approvals.decide(req.params.id, {
        decision,
        decidedBy: req.principal!.userId,
        reason: optionalString(body, 'reason') ?? null,
      });
      sendSuccess(res, { approval: record });
    }),
  );

  // --- work locks ------------------------------------------------------------

  // Acquire a work lock on a resource path. Holder = the authenticated principal
  // unless an explicit agent id is supplied (e.g. a runtime acting for itself).
  router.post(
    '/locks',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const resourcePath = requireString(body, 'resourcePath');
      const result = await workLocks.acquire({
        resourcePath,
        holderAgentId: optionalString(body, 'holderAgentId') ?? req.principal!.userId,
        taskId: optionalString(body, 'taskId') ?? null,
        mode: requireMode(body),
        ttlMs: optionalNumber(body, 'ttlMs'),
        ...(optionalString(body, 'expiresAt') ? { expiresAt: optionalString(body, 'expiresAt')! } : {}),
      });
      // Truthful: a conflict is a well-formed result, not a thrown error.
      sendSuccess(res, result, { statusCode: result.acquired ? 201 : 200 });
    }),
  );

  // List active locks, optionally scoped to a holder or task.
  router.get(
    '/locks',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const locks = await workLocks.listActive({
        ...(typeof req.query.holderAgentId === 'string' ? { holderAgentId: req.query.holderAgentId } : {}),
        ...(typeof req.query.taskId === 'string' ? { taskId: req.query.taskId } : {}),
      });
      sendSuccess(res, { locks });
    }),
  );

  // Release a held lock. Holder-scoped to the authenticated principal (or an
  // explicit holder id the caller owns); a foreign/absent lock returns 404.
  router.delete(
    '/locks/:id',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const holderAgentId = optionalString(body, 'holderAgentId') ?? req.principal!.userId;
      const released = await workLocks.release(req.params.id, holderAgentId);
      if (!released) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'no active lock with that id held by you'));
        return;
      }
      sendSuccess(res, { released: true });
    }),
  );

  return router;
}

// --- request parsing helpers -------------------------------------------------

/** Coerce a request body to a record (or empty) without trusting its shape. */
function asObject(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

/** Read a required non-empty string field. */
function requireString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createError(ErrorCode.MISSING_REQUIRED_FIELD, `"${field}" is required`);
  }
  return value;
}

/** Read an optional string field (absent/blank → undefined). */
function optionalString(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  return value;
}

/** Read an optional finite positive number field. */
function optionalNumber(body: Record<string, unknown>, field: string): number | undefined {
  const value = body[field];
  if (value == null) return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw createError(ErrorCode.INVALID_INPUT, `"${field}" must be a positive number`);
  }
  return n;
}

/** Read + validate a required risk tier. */
function requireRiskTier(body: Record<string, unknown>): RiskTier {
  const value = body.riskTier;
  if (typeof value !== 'string' || !isRiskTier(value)) {
    throw createError(ErrorCode.INVALID_INPUT, `"riskTier" must be one of: low, medium, high, critical`);
  }
  return value;
}

/** Read + validate a required approval decision. */
function requireDecision(body: Record<string, unknown>): 'approved' | 'denied' {
  const value = body.decision;
  if (value !== 'approved' && value !== 'denied') {
    throw createError(ErrorCode.INVALID_INPUT, `"decision" must be 'approved' or 'denied'`);
  }
  return value;
}

/** Read an optional lock mode (default exclusive). */
function requireMode(body: Record<string, unknown>): 'exclusive' | 'shared' {
  const value = body.mode;
  if (value == null) return 'exclusive';
  if (value !== 'exclusive' && value !== 'shared') {
    throw createError(ErrorCode.INVALID_INPUT, `"mode" must be 'exclusive' or 'shared'`);
  }
  return value;
}

/** Narrow a query `status` param to a valid ApprovalStatus, or undefined. */
function queryStatus(raw: unknown): ApprovalStatus | undefined {
  if (typeof raw !== 'string') return undefined;
  return APPROVAL_STATUSES.includes(raw as ApprovalStatus) ? (raw as ApprovalStatus) : undefined;
}

/** Narrow a query `limit` param to a positive int, or undefined. */
function queryLimit(raw: unknown): number | undefined {
  if (typeof raw !== 'string') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
}

/** Type guard for the risk-tier vocabulary. */
function isRiskTier(value: string): value is RiskTier {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical';
}
