/**
 * `PgEngineHealthRepository` — the concrete `EngineHealthRepository` over the
 * persistence `QueryExecutor`. Writes the declared-engine catalog, bounded health
 * snapshots, and governed-restart audit rows with parameterized `:param` SQL.
 *
 * DEGRADE-SAFE: when the executor is unavailable (no pool — a Postgres-less
 * boot), every write is a best-effort no-op and every read returns empty. The
 * seam never crashes; `isDurable()` reports the truth so health can say so.
 */
import type { Logger } from '../../../shared/logger.js';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type {
  EngineHealthLogRow,
  EngineHealthRepository,
  EngineRestartRecord,
} from '../ports/engine-registry.port.js';
import { ENGINE_TABLES } from '../constants.js';
import type { EngineDescriptor, EngineHealth, EngineId, EngineStatus } from '../types.js';

export class PgEngineHealthRepository implements EngineHealthRepository {
  constructor(
    private readonly executor: QueryExecutor,
    private readonly log: Logger,
  ) {}

  isDurable(): boolean {
    return this.executor.isAvailable();
  }

  async upsertRegistry(entry: {
    readonly engineId: EngineId;
    readonly transport: EngineDescriptor['transport'];
    readonly bindingPath?: string | null;
    readonly version?: string | null;
    readonly status: EngineStatus;
    readonly reason?: string | null;
  }): Promise<void> {
    if (!this.executor.isAvailable()) return;
    try {
      await this.executor.mutate(
        `insert into ${ENGINE_TABLES.registry}
           (engine_id, transport, binding_path, version, last_status, last_reason, updated_at)
         values (:engine_id, :transport, :binding_path, :version, :last_status, :last_reason, now())
         on conflict (engine_id) do update
           set transport   = excluded.transport,
               binding_path = excluded.binding_path,
               version      = excluded.version,
               last_status  = excluded.last_status,
               last_reason  = excluded.last_reason,
               updated_at   = now()`,
        {
          engine_id: entry.engineId,
          transport: entry.transport,
          binding_path: entry.bindingPath ?? null,
          version: entry.version ?? null,
          last_status: entry.status,
          last_reason: entry.reason ?? null,
        },
      );
    } catch (err) {
      this.log.warn({ err: message(err), engineId: entry.engineId }, 'engine registry upsert failed (ignored)');
    }
  }

  async recordHealth(health: EngineHealth): Promise<void> {
    if (!this.executor.isAvailable()) return;
    // The health log FK-references engine_registry; ensure the catalog row exists.
    await this.upsertRegistry({
      engineId: health.engineId,
      transport: health.transport,
      bindingPath: health.bindingPath ?? null,
      version: health.version ?? null,
      status: health.status,
      reason: health.reason ?? null,
    });
    try {
      await this.executor.mutate(
        `insert into ${ENGINE_TABLES.healthLog} (engine_id, status, reason, probe_ms, observed_at)
         values (:engine_id, :status, :reason, :probe_ms, now())`,
        {
          engine_id: health.engineId,
          status: health.status,
          reason: health.reason ?? null,
          probe_ms: health.probeMs ?? null,
        },
      );
    } catch (err) {
      this.log.warn({ err: message(err), engineId: health.engineId }, 'engine health log insert failed (ignored)');
    }
  }

  async recordRestart(record: EngineRestartRecord): Promise<void> {
    if (!this.executor.isAvailable()) return;
    try {
      await this.executor.mutate(
        `insert into ${ENGINE_TABLES.restartLog} (engine_id, requested_by, reason, outcome, audit_ref, created_at)
         values (:engine_id, :requested_by, :reason, :outcome, :audit_ref, now())`,
        {
          engine_id: record.engineId,
          requested_by: record.requestedBy,
          reason: record.reason ?? null,
          outcome: record.outcome,
          audit_ref: record.auditRef ?? null,
        },
      );
    } catch (err) {
      this.log.warn({ err: message(err), engineId: record.engineId }, 'engine restart log insert failed (ignored)');
    }
  }

  async recentHealth(engineId: EngineId, limit = 20): Promise<readonly EngineHealthLogRow[]> {
    if (!this.executor.isAvailable()) return [];
    try {
      const rows = await this.executor.read<{
        engine_id: string;
        status: string;
        reason: string | null;
        probe_ms: number | null;
        observed_at: string;
      }>(
        `select engine_id, status, reason, probe_ms, observed_at
           from ${ENGINE_TABLES.healthLog}
          where engine_id = :engine_id
          order by observed_at desc
          limit :limit`,
        { engine_id: engineId, limit },
      );
      return rows.map((row) => ({
        engineId: row.engine_id as EngineId,
        status: row.status as EngineStatus,
        ...(row.reason ? { reason: row.reason } : {}),
        ...(row.probe_ms !== null ? { probeMs: Number(row.probe_ms) } : {}),
        observedAt: new Date(row.observed_at).toISOString(),
      }));
    } catch (err) {
      this.log.warn({ err: message(err), engineId }, 'engine health log read failed (returning empty)');
      return [];
    }
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
