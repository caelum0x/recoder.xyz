/**
 * Shared persistence domain types. Pure data shapes — no logic, no imports from
 * the concrete adapters, so any layer (ports, repos, composer, tests) can use
 * them without a cycle.
 */

/** A generic query row. Columns are unknown until a repo maps them. */
export type QueryRow = Record<string, unknown>;

/** A single row in `core.kv_store`. */
export interface KvEntry {
  readonly namespace: string;
  readonly key: string;
  readonly value: unknown;
  readonly expiresAt: string | null;
  readonly version: number;
  readonly updatedAt: string;
}

/** Live pool statistics for health + diagnostics. */
export interface PoolStats {
  /** Total clients the pool currently owns. */
  readonly total: number;
  /** Clients not currently checked out. */
  readonly idle: number;
  /** Queued acquisition requests waiting for a client. */
  readonly waiting: number;
  /** Configured maximum pool size. */
  readonly max: number;
}

/** Result of a migration apply run. */
export interface MigrationReport {
  /** Files applied this run, in order. */
  readonly applied: readonly string[];
  /** Files already recorded as applied (skipped). */
  readonly skipped: readonly string[];
  /** False when a failure was encountered (degrade-safe: boot still continues). */
  readonly ok: boolean;
  /** Error message when `ok === false`. */
  readonly error?: string;
}

/** Snapshot of migration state without applying. */
export interface MigrationStatus {
  readonly applied: readonly string[];
  readonly pending: readonly string[];
  /** True when the ledger/pool could be read. */
  readonly ok: boolean;
  readonly error?: string;
}

/** An append-only state-of-record event row. */
export interface StateEvent {
  readonly seq: number;
  readonly aggregate: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly actorId: string | null;
  readonly payload: unknown;
  readonly recordedAt: string;
}

/** A materialised, versioned aggregate snapshot. */
export interface StateSnapshot {
  readonly aggregate: string;
  readonly aggregateId: string;
  readonly version: number;
  readonly payload: unknown;
  readonly userId: string;
  readonly createdAt: string;
}
