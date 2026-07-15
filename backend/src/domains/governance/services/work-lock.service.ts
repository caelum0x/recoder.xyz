/**
 * `WorkLockService` — path/work-lock acquire / release / check.
 *
 * Ported from the reuse target `conductor/conductor-locks.ts` (the collision-
 * prevention moat) and re-homed behind the governance domain, which OWNS the
 * `governance_work_locks` table. Where the conductor kept lock state in a
 * single-process memory store, this service is DB-backed via the frozen
 * {@link WorkLockRepository} so parallel workspaces across processes can never
 * hold overlapping write scope on the same resource path.
 *
 * Semantics (the conflict-prevention invariant):
 *  - Acquisition is DENY-BIASED: a live exclusive-lock conflict returns
 *    `{ acquired: false, lock: <conflicting> }` (never throws for the conflict).
 *    The repository serializes per-path with an advisory lock + a partial unique
 *    index so two concurrent acquires can never both win.
 *  - Every lock carries a TTL. A lock past `expiresAt` is stale and is reclaimed
 *    on the next acquire for that path (no manual sweep required) — a crashed
 *    holder never wedges a path forever.
 *  - `release` is holder-scoped: only the holding agent may release its lock.
 *
 * Inputs are validated at this boundary (fail-fast) before touching the DB.
 */
import { AppError, ErrorCode } from '../../../shared/errors.js';
import type { Logger } from '../../../shared/logger.js';
import type {
  WorkLockRepository,
  WorkLockAcquireResult,
} from '../ports/worklock-repo.port.js';
import type { WorkLock } from '../types.js';

/** The default lease TTL when a caller does not supply one (matches the conductor's 12h workspace lock). */
export const DEFAULT_WORK_LOCK_TTL_MS = 12 * 60 * 60 * 1000;
/** Lower bound on a lease so a lock is never born already-expired. */
const MIN_WORK_LOCK_TTL_MS = 1_000;
/** Upper bound on a lease so a forgotten lock cannot wedge a path indefinitely. */
const MAX_WORK_LOCK_TTL_MS = 24 * 60 * 60 * 1000;

/** Fields to request a work lock (service-level; TTL resolved here). */
export interface AcquireLockParams {
  readonly resourcePath: string;
  readonly holderAgentId: string;
  readonly taskId?: string | null;
  readonly mode?: 'exclusive' | 'shared';
  /** Lease length in ms; clamped to [1s, 24h]. Ignored when `expiresAt` is given. */
  readonly ttlMs?: number;
  /** Explicit ISO-8601 expiry; overrides `ttlMs` when present. */
  readonly expiresAt?: string;
}

/** Scope filter for listing active locks. */
export interface ListLocksQuery {
  readonly holderAgentId?: string;
  readonly taskId?: string;
}

export interface WorkLockServiceDeps {
  readonly repo: WorkLockRepository;
  readonly logger: Logger;
  /** Override the default lease TTL (ms). */
  readonly defaultTtlMs?: number;
}

export class WorkLockService {
  private readonly repo: WorkLockRepository;
  private readonly log: Logger;
  private readonly defaultTtlMs: number;

  constructor(deps: WorkLockServiceDeps) {
    this.repo = deps.repo;
    this.log = deps.logger;
    this.defaultTtlMs = clampTtl(deps.defaultTtlMs ?? DEFAULT_WORK_LOCK_TTL_MS);
  }

  /**
   * Attempt to acquire a lock on a resource path. Never throws for a conflict —
   * a blocked acquire returns `{ acquired: false, lock: <conflicting> }` so the
   * caller can surface the holder. Throws only on bad input or an infra fault.
   */
  async acquire(params: AcquireLockParams): Promise<WorkLockAcquireResult> {
    const resourcePath = requireNonEmpty(params.resourcePath, 'resourcePath');
    const holderAgentId = requireNonEmpty(params.holderAgentId, 'holderAgentId');
    const mode = params.mode ?? 'exclusive';
    if (mode !== 'exclusive' && mode !== 'shared') {
      throw new AppError(ErrorCode.INVALID_INPUT, `mode must be 'exclusive' or 'shared'`);
    }
    const expiresAt = this.resolveExpiry(params);

    const result = await this.repo.acquire({
      resourcePath,
      holderAgentId,
      taskId: params.taskId ?? null,
      mode,
      expiresAt,
    });

    if (result.acquired) {
      this.log.info(
        { lockId: result.lock?.id, resourcePath, holderAgentId, mode, expiresAt },
        'work lock acquired',
      );
    } else {
      this.log.warn(
        { resourcePath, holderAgentId, mode, conflict: result.conflictReason },
        'work lock conflict — acquire denied',
      );
    }
    return result;
  }

  /**
   * Release a held lock by id. Holder-scoped: returns `false` when the id is
   * unknown, already released, or held by a different agent (never a fake true).
   */
  async release(id: string, holderAgentId: string): Promise<boolean> {
    const lockId = requireNonEmpty(id, 'id');
    const holder = requireNonEmpty(holderAgentId, 'holderAgentId');
    const released = await this.repo.release(lockId, holder);
    if (released) {
      this.log.info({ lockId, holderAgentId: holder }, 'work lock released');
    } else {
      this.log.debug({ lockId, holderAgentId: holder }, 'work lock release no-op (absent/foreign/already released)');
    }
    return released;
  }

  /** The active (unreleased, unexpired) lock covering a path, or `null`. */
  async check(resourcePath: string): Promise<WorkLock | null> {
    const path = requireNonEmpty(resourcePath, 'resourcePath');
    return this.repo.activeLockFor(path);
  }

  /** Whether a path currently has any active lock. */
  async isLocked(resourcePath: string): Promise<boolean> {
    return (await this.check(resourcePath)) != null;
  }

  /** List active locks, optionally scoped to a holder or task. */
  async listActive(query: ListLocksQuery = {}): Promise<readonly WorkLock[]> {
    return this.repo.listActive(query);
  }

  // --- internals -------------------------------------------------------------

  /** Resolve a concrete ISO-8601 expiry from an explicit value or a clamped TTL. */
  private resolveExpiry(params: AcquireLockParams): string {
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

/** Build the work-lock service over a {@link WorkLockRepository}. */
export function createWorkLockService(deps: WorkLockServiceDeps): WorkLockService {
  return new WorkLockService(deps);
}

/** Clamp a requested TTL into the safe lease window. */
function clampTtl(ttlMs: number): number {
  if (!Number.isFinite(ttlMs)) return DEFAULT_WORK_LOCK_TTL_MS;
  return Math.max(MIN_WORK_LOCK_TTL_MS, Math.min(Math.trunc(ttlMs), MAX_WORK_LOCK_TTL_MS));
}

/** Require a non-empty trimmed string, or throw a fail-fast validation error. */
function requireNonEmpty(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(ErrorCode.MISSING_REQUIRED_FIELD, `"${field}" is required`);
  }
  return value.trim();
}
