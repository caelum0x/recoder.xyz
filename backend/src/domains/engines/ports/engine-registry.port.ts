/**
 * `EngineRegistryPort` (declared-engine catalog) + `EngineHealthRepository`
 * (persistence port for the health/restart audit rows).
 *
 * The registry is the in-memory catalog other domains read for capability
 * discovery ("is colbert bound? what transport?"); the repository is the durable
 * backing (`engine_registry` / `engine_health_log` / `engine_restart_log`) the
 * composer snapshots health + restart audits into — degrade-safe when no pool.
 */
import type { EngineDescriptor, EngineHealth, EngineId, EngineStatus } from '../types.js';

/** The in-memory declared-engine catalog (capability discovery surface). */
export interface EngineRegistryPort {
  /** Every declared engine descriptor. */
  list(): readonly EngineDescriptor[];
  /** One descriptor by id (null when not declared). */
  get(id: EngineId): EngineDescriptor | null;
  /** Descriptors filtered by transport. */
  byTransport(transport: EngineDescriptor['transport']): readonly EngineDescriptor[];
}

/** A row written to the restart audit log (a restart is a governed write). */
export interface EngineRestartRecord {
  readonly engineId: EngineId;
  /** user_id / agent id from the authorizing Session. */
  readonly requestedBy: string;
  readonly reason?: string;
  readonly outcome: 'restarted' | 'skipped' | 'failed';
  /** Governance audit chain ref (Merkle) when the write was gated. */
  readonly auditRef?: string;
}

/** A recent health-log row for an engine (most-recent-first). */
export interface EngineHealthLogRow {
  readonly engineId: EngineId;
  readonly status: EngineStatus;
  readonly reason?: string;
  readonly probeMs?: number;
  readonly observedAt: string;
}

/**
 * The persistence port for the engines operational registry. All impls are
 * degrade-safe: when the executor is unavailable, writes are best-effort no-ops
 * and reads return empty — a Postgres-less boot never crashes the seam.
 */
export interface EngineHealthRepository {
  /**
   * Upsert the declared-engine catalog row (transport + binding + last status).
   * Called on bind + on every health transition.
   */
  upsertRegistry(entry: {
    readonly engineId: EngineId;
    readonly transport: EngineDescriptor['transport'];
    readonly bindingPath?: string | null;
    readonly version?: string | null;
    readonly status: EngineStatus;
    readonly reason?: string | null;
  }): Promise<void>;

  /** Append a bounded health snapshot row. */
  recordHealth(health: EngineHealth): Promise<void>;

  /** Append a restart audit row. */
  recordRestart(record: EngineRestartRecord): Promise<void>;

  /** The most-recent health-log rows for one engine (default limit 20). */
  recentHealth(engineId: EngineId, limit?: number): Promise<readonly EngineHealthLogRow[]>;

  /** True when the durable backing is available (drives truthful health). */
  isDurable(): boolean;
}
