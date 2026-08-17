/**
 * Concrete `ApprovalRepository` + `WorkLockRepository` over the persistence
 * `QueryExecutor` (`governance_approvals`, `governance_work_locks`).
 *
 * Work-lock acquisition is deny-biased and race-safe: it takes a per-path
 * transaction-scoped advisory lock, reclaims an expired-but-unreleased lock, and
 * only then inserts — so the partial unique index (`one active exclusive lock
 * per path`) is never violated by a benign expiry and concurrent acquires
 * serialize. All SQL is parameterized `:param`.
 */
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type {
  ApprovalRepository,
  ApprovalRequestInput,
  ApprovalDecisionInput,
  ApprovalQuery,
} from '../ports/approval-repo.port.js';
import type {
  WorkLockRepository,
  WorkLockAcquireInput,
  WorkLockAcquireResult,
} from '../ports/worklock-repo.port.js';
import type { ApprovalRecord, ApprovalStatus, RiskTier, WorkLock } from '../types.js';

// --- approvals ---------------------------------------------------------------

class SqlApprovalRepository implements ApprovalRepository {
  constructor(private readonly qe: QueryExecutor) {}

  async create(input: ApprovalRequestInput): Promise<ApprovalRecord> {
    const row = await this.qe.one<QueryRow>(
      `insert into governance_approvals
         (task_id, run_id, action, target, risk_tier, requested_by, reason, expires_at)
       values (:task_id, :run_id, :action, :target, :risk_tier, :requested_by, :reason, :expires_at)
       returning *`,
      {
        task_id: input.taskId ?? null,
        run_id: input.runId ?? null,
        action: input.action,
        target: input.target ?? null,
        risk_tier: input.riskTier,
        requested_by: input.requestedBy,
        reason: input.reason ?? null,
        expires_at: input.expiresAt ?? null,
      },
    );
    if (!row) throw new Error('governance approval insert returned no row');
    return mapApproval(row);
  }

  async findById(id: string): Promise<ApprovalRecord | null> {
    const row = await this.qe.one<QueryRow>('select * from governance_approvals where id = :id', { id });
    return row ? mapApproval(row) : null;
  }

  async decide(id: string, input: ApprovalDecisionInput): Promise<ApprovalRecord | null> {
    // Only a `pending` record may be decided — idempotent, never re-decides.
    const row = await this.qe.one<QueryRow>(
      `update governance_approvals
          set status = :status, decided_by = :decided_by, reason = coalesce(:reason, reason), decided_at = now()
        where id = :id and status = 'pending'
      returning *`,
      { id, status: input.decision, decided_by: input.decidedBy, reason: input.reason ?? null },
    );
    return row ? mapApproval(row) : null;
  }

  async list(query: ApprovalQuery = {}): Promise<readonly ApprovalRecord[]> {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (query.taskId) {
      conditions.push('task_id = :task_id');
      params.task_id = query.taskId;
    }
    if (query.requestedBy) {
      conditions.push('requested_by = :requested_by');
      params.requested_by = query.requestedBy;
    }
    if (query.status) {
      conditions.push('status = :status');
      params.status = query.status;
    }
    const where = conditions.length ? ` where ${conditions.join(' and ')}` : '';
    params.limit = Math.max(1, Math.min(query.limit ?? 100, 500));
    const rows = await this.qe.read<QueryRow>(
      `select * from governance_approvals${where} order by created_at desc limit :limit`,
      params,
    );
    return rows.map(mapApproval);
  }

  async hasApproval(taskId: string, action: string, requestedBy?: string): Promise<boolean> {
    // WARNING (recoder-4d8i #6): WITHOUT `requestedBy` this answers "is this
    // task+action approved for ANYONE" — do NOT use that as per-actor gate
    // clearance (one user's approval would clear another user's gate on the same
    // task+action). A gate-clearance caller MUST pass `requestedBy` to scope it.
    const params: Record<string, unknown> = { task_id: taskId, action };
    let requestedByClause = '';
    if (requestedBy) {
      requestedByClause = ' and requested_by = :requested_by';
      params.requested_by = requestedBy;
    }
    const row = await this.qe.one<QueryRow>(
      `select 1 as ok from governance_approvals
        where task_id = :task_id and action = :action and status = 'approved'${requestedByClause}
          and (expires_at is null or expires_at > now())
        limit 1`,
      params,
    );
    return row != null;
  }
}

/** Build the approval repository over a `QueryExecutor`. */
export function createApprovalRepository(qe: QueryExecutor): ApprovalRepository {
  return new SqlApprovalRepository(qe);
}

// --- work locks --------------------------------------------------------------

class SqlWorkLockRepository implements WorkLockRepository {
  constructor(private readonly qe: QueryExecutor) {}

  async acquire(input: WorkLockAcquireInput): Promise<WorkLockAcquireResult> {
    const mode = input.mode ?? 'exclusive';
    return this.qe.withTransaction(async (tx) => {
      // Serialize per-path so a concurrent acquire cannot slip between the
      // conflict check and the insert (the partial unique index is the backstop).
      await tx.execute('select pg_advisory_xact_lock(hashtext(:path))', { path: input.resourcePath });

      // Reclaim any expired-but-unreleased lock on this path so it stops
      // occupying the partial unique index.
      await tx.mutate(
        `update governance_work_locks
            set released_at = now()
          where resource_path = :path and released_at is null and expires_at <= now()`,
        { path: input.resourcePath },
      );

      // A live (unexpired, unreleased) exclusive lock blocks any acquire; a live
      // exclusive also blocks a shared acquire. Two shared locks may coexist.
      const blocking = await tx.one<QueryRow>(
        `select * from governance_work_locks
          where resource_path = :path and released_at is null and expires_at > now()
            and (mode = 'exclusive' or :mode = 'exclusive')
          order by acquired_at asc limit 1`,
        { path: input.resourcePath, mode },
      );
      if (blocking) {
        return {
          acquired: false,
          lock: mapLock(blocking),
          conflictReason: `resource '${input.resourcePath}' is locked (${String(blocking.mode)}) by ${String(blocking.holder_agent_id)}`,
        };
      }

      const inserted = await tx.one<QueryRow>(
        `insert into governance_work_locks
           (resource_path, holder_agent_id, task_id, mode, expires_at)
         values (:path, :holder, :task_id, :mode, :expires_at)
         returning *`,
        {
          path: input.resourcePath,
          holder: input.holderAgentId,
          task_id: input.taskId ?? null,
          mode,
          expires_at: input.expiresAt,
        },
      );
      if (!inserted) throw new Error('governance work-lock insert returned no row');
      return { acquired: true, lock: mapLock(inserted) };
    });
  }

  async release(id: string, holderAgentId: string): Promise<boolean> {
    const count = await this.qe.mutate(
      `update governance_work_locks set released_at = now()
        where id = :id and holder_agent_id = :holder and released_at is null`,
      { id, holder: holderAgentId },
    );
    return count > 0;
  }

  async activeLockFor(resourcePath: string): Promise<WorkLock | null> {
    const row = await this.qe.one<QueryRow>(
      `select * from governance_work_locks
        where resource_path = :path and released_at is null and expires_at > now()
        order by (mode = 'exclusive') desc, acquired_at asc limit 1`,
      { path: resourcePath },
    );
    return row ? mapLock(row) : null;
  }

  async listActive(query: { holderAgentId?: string; taskId?: string } = {}): Promise<readonly WorkLock[]> {
    const conditions = ['released_at is null', 'expires_at > now()'];
    const params: Record<string, unknown> = {};
    if (query.holderAgentId) {
      conditions.push('holder_agent_id = :holder');
      params.holder = query.holderAgentId;
    }
    if (query.taskId) {
      conditions.push('task_id = :task_id');
      params.task_id = query.taskId;
    }
    const rows = await this.qe.read<QueryRow>(
      `select * from governance_work_locks where ${conditions.join(' and ')} order by acquired_at desc`,
      params,
    );
    return rows.map(mapLock);
  }
}

/** Build the work-lock repository over a `QueryExecutor`. */
export function createWorkLockRepository(qe: QueryExecutor): WorkLockRepository {
  return new SqlWorkLockRepository(qe);
}

// --- row mapping -------------------------------------------------------------

function mapApproval(row: QueryRow): ApprovalRecord {
  return {
    id: String(row.id),
    taskId: (row.task_id as string | null) ?? null,
    runId: (row.run_id as string | null) ?? null,
    action: String(row.action),
    target: (row.target as string | null) ?? null,
    riskTier: row.risk_tier as RiskTier,
    status: row.status as ApprovalStatus,
    requestedBy: String(row.requested_by),
    decidedBy: (row.decided_by as string | null) ?? null,
    reason: (row.reason as string | null) ?? null,
    expiresAt: toIsoOrNull(row.expires_at),
    decidedAt: toIsoOrNull(row.decided_at),
    createdAt: toIso(row.created_at),
  };
}

function mapLock(row: QueryRow): WorkLock {
  return {
    id: String(row.id),
    resourcePath: String(row.resource_path),
    holderAgentId: String(row.holder_agent_id),
    taskId: (row.task_id as string | null) ?? null,
    mode: row.mode as 'exclusive' | 'shared',
    acquiredAt: toIso(row.acquired_at),
    expiresAt: toIso(row.expires_at),
    releasedAt: toIsoOrNull(row.released_at),
  };
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function toIsoOrNull(value: unknown): string | null {
  if (value == null) return null;
  return toIso(value);
}
