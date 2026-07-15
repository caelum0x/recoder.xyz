/**
 * Concrete `AuditRepository` over the persistence `QueryExecutor` — the durable,
 * append-only SHA-256 Merkle chain (`governance_audit`).
 *
 * APPEND ATOMICITY: `append` runs in a single transaction that takes a
 * transaction-scoped advisory lock, reads the current tip, seals the entry
 * against THAT tip, and inserts — so two concurrent appends serialize and the
 * chain can never fork. The DB rules (`do instead nothing` on update/delete)
 * make the rows immutable; `verifyChain` re-walks to catch any bypassing tamper.
 *
 * All SQL is parameterized `:param` (never interpolated). Append-only: this repo
 * exposes no update/delete of chain rows.
 */
import { AppError, ErrorCode } from '../../../shared/errors.js';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type { AuditRepository, AuditRangeQuery, AuditSealer } from '../ports/audit-repo.port.js';
import {
  AUDIT_GENESIS_HASH,
  type AuditEntryInput,
  type AuditRecord,
  type AuditVerification,
  type GovernanceEffect,
  type RiskTier,
} from '../types.js';

/** Stable advisory-lock key that serializes chain appends (any 32-bit constant). */
const AUDIT_LOCK_KEY = 748_301_133;

const DEFAULT_RANGE_LIMIT = 200;

class SqlAuditRepository implements AuditRepository {
  constructor(private readonly qe: QueryExecutor) {}

  async append(entry: AuditEntryInput, seal: AuditSealer): Promise<AuditRecord> {
    return this.qe.withTransaction(async (tx) => {
      // Serialize appends: only one transaction may seal at a time, so the tip
      // each reads is never stale relative to another in-flight append.
      await tx.execute('select pg_advisory_xact_lock(:key)', { key: AUDIT_LOCK_KEY });

      const tipRow = await tx.one<QueryRow>(
        'select entry_hash from governance_audit order by seq desc limit 1',
      );
      const prevHash = typeof tipRow?.entry_hash === 'string' ? tipRow.entry_hash : AUDIT_GENESIS_HASH;
      const entryHash = seal(prevHash, entry);

      const inserted = await tx.one<QueryRow>(
        `insert into governance_audit
           (prev_hash, entry_hash, actor_id, action, resource, effect, risk_tier, degraded, payload)
         values
           (:prev_hash, :entry_hash, :actor_id, :action, :resource, :effect, :risk_tier, :degraded, :payload::jsonb)
         returning *`,
        {
          prev_hash: prevHash,
          entry_hash: entryHash,
          actor_id: entry.actorId,
          action: entry.action,
          resource: entry.resource,
          effect: entry.effect,
          risk_tier: entry.riskTier,
          degraded: entry.degraded,
          payload: JSON.stringify(entry.payload ?? {}),
        },
      );
      if (!inserted) {
        throw new AppError(ErrorCode.INTERNAL_ERROR, 'governance audit insert returned no row');
      }
      return mapAuditRow(inserted);
    });
  }

  async tip(): Promise<AuditRecord | null> {
    const row = await this.qe.one<QueryRow>('select * from governance_audit order by seq desc limit 1');
    return row ? mapAuditRow(row) : null;
  }

  async range(query: AuditRangeQuery = {}): Promise<readonly AuditRecord[]> {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (typeof query.fromSeq === 'number') {
      conditions.push('seq >= :from_seq');
      params.from_seq = query.fromSeq;
    }
    if (typeof query.toSeq === 'number') {
      conditions.push('seq <= :to_seq');
      params.to_seq = query.toSeq;
    }
    if (query.actorId) {
      conditions.push('actor_id = :actor_id');
      params.actor_id = query.actorId;
    }
    const where = conditions.length ? ` where ${conditions.join(' and ')}` : '';
    params.limit = Math.max(1, Math.min(query.limit ?? DEFAULT_RANGE_LIMIT, 1000));
    const rows = await this.qe.read<QueryRow>(
      `select * from governance_audit${where} order by seq asc limit :limit`,
      params,
    );
    return rows.map(mapAuditRow);
  }

  async verifyChain(seal: AuditSealer): Promise<AuditVerification> {
    // Walk the whole chain in seq order, re-deriving each hash and checking the
    // prev/entry linkage. A single mismatch or gap breaks the chain.
    const rows = await this.qe.read<QueryRow>('select * from governance_audit order by seq asc');
    let prevHash = AUDIT_GENESIS_HASH;
    let tipHash = AUDIT_GENESIS_HASH;
    for (const raw of rows) {
      const record = mapAuditRow(raw);
      const expected = seal(prevHash, toEntryInput(record));
      if (record.prevHash !== prevHash || record.entryHash !== expected) {
        return { ok: false, brokenAtSeq: record.seq, tipHash, entries: rows.length };
      }
      prevHash = record.entryHash;
      tipHash = record.entryHash;
    }
    return { ok: true, tipHash, entries: rows.length };
  }
}

/** Build the durable audit repository over a `QueryExecutor`. */
export function createAuditRepository(qe: QueryExecutor): AuditRepository {
  return new SqlAuditRepository(qe);
}

// --- row mapping -------------------------------------------------------------

function mapAuditRow(row: QueryRow): AuditRecord {
  return {
    id: String(row.id),
    seq: Number(row.seq),
    prevHash: String(row.prev_hash),
    entryHash: String(row.entry_hash),
    actorId: String(row.actor_id),
    action: String(row.action),
    resource: String(row.resource),
    effect: row.effect as GovernanceEffect,
    riskTier: row.risk_tier as RiskTier,
    degraded: Boolean(row.degraded),
    payload: coerceJson(row.payload),
    createdAt: toIso(row.created_at),
  };
}

/** The subset re-hashed during verification (must match what `append` sealed). */
function toEntryInput(record: AuditRecord): AuditEntryInput {
  return {
    actorId: record.actorId,
    action: record.action,
    resource: record.resource,
    effect: record.effect,
    riskTier: record.riskTier,
    degraded: record.degraded,
    payload: record.payload,
  };
}

function coerceJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}
