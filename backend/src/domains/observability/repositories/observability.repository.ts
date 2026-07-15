/**
 * The concrete observability repositories over the injected {@link QueryExecutor}.
 * All access is parameterized `:param` SQL (never string interpolation), app-layer
 * space-scoped (`WHERE space_id = :spaceId`). Degrade-safe: without a connectable
 * pool the executor throws, and the composer keeps the module serving (health
 * still reports; reads surface `SERVICE_UNAVAILABLE` at the route) — never a faked
 * row.
 *
 * Also exports {@link PgAuditReader} — the READ-only seam the audit-XDR projection
 * reads `governance_audit` rows through (governance still OWNS the chain; this only
 * reads it, and the projection re-verifies the Merkle proof before returning any).
 */
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type { AuditReader } from '../adapters/audit-xdr.adapter.js';
import type {
  AlertEvent,
  AlertRule,
  AlertSeverity,
  AlertStatus,
  DispositionState,
  SignalDisposition,
  SloTarget,
  WorkSignalKind,
  XdrQuery,
  XdrRecord,
} from '../types.js';
import type {
  AlertRepository,
  SignalDispositionRepository,
  SloRepository,
} from '../ports/observability.repository.js';

// --- row mappers ------------------------------------------------------------

function iso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}
function isoReq(v: unknown): string {
  return iso(v) ?? new Date().toISOString();
}
function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapSlo(row: QueryRow): SloTarget {
  return {
    id: String(row.id),
    spaceId: String(row.space_id),
    name: String(row.name),
    target: Number(row.target),
    windowSecs: Number(row.window_secs),
    metricQuery: String(row.metric_query),
    createdAt: isoReq(row.created_at),
  };
}

function mapRule(row: QueryRow): AlertRule {
  return {
    id: String(row.id),
    spaceId: String(row.space_id),
    name: String(row.name),
    severity: String(row.severity) as AlertSeverity,
    expr: String(row.expr),
    forSecs: Number(row.for_secs),
    notifyRoute: String(row.notify_route),
    enabled: Boolean(row.enabled),
    createdAt: isoReq(row.created_at),
  };
}

function mapEvent(row: QueryRow): AlertEvent {
  return {
    id: String(row.id),
    ruleId: String(row.rule_id),
    spaceId: String(row.space_id),
    status: String(row.status) as AlertStatus,
    value: numOrNull(row.value),
    firedAt: isoReq(row.fired_at),
    ackedAt: iso(row.acked_at),
    ackedBy: row.acked_by == null ? null : String(row.acked_by),
    resolvedAt: iso(row.resolved_at),
    auditRef: row.audit_ref == null ? null : String(row.audit_ref),
  };
}

function mapDisposition(row: QueryRow): SignalDisposition {
  return {
    id: String(row.id),
    signalId: String(row.signal_id),
    spaceId: String(row.space_id),
    runId: row.run_id == null ? null : String(row.run_id),
    kind: String(row.kind) as WorkSignalKind,
    disposition: String(row.disposition) as DispositionState,
    decidedBy: row.decided_by == null ? null : String(row.decided_by),
    decidedAt: iso(row.decided_at),
    auditRef: row.audit_ref == null ? null : String(row.audit_ref),
    createdAt: isoReq(row.created_at),
  };
}

// --- SLO --------------------------------------------------------------------

export function createSloRepository(executor: QueryExecutor): SloRepository {
  return {
    async listTargets(spaceId) {
      const rows = await executor.read(
        `SELECT * FROM slo_targets WHERE space_id = :spaceId ORDER BY name ASC`,
        { spaceId },
      );
      return rows.map(mapSlo);
    },
    async upsertTarget(t) {
      await executor.mutate(
        `INSERT INTO slo_targets (id, space_id, name, target, window_secs, metric_query, created_at)
         VALUES (:id, :spaceId, :name, :target, :windowSecs, :metricQuery, :createdAt)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, target = EXCLUDED.target,
           window_secs = EXCLUDED.window_secs, metric_query = EXCLUDED.metric_query`,
        {
          id: t.id,
          spaceId: t.spaceId,
          name: t.name,
          target: t.target,
          windowSecs: t.windowSecs,
          metricQuery: t.metricQuery,
          createdAt: t.createdAt,
        },
      );
      return t;
    },
  };
}

// --- Alerts -----------------------------------------------------------------

export function createAlertRepository(executor: QueryExecutor): AlertRepository {
  return {
    async listRules(spaceId) {
      const rows = await executor.read(
        `SELECT * FROM alert_rules WHERE space_id = :spaceId ORDER BY created_at DESC`,
        { spaceId },
      );
      return rows.map(mapRule);
    },
    async listEnabledRules() {
      const rows = await executor.read(`SELECT * FROM alert_rules WHERE enabled = true`);
      return rows.map(mapRule);
    },
    async upsertRule(r) {
      await executor.mutate(
        `INSERT INTO alert_rules (id, space_id, name, severity, expr, for_secs, notify_route, enabled, created_at)
         VALUES (:id, :spaceId, :name, :severity, :expr, :forSecs, :notifyRoute, :enabled, :createdAt)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, severity = EXCLUDED.severity, expr = EXCLUDED.expr,
           for_secs = EXCLUDED.for_secs, notify_route = EXCLUDED.notify_route, enabled = EXCLUDED.enabled`,
        {
          id: r.id,
          spaceId: r.spaceId,
          name: r.name,
          severity: r.severity,
          expr: r.expr,
          forSecs: r.forSecs,
          notifyRoute: r.notifyRoute,
          enabled: r.enabled,
          createdAt: r.createdAt,
        },
      );
      return r;
    },
    async listEvents(spaceId, status) {
      const rows = status
        ? await executor.read(
            `SELECT * FROM alert_events WHERE space_id = :spaceId AND status = :status ORDER BY fired_at DESC`,
            { spaceId, status },
          )
        : await executor.read(
            `SELECT * FROM alert_events WHERE space_id = :spaceId ORDER BY fired_at DESC`,
            { spaceId },
          );
      return rows.map(mapEvent);
    },
    async getEvent(id) {
      const row = await executor.one(`SELECT * FROM alert_events WHERE id = :id`, { id });
      return row ? mapEvent(row) : null;
    },
    async insertEvent(e) {
      await executor.mutate(
        `INSERT INTO alert_events (id, rule_id, space_id, status, value, fired_at, acked_at, acked_by, resolved_at, audit_ref)
         VALUES (:id, :ruleId, :spaceId, :status, :value, :firedAt, :ackedAt, :ackedBy, :resolvedAt, :auditRef)
         ON CONFLICT (id) DO NOTHING`,
        {
          id: e.id,
          ruleId: e.ruleId,
          spaceId: e.spaceId,
          status: e.status,
          value: e.value,
          firedAt: e.firedAt,
          ackedAt: e.ackedAt,
          ackedBy: e.ackedBy,
          resolvedAt: e.resolvedAt,
          auditRef: e.auditRef,
        },
      );
      return e;
    },
    async updateEventStatus(id, patch) {
      await executor.mutate(
        `UPDATE alert_events SET
           status = :status,
           acked_at = COALESCE(:ackedAt, acked_at),
           acked_by = COALESCE(:ackedBy, acked_by),
           resolved_at = COALESCE(:resolvedAt, resolved_at),
           audit_ref = COALESCE(:auditRef, audit_ref)
         WHERE id = :id`,
        {
          id,
          status: patch.status,
          ackedAt: patch.ackedAt ?? null,
          ackedBy: patch.ackedBy ?? null,
          resolvedAt: patch.resolvedAt ?? null,
          auditRef: patch.auditRef ?? null,
        },
      );
      const row = await executor.one(`SELECT * FROM alert_events WHERE id = :id`, { id });
      return row ? mapEvent(row) : null;
    },
    async latestFiring(ruleId) {
      const row = await executor.one(
        `SELECT * FROM alert_events WHERE rule_id = :ruleId ORDER BY fired_at DESC LIMIT 1`,
        { ruleId },
      );
      return row ? mapEvent(row) : null;
    },
  };
}

// --- Signal dispositions ----------------------------------------------------

export function createSignalDispositionRepository(
  executor: QueryExecutor,
): SignalDispositionRepository {
  return {
    async list(spaceId) {
      const rows = await executor.read(
        `SELECT * FROM work_signal_dispositions WHERE space_id = :spaceId ORDER BY created_at DESC`,
        { spaceId },
      );
      return rows.map(mapDisposition);
    },
    async getBySignal(signalId) {
      const row = await executor.one(
        `SELECT * FROM work_signal_dispositions WHERE signal_id = :signalId`,
        { signalId },
      );
      return row ? mapDisposition(row) : null;
    },
    async upsert(d) {
      await executor.mutate(
        `INSERT INTO work_signal_dispositions (id, signal_id, space_id, run_id, kind, disposition, decided_by, decided_at, audit_ref, created_at)
         VALUES (:id, :signalId, :spaceId, :runId, :kind, :disposition, :decidedBy, :decidedAt, :auditRef, :createdAt)
         ON CONFLICT (signal_id) DO UPDATE SET
           disposition = EXCLUDED.disposition, decided_by = EXCLUDED.decided_by,
           decided_at = EXCLUDED.decided_at, audit_ref = EXCLUDED.audit_ref`,
        {
          id: d.id,
          signalId: d.signalId,
          spaceId: d.spaceId,
          runId: d.runId,
          kind: d.kind,
          disposition: d.disposition,
          decidedBy: d.decidedBy,
          decidedAt: d.decidedAt,
          auditRef: d.auditRef,
          createdAt: d.createdAt,
        },
      );
      return d;
    },
    async setDisposition(signalId, patch) {
      await executor.mutate(
        `UPDATE work_signal_dispositions SET
           disposition = :disposition, decided_by = :decidedBy,
           decided_at = :decidedAt, audit_ref = COALESCE(:auditRef, audit_ref)
         WHERE signal_id = :signalId`,
        {
          signalId,
          disposition: patch.disposition,
          decidedBy: patch.decidedBy,
          decidedAt: patch.decidedAt,
          auditRef: patch.auditRef ?? null,
        },
      );
      const row = await executor.one(
        `SELECT * FROM work_signal_dispositions WHERE signal_id = :signalId`,
        { signalId },
      );
      return row ? mapDisposition(row) : null;
    },
  };
}

// --- Audit reader (read-only projection of governance_audit) ----------------

function mapAudit(row: QueryRow): XdrRecord {
  return {
    seq: Number(row.seq),
    actorId: String(row.actor_id),
    action: String(row.action),
    resource: String(row.resource),
    effect: String(row.effect),
    riskTier: String(row.risk_tier),
    degraded: Boolean(row.degraded),
    entryHash: String(row.entry_hash),
    createdAt: isoReq(row.created_at),
  };
}

/**
 * Read-only reader over `governance_audit`. It NEVER mutates the chain; the XDR
 * projection re-verifies the Merkle proof (governance) before any of these rows is
 * returned to a caller.
 */
export class PgAuditReader implements AuditReader {
  constructor(private readonly executor: QueryExecutor) {}

  isAvailable(): boolean {
    return this.executor.isAvailable();
  }

  async readAudit(query: XdrQuery): Promise<readonly XdrRecord[]> {
    const limit = Math.min(Math.max(1, query.limit ?? 100), 500);
    const rows = await this.executor.read(
      `SELECT seq, actor_id, action, resource, effect, risk_tier, degraded, entry_hash, created_at
         FROM governance_audit
        WHERE (:actorId::text IS NULL OR actor_id = :actorId)
          AND (:action::text IS NULL OR action = :action)
          AND (:effect::text IS NULL OR effect = :effect)
        ORDER BY seq DESC
        LIMIT :limit`,
      {
        actorId: query.actorId ?? null,
        action: query.action ?? null,
        effect: query.effect ?? null,
        limit,
      },
    );
    return rows.map(mapAudit);
  }
}
