/**
 * `withTransaction` — a standalone BEGIN/COMMIT/ROLLBACK helper over the shared
 * pool. The `QueryExecutor` exposes its own `withTransaction`; this free
 * function is the low-level primitive for callers that hold a `Pool` directly
 * (e.g. the migration runner) and want an atomic block with a tx-scoped
 * executor.
 */
import type { Pool } from 'pg';
import type { Logger } from '../../../shared/logger.js';
import type { QueryExecutor } from '../ports/query-executor.port.js';
import { PgQueryExecutor } from './query-executor.js';

/**
 * Run `fn` inside a transaction. Checks out a client, BEGINs, passes a
 * tx-scoped executor to `fn`, then COMMITs — or ROLLBACKs and rethrows on any
 * error. The client is always released.
 */
export async function withTransaction<T>(
  pool: Pool,
  log: Logger,
  fn: (tx: QueryExecutor) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  const executor = new PgQueryExecutor(client, log, client, pool);
  try {
    await client.query('BEGIN');
    const result = await fn(executor);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      log.error(
        { err: rollbackError instanceof Error ? rollbackError.message : String(rollbackError) },
        'transaction rollback failed',
      );
    }
    throw error;
  } finally {
    client.release();
  }
}
