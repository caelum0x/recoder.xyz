/**
 * Postgres schema for the durable work-lock store + lease fencer.
 *
 * Two tables:
 *  - `coordination_work_locks` holds one row per lock. Durability + cross-process
 *    safety come from the DB: a `UNIQUE` constraint on the fencing scope
 *    (`space_id, repo, path_glob`) makes a second active acquire on the same
 *    scope a constraint violation, and the CAS in `put` rejects a stale fence
 *    token before that.
 *  - `coordination_fence_sequences` holds the monotonic high-water token per
 *    fencing scope, advanced atomically with `INSERT ... ON CONFLICT DO UPDATE`
 *    using `GREATEST`, so two processes can never issue the same token.
 *
 * `bootstrapSchema` is idempotent (`IF NOT EXISTS`) so callers can run it on
 * startup. It is intentionally plain SQL (no migration framework) to keep the
 * pure core dependency-free; the canonical agent-os migrations may own the
 * production DDL, in which case this is a no-op safety net.
 */

import type { PgQueryable } from './pg-pool';

export const WORK_LOCKS_TABLE = 'coordination_work_locks';
export const FENCE_SEQUENCES_TABLE = 'coordination_fence_sequences';

export const CREATE_WORK_LOCKS_SQL = `
CREATE TABLE IF NOT EXISTS ${WORK_LOCKS_TABLE} (
  lock_id        TEXT PRIMARY KEY,
  space_id       TEXT NOT NULL,
  repo           TEXT NOT NULL DEFAULT '',
  path_glob      TEXT NOT NULL,
  owner_agent_id TEXT NOT NULL,
  task_id        TEXT NOT NULL,
  acquired_at    TIMESTAMPTZ NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  fence_token    BIGINT NOT NULL,
  kind           TEXT NOT NULL,
  CONSTRAINT ${WORK_LOCKS_TABLE}_scope_uniq UNIQUE (space_id, repo, path_glob)
);
`;

export const CREATE_FENCE_SEQUENCES_SQL = `
CREATE TABLE IF NOT EXISTS ${FENCE_SEQUENCES_TABLE} (
  scope_key   TEXT PRIMARY KEY,
  fence_token BIGINT NOT NULL
);
`;

/** Idempotently create the lock + fence tables. Safe to call on every startup. */
export async function bootstrapSchema(db: PgQueryable): Promise<void> {
  await db.query(CREATE_WORK_LOCKS_SQL);
  await db.query(CREATE_FENCE_SEQUENCES_SQL);
}
