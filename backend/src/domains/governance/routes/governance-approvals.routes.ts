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
 * Security posture (cross-tenant IDOR — see `governance-access.ts`):
 *  - Mutating routes use `authenticateMutating` (a real, non-anonymous principal).
 *  - The ACTOR/OWNER (`requestedBy`, `decidedBy`, lock `holderAgentId`) is bound to
 *    the resolved {@link Principal}, NEVER trusted from the request body/query — a
 *    non-privileged caller can only act as / see ITS OWN subject. `decide` is
 *    authorized to the approval's owner (or admin/internal); a foreign approval is
 *    a no-oracle 404. The list edges are forced to the caller's own id; the locks
 *    holder is the caller. An `admin`/`internal` operator may target any subject,
 *    and `RECODER_SOLO_MODE` (one local user) fails OPEN. This mirrors the MCP
 *    twins (`governance_approval_decide` / `governance_release_lock` /
 *    `resolveActor` / `resolveLockHolderScope`).
 *  - A lock conflict is a truthful `{ acquired: false, lock, conflictReason }`
 *    200 (the acquire ran; the outcome is "not acquired"), never a faked success.
 *  - All bodies validated fail-fast with the uniform `sendError` envelope.
 */
import { Router } from 'express';
import { ErrorCode, createError, sendError, sendSuccess, asyncHandler } from '../../../shared/errors.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { ApprovalService } from '../services/approval.service.js';
import type { WorkLockService } from '../services/work-lock.service.js';
import type { ApprovalStatus, RiskTier } from '../types.js';
import { canDecideApproval, resolveOwnerScope } from './governance-access.js';

export interface GovernanceApprovalsRouterDeps {
  readonly approvals: ApprovalService;
  readonly workLocks: WorkLockService;
  readonly middleware: AuthMiddleware;
  /**
   * Solo/desktop single-user mode (bootstrap-injected from `RECODER_SOLO_MODE`
   * via `cfg.soloMode`). When true the actor/owner scoping fails OPEN — the one
   * local user is never locked out. A cloud deploy never sets it and keeps the
   * per-tenant enforcement below.
   */
  readonly soloMode?: boolean;
}

const APPROVAL_STATUSES: readonly ApprovalStatus[] = ['pending', 'approved', 'denied', 'expired'];

/** Build the approvals + locks router (mount under `/api/agent-os`). */
export function buildGovernanceApprovalsRouter(deps: GovernanceApprovalsRouterDeps): Router {
  const router = Router();
  const { approvals, workLocks, middleware } = deps;
  const access = { soloMode: deps.soloMode === true };

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
        target: optionalString(body, 'target') ?? null,
        ttlMs: optionalNumber(body, 'ttlMs'),
        expiresAt: optionalString(body, 'expiresAt') ?? null,
      });
      sendSuccess(res, { approval: record }, { statusCode: 201 });
    }),
  );

  // List approvals, optionally filtered by task / requester / status. The
  // `requestedBy` scope is FORCED to the caller's own id for a non-privileged
  // principal (an unscoped list would leak every tenant's approvals); an
  // admin/internal operator (or solo mode) may pass an arbitrary requester or
  // list all.
  router.get(
    '/approvals',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const status = queryStatus(req.query.status);
      const requestedBy = resolveOwnerScope(
        req.principal!,
        typeof req.query.requestedBy === 'string' ? req.query.requestedBy : undefined,
        access,
      );
      const records = await approvals.list({
        ...(typeof req.query.taskId === 'string' ? { taskId: req.query.taskId } : {}),
        ...(requestedBy != null ? { requestedBy } : {}),
        ...(status ? { status } : {}),
        ...(queryLimit(req.query.limit) != null ? { limit: queryLimit(req.query.limit)! } : {}),
      });
      sendSuccess(res, { approvals: records });
    }),
  );

  // Fetch a single approval's status. Owner-scoped like decide: only the owner
  // (requestedBy), a privileged operator, or solo mode may read it. A foreign (or
  // absent) id is a byte-identical 404 — no cross-tenant existence/status oracle.
  router.get(
    '/approvals/:id',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const record = await approvals.get(req.params.id);
      if (!record || !canDecideApproval(req.principal!, record, access)) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'approval not found'));
        return;
      }
      sendSuccess(res, { approval: record });
    }),
  );

  // Approve / deny a pending approval. The decider must be AUTHORIZED for this
  // specific approval — an admin/internal operator, solo mode, or the approval's
  // own requester. A foreign (or genuinely-absent) approval is a byte-identical
  // 404 with no existence oracle, so a caller cannot probe other tenants' gates
  // nor self-clear/DoS one they do not own. Decider identity is bound to the
  // principal (never the body). Mirrors the MCP `governance_approval_decide` twin.
  router.post(
    '/approvals/:id/decide',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const existing = await approvals.get(req.params.id);
      if (!existing || !canDecideApproval(req.principal!, existing, access)) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'approval not found'));
        return;
      }
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

  // Acquire a work lock on a resource path. Holder is BOUND to the authenticated
  // principal — a non-privileged caller cannot forge a lock under a foreign
  // holder (a body `holderAgentId` is ignored for it). Only an admin/internal
  // operator (or solo mode) may name an explicit holder. Mirrors `resolveActor`.
  router.post(
    '/locks',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const resourcePath = requireString(body, 'resourcePath');
      const holderAgentId =
        resolveOwnerScope(req.principal!, optionalString(body, 'holderAgentId'), access) ??
        req.principal!.userId;
      const result = await workLocks.acquire({
        resourcePath,
        holderAgentId,
        taskId: optionalString(body, 'taskId') ?? null,
        mode: requireMode(body),
        ttlMs: optionalNumber(body, 'ttlMs'),
        ...(optionalString(body, 'expiresAt') ? { expiresAt: optionalString(body, 'expiresAt')! } : {}),
      });
      // Truthful: a conflict is a well-formed result, not a thrown error.
      sendSuccess(res, result, { statusCode: result.acquired ? 201 : 200 });
    }),
  );

  // List active locks. The `holderAgentId` scope is FORCED to the caller's own id
  // for a non-privileged principal (an unscoped list would enumerate every
  // tenant's active work); an admin/internal operator (or solo mode) may target
  // an arbitrary holder or list all. Mirrors `resolveLockHolderScope`.
  router.get(
    '/locks',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const holderAgentId = resolveOwnerScope(
        req.principal!,
        typeof req.query.holderAgentId === 'string' ? req.query.holderAgentId : undefined,
        access,
      );
      const locks = await workLocks.listActive({
        ...(holderAgentId != null ? { holderAgentId } : {}),
        ...(typeof req.query.taskId === 'string' ? { taskId: req.query.taskId } : {}),
      });
      sendSuccess(res, { locks });
    }),
  );

  // Release a held lock. Holder is BOUND to the authenticated principal — a
  // non-privileged caller cannot release a victim's lock by naming them in the
  // body (a body `holderAgentId` is ignored for it). Only an admin/internal
  // operator (or solo mode) may release on behalf of an explicit holder. A
  // foreign/absent lock returns a no-oracle 404. Mirrors `governance_release_lock`.
  router.delete(
    '/locks/:id',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const body = asObject(req.body);
      const holderAgentId =
        resolveOwnerScope(req.principal!, optionalString(body, 'holderAgentId'), access) ??
        req.principal!.userId;
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
