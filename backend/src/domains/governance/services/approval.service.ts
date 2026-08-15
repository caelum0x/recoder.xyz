/**
 * `ApprovalService` — the control-plane approval-gate lifecycle
 * (request → decide → lookup) that clears the gate's `needs_approval` verdicts.
 *
 * Ported from the reuse target `conductor/delivery-approval.ts` (the PR/merge
 * approval flow) and widened behind the governance domain, which OWNS the
 * `governance_approvals` table. A risky action the kernel classifies
 * `needs_approval` proceeds ONLY when a matching `approved` (and un-expired)
 * record exists here — this service is where that record is opened and decided.
 *
 * Merkle audit tie-in (tamper-evident provenance):
 *  - Opening a request seals a `needs_approval` entry into the SAME durable
 *    SHA-256 audit chain the gate writes to (via the optional {@link ApprovalAuditSink},
 *    structurally satisfied by `GovernanceGate.recordAudit`).
 *  - A decision seals an `allow` (approved) or `deny` (denied) entry.
 *  - Audit sealing is BEST-EFFORT here: the approval record itself is the durable
 *    state of record, so a transient audit fault is logged (never fakes success)
 *    but does not roll back a human decision. When no sink is wired the service
 *    degrades safely (record-only, logged).
 *
 * Idempotency: only a `pending` record may be decided; re-deciding a resolved
 * record is a no-op that surfaces as `NOT_FOUND` (the repo never re-decides).
 */
import { AppError, ErrorCode } from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';
import type {
  ApprovalRepository,
  ApprovalQuery,
} from '../ports/approval-repo.port.js';
import {
  type ApprovalRecord,
  type AuditEntryInput,
  type AuditRecord,
  type RiskTier,
  riskTierRank,
} from '../types.js';

/** The default time a `pending` approval stays actionable before it is treated as expired. */
export const DEFAULT_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
/** Lower bound so a request is never born already-expired. */
const MIN_APPROVAL_TTL_MS = 60_000;
/** Upper bound so a stale request cannot linger indefinitely. */
const MAX_APPROVAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const RISK_TIERS: readonly RiskTier[] = ['low', 'medium', 'high', 'critical'];

/**
 * Minimal audit seam — the subset of `GovernanceGate` the approval flow needs to
 * seal decisions into the durable Merkle chain. Kept local + optional so the
 * service does not hard-couple to the gate composed alongside it.
 */
export interface ApprovalAuditSink {
  recordAudit(entry: AuditEntryInput): Promise<AuditRecord>;
}

/** Fields to open a new approval request (service-level; TTL resolved here). */
export interface RequestApprovalParams {
  readonly action: string;
  readonly riskTier: RiskTier;
  readonly requestedBy: string;
  readonly taskId?: string | null;
  readonly runId?: string | null;
  readonly reason?: string | null;
  /**
   * The action's concrete target. Required for every new request; historical
   * null-target rows remain readable but cannot authorize a new decision.
   */
  readonly target: string;
  /** Lease length in ms; clamped to [1m, 30d]. Ignored when `expiresAt` is given. */
  readonly ttlMs?: number;
  /** Explicit ISO-8601 expiry; overrides `ttlMs` when present. */
  readonly expiresAt?: string | null;
}

/** A human decision on a pending approval. */
export interface DecideApprovalParams {
  readonly decision: 'approved' | 'denied';
  readonly decidedBy: string;
  readonly reason?: string | null;
}

export interface ApprovalServiceDeps {
  readonly repo: ApprovalRepository;
  readonly logger: Logger;
  /** Optional durable Merkle audit sink; absent → record-only (logged). */
  readonly audit?: ApprovalAuditSink;
  /** Override the default request TTL (ms). */
  readonly defaultTtlMs?: number;
  /**
   * Solo/desktop mode (bootstrap-injected from `RECODER_SOLO_MODE`, §10.8 — no
   * env read here): degrade `list()` to empty when the DB-less store faults.
   * Default `false` keeps every cloud deploy's truthful failure.
   */
  readonly soloMode?: boolean;
}

export class ApprovalService {
  private readonly repo: ApprovalRepository;
  private readonly log: Logger;
  private readonly audit?: ApprovalAuditSink;
  private readonly defaultTtlMs: number;
  private readonly soloMode: boolean;

  constructor(deps: ApprovalServiceDeps) {
    this.repo = deps.repo;
    this.log = deps.logger;
    if (deps.audit) this.audit = deps.audit;
    this.defaultTtlMs = clampTtl(deps.defaultTtlMs ?? DEFAULT_APPROVAL_TTL_MS);
    this.soloMode = deps.soloMode === true;
  }

  /**
   * Open a new `pending` approval for a risky action and seal a `needs_approval`
   * entry into the durable audit chain (best-effort). Fail-fast on bad input.
   */
  async request(params: RequestApprovalParams): Promise<ApprovalRecord> {
    const action = requireNonEmpty(params.action, 'action');
    const requestedBy = requireNonEmpty(params.requestedBy, 'requestedBy');
    const target = requireNonEmpty(params.target, 'target');
    const riskTier = normalizeTier(params.riskTier);
    const expiresAt = this.resolveExpiry(params);

    const record = await this.repo.create({
      action,
      riskTier,
      requestedBy,
      taskId: params.taskId ?? null,
      runId: params.runId ?? null,
      reason: params.reason ?? null,
      target,
      expiresAt,
    });

    this.log.info(
      { approvalId: record.id, action, target, riskTier, requestedBy, taskId: record.taskId },
      'approval requested',
    );
    await this.seal(record, 'needs_approval', requestedBy);
    return record;
  }

  /**
   * Apply a human decision to a `pending` approval and seal the resulting
   * `allow`/`deny` into the audit chain (best-effort). Idempotent: a record that
   * is absent or already resolved yields `NOT_FOUND` (never re-decided).
   */
  async decide(id: string, params: DecideApprovalParams): Promise<ApprovalRecord> {
    const approvalId = requireNonEmpty(id, 'id');
    const decidedBy = requireNonEmpty(params.decidedBy, 'decidedBy');
    if (params.decision !== 'approved' && params.decision !== 'denied') {
      throw new AppError(ErrorCode.INVALID_INPUT, `decision must be 'approved' or 'denied'`);
    }

    const record = await this.repo.decide(approvalId, {
      decision: params.decision,
      decidedBy,
      reason: params.reason ?? null,
    });
    if (!record) {
      // Absent, or not `pending` (already decided/expired) — never re-decide.
      throw new AppError(ErrorCode.NOT_FOUND, 'no pending approval with that id');
    }

    this.log.info(
      { approvalId: record.id, decision: params.decision, decidedBy, action: record.action },
      'approval decided',
    );
    await this.seal(record, params.decision === 'approved' ? 'allow' : 'deny', decidedBy);
    return record;
  }

  /** Fetch an approval by id, or `null` when absent. */
  async get(id: string): Promise<ApprovalRecord | null> {
    return this.repo.findById(requireNonEmpty(id, 'id'));
  }

  /** List approvals matching the filter, newest first. */
  async list(query: ApprovalQuery = {}): Promise<readonly ApprovalRecord[]> {
    // Solo/desktop mode (bootstrap-injected `soloMode`): no durable approval
    // store (no DB), and governance auto-clears `needs_approval` locally, so
    // there is nothing to list. Degrade to empty instead of surfacing the
    // store's "database is unavailable" 503 (which read as a broken Approvals
    // panel). A cloud deploy never enables solo mode and keeps the truthful failure.
    if (this.soloMode) {
      try {
        return await this.repo.list(query);
      } catch {
        return [];
      }
    }
    return this.repo.list(query);
  }

  /**
   * Whether an actionable `approved` (un-expired) record exists for a task+action
   * — the evidence a caller passes to clear a `needs_approval` gate verdict.
   */
  async hasApproval(taskId: string, action: string): Promise<boolean> {
    if (!taskId || !action) return false;
    return this.repo.hasApproval(taskId, action);
  }

  // --- internals -------------------------------------------------------------

  /** Seal an approval lifecycle event into the durable Merkle chain (best-effort). */
  private async seal(
    record: ApprovalRecord,
    effect: 'allow' | 'deny' | 'needs_approval',
    actorId: string,
  ): Promise<void> {
    if (!this.audit) return; // degrade-safe: no audit sink wired
    try {
      await this.audit.recordAudit({
        actorId,
        action: record.action,
        resource: `approval:${record.id}`,
        effect,
        riskTier: record.riskTier,
        degraded: false,
        payload: {
          approvalId: record.id,
          status: record.status,
          taskId: record.taskId,
          runId: record.runId,
          requestedBy: record.requestedBy,
          decidedBy: record.decidedBy,
          // Free-form reason is operator text, not secret material.
          reason: record.reason,
        },
      });
    } catch (err) {
      // The approval record is the durable state of record; a transient audit
      // fault is logged, never faked as success and never rolled back.
      this.log.warn(
        { err, approvalId: record.id, effect },
        'approval audit seal failed (record persisted; chain entry missing)',
      );
    }
  }

  /** Resolve a concrete ISO-8601 expiry from an explicit value or a clamped TTL. */
  private resolveExpiry(params: RequestApprovalParams): string {
    if (params.expiresAt) {
      const when = Date.parse(params.expiresAt);
      if (Number.isNaN(when)) {
        throw new AppError(ErrorCode.INVALID_INPUT, 'expiresAt must be a valid ISO-8601 timestamp');
      }
      if (when <= Date.now()) {
        throw new AppError(ErrorCode.INVALID_INPUT, 'expiresAt must be in the future');
      }
      return new Date(when).toISOString();
    }
    const ttl = params.ttlMs != null ? clampTtl(params.ttlMs) : this.defaultTtlMs;
    return new Date(Date.now() + ttl).toISOString();
  }
}

/** Build the approval service over an {@link ApprovalRepository}. */
export function createApprovalService(deps: ApprovalServiceDeps): ApprovalService {
  return new ApprovalService(deps);
}

/** Clamp a requested TTL into the safe approval window. */
function clampTtl(ttlMs: number): number {
  if (!Number.isFinite(ttlMs)) return DEFAULT_APPROVAL_TTL_MS;
  return Math.max(MIN_APPROVAL_TTL_MS, Math.min(Math.trunc(ttlMs), MAX_APPROVAL_TTL_MS));
}

/** Validate + narrow a risk tier, or throw a fail-fast validation error. */
function normalizeTier(tier: RiskTier): RiskTier {
  if (typeof tier !== 'string' || !RISK_TIERS.includes(tier)) {
    throw new AppError(ErrorCode.INVALID_INPUT, `riskTier must be one of: ${RISK_TIERS.join(', ')}`);
  }
  // Touch the rank helper so the risk vocabulary stays the single source of truth.
  void riskTierRank(tier);
  return tier;
}

/** Require a non-empty trimmed string, or throw a fail-fast validation error. */
function requireNonEmpty(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(ErrorCode.MISSING_REQUIRED_FIELD, `"${field}" is required`);
  }
  return value.trim();
}
