/**
 * `StateOfRecordRepository` — the versioned, event-sourced substrate. Every
 * meaningful state change is appended to `core.state_events` (append-only,
 * monotonic seq); `core.state_snapshots` holds the materialised aggregate at a
 * version so time-travel + audit provenance are truthful reads (ARCHITECTURE
 * §4, law: state is versioned so time-travel and audit are truthful).
 *
 * Writes are atomic: appending an event + advancing the snapshot happen in one
 * transaction so a reader never sees an event without its snapshot or vice versa.
 */
import type { QueryExecutor } from '../ports/query-executor.port.js';
import type { QueryRow, StateEvent, StateSnapshot } from '../types.js';

export interface AppendEventInput {
  readonly aggregate: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly actorId?: string | null;
  readonly payload: unknown;
  /** The owner id stored on the resulting snapshot (app-layer tenancy). */
  readonly userId: string;
  /** The full materialised aggregate state at this version. */
  readonly snapshot: unknown;
}

export class StateOfRecordRepository {
  constructor(private readonly executor: QueryExecutor) {}

  /**
   * Append an event and advance the aggregate's snapshot to the next version,
   * atomically. Returns the new version number.
   */
  async appendEvent(input: AppendEventInput): Promise<number> {
    return this.executor.withTransaction(async (tx) => {
      // Serialize concurrent appends to the SAME aggregate (recoder-x5gx). The
      // version is allocated as `max(version)+1`, a read-then-write that races
      // under concurrency: two transactions read the same max, both insert that
      // version, and the unique (aggregate, aggregate_id, version) aborts the
      // loser — losing its event/snapshot. A transaction-scoped advisory lock
      // keyed on the aggregate makes the read+insert atomic; different
      // aggregates never contend, and the lock auto-releases at commit/rollback.
      await tx.one(
        `select pg_advisory_xact_lock(hashtextextended(:lock_key, 0)) as locked`,
        { lock_key: `${input.aggregate}:${input.aggregateId}` },
      );

      await tx.mutate(
        `insert into core.state_events (aggregate, aggregate_id, event_type, actor_id, payload)
         values (:aggregate, :aggregate_id, :event_type, :actor_id, :payload::jsonb)`,
        {
          aggregate: input.aggregate,
          aggregate_id: input.aggregateId,
          event_type: input.eventType,
          actor_id: input.actorId ?? null,
          payload: JSON.stringify(input.payload ?? null),
        },
      );

      const current = await tx.one<QueryRow>(
        `select coalesce(max(version), 0) as version from core.state_snapshots
         where aggregate = :aggregate and aggregate_id = :aggregate_id`,
        { aggregate: input.aggregate, aggregate_id: input.aggregateId },
      );
      const nextVersion = Number(current?.version ?? 0) + 1;

      await tx.mutate(
        `insert into core.state_snapshots (aggregate, aggregate_id, version, payload, user_id)
         values (:aggregate, :aggregate_id, :version, :payload::jsonb, :user_id)`,
        {
          aggregate: input.aggregate,
          aggregate_id: input.aggregateId,
          version: nextVersion,
          payload: JSON.stringify(input.snapshot ?? null),
          user_id: input.userId,
        },
      );

      return nextVersion;
    });
  }

  /** Read the snapshot at a specific version, or the latest when `version` is omitted. */
  async readAt(aggregate: string, aggregateId: string, version?: number): Promise<StateSnapshot | null> {
    const row = version
      ? await this.executor.one<QueryRow>(
          `select * from core.state_snapshots
           where aggregate = :aggregate and aggregate_id = :aggregate_id and version = :version`,
          { aggregate, aggregate_id: aggregateId, version },
        )
      : await this.executor.one<QueryRow>(
          `select * from core.state_snapshots
           where aggregate = :aggregate and aggregate_id = :aggregate_id
           order by version desc limit 1`,
          { aggregate, aggregate_id: aggregateId },
        );
    return row ? mapSnapshot(row) : null;
  }

  /** Read the ordered event log for an aggregate (audit / replay). */
  async events(aggregate: string, aggregateId: string): Promise<readonly StateEvent[]> {
    const rows = await this.executor.read<QueryRow>(
      `select * from core.state_events
       where aggregate = :aggregate and aggregate_id = :aggregate_id
       order by seq asc`,
      { aggregate, aggregate_id: aggregateId },
    );
    return rows.map(mapEvent);
  }
}

function mapSnapshot(row: QueryRow): StateSnapshot {
  return {
    aggregate: String(row.aggregate),
    aggregateId: String(row.aggregate_id),
    version: Number(row.version),
    payload: row.payload ?? null,
    userId: String(row.user_id),
    createdAt: row.created_at ? new Date(row.created_at as string).toISOString() : new Date().toISOString(),
  };
}

function mapEvent(row: QueryRow): StateEvent {
  return {
    seq: Number(row.seq),
    aggregate: String(row.aggregate),
    aggregateId: String(row.aggregate_id),
    eventType: String(row.event_type),
    actorId: row.actor_id === null || row.actor_id === undefined ? null : String(row.actor_id),
    payload: row.payload ?? null,
    recordedAt: row.recorded_at ? new Date(row.recorded_at as string).toISOString() : new Date().toISOString(),
  };
}
