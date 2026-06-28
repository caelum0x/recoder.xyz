/**
 * Postgres adapters — the durable, cross-process source of record for
 * work-locks, lease fence tokens, and task claims. These graduate the in-memory
 * adapters (which remain the degrade fallback for tests + single-process
 * runtimes) to a shared DB so locks and claims survive restarts and are visible
 * across conductor processes.
 *
 * The adapters depend only on the narrow `PgPool` structural type, so the pure
 * core takes NO hard dependency on the `pg` package: the composition root passes
 * a real `new pg.Pool(...)` via a lazy `import("pg")`, and the unit suite drives
 * the same code against a fake pool it owns.
 *
 * Exported as a namespace from the package root (`export * as postgres`),
 * alongside `memory`.
 */

export { PostgresLockStore } from './postgres-lock-store';
export { PostgresLeaseFencer } from './postgres-lease-fencer';
export { PostgresClaimStore } from './postgres-claim-store';
export type { PostgresClaimStoreOptions } from './postgres-claim-store';

export {
  bootstrapSchema,
  WORK_LOCKS_TABLE,
  FENCE_SEQUENCES_TABLE,
  TASK_CLAIMS_TABLE,
  CREATE_WORK_LOCKS_SQL,
  CREATE_FENCE_SEQUENCES_SQL,
  CREATE_TASK_CLAIMS_SQL,
} from './schema';

export {
  withTransaction,
  type PgPool,
  type PgClient,
  type PgQueryable,
  type PgQueryResult,
  type PgRow,
} from './pg-pool';
