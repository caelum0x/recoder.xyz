/**
 * `PgQueryExecutor` — the concrete `QueryExecutor` over the shared pool.
 *
 * MOVED + generalized from `backend/src/database/query-executor.ts`: it keeps
 * that module's security posture (injection-pattern detection, param-type
 * validation, error-message sanitization) but re-homes it onto the control-plane
 * `pg.Pool` with `:param` named binding and the typed `one/read/mutate/
 * withTransaction` helpers the repositories depend on.
 *
 * Degrade-safe: with no pool every method rejects with a truthful
 * `SERVICE_UNAVAILABLE`, never a fabricated empty result.
 */
import type { Pool, PoolClient } from 'pg';
import type { Logger } from '../../../shared/logger.js';
import { AppError, ErrorCode } from '../../../shared/errors.js';
import type { QueryExecutor, QueryParams } from '../ports/query-executor.port.js';
import type { QueryRow } from '../types.js';
import { compileNamedQuery } from './named-params.js';
import { analyzeQuery, sanitizeErrorMessage, validateParamValues } from './query-guards.js';

/** Anything that can run a query — the pool or a tx-scoped client. */
type Queryable = Pick<Pool | PoolClient, 'query'>;

const MAX_QUERY_LENGTH = 100_000;

export class PgQueryExecutor implements QueryExecutor {
  constructor(
    private readonly db: Queryable | null,
    private readonly log: Logger,
    /** When set (a tx client), `withTransaction` reuses it instead of nesting. */
    private readonly txClient: PoolClient | null = null,
    /** The pool, needed to check out a client for a transaction. */
    private readonly pool: Pool | null = null,
  ) {}

  isAvailable(): boolean {
    return this.db !== null;
  }

  async execute<T extends QueryRow = QueryRow>(sql: string, params: QueryParams = {}): Promise<readonly T[]> {
    const rows = await this.run(sql, params);
    return rows as T[];
  }

  async read<T extends QueryRow = QueryRow>(sql: string, params: QueryParams = {}): Promise<readonly T[]> {
    return this.execute<T>(sql, params);
  }

  async one<T extends QueryRow = QueryRow>(sql: string, params: QueryParams = {}): Promise<T | null> {
    const rows = await this.run(sql, params);
    return (rows[0] as T) ?? null;
  }

  async mutate(sql: string, params: QueryParams = {}): Promise<number> {
    const result = await this.runRaw(sql, params);
    return result.rowCount ?? 0;
  }

  async withTransaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T> {
    // Already inside a transaction → reuse the same client (flat, not nested).
    if (this.txClient) {
      return fn(this);
    }
    if (!this.pool) {
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'database is unavailable');
    }
    const client = await this.pool.connect();
    const txExecutor = new PgQueryExecutor(client, this.log, client, this.pool);
    try {
      await client.query('BEGIN');
      const result = await fn(txExecutor);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        this.log.error(
          { err: rollbackError instanceof Error ? rollbackError.message : String(rollbackError) },
          'transaction rollback failed',
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /** Compile + run, returning rows. */
  private async run(sql: string, params: QueryParams): Promise<QueryRow[]> {
    const result = await this.runRaw(sql, params);
    return result.rows as QueryRow[];
  }

  /** Compile, validate, run — the single choke point for every query. */
  private async runRaw(sql: string, params: QueryParams): Promise<{ rows: unknown[]; rowCount: number | null }> {
    if (!this.db) {
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'database is unavailable');
    }
    if (typeof sql !== 'string' || sql.length === 0) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'query text is required');
    }
    if (sql.length > MAX_QUERY_LENGTH) {
      throw new AppError(ErrorCode.INVALID_INPUT, `query too long (max ${MAX_QUERY_LENGTH} chars)`);
    }

    const { text, values } = compileNamedQuery(sql, params);

    const paramCheck = validateParamValues(values);
    if (!paramCheck.valid) {
      throw new AppError(ErrorCode.INVALID_INPUT, paramCheck.error ?? 'invalid parameter');
    }

    // Non-blocking security signal: parameterization protects us, but a
    // suspicious pattern in a control-plane query is worth a warning.
    const analysis = analyzeQuery(text);
    if (analysis.suspicious) {
      this.log.warn({ warnings: analysis.warnings }, 'suspicious query pattern (parameterized; not blocked)');
    }

    try {
      const result = await this.db.query(text, values);
      return { rows: result.rows, rowCount: result.rowCount };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // SECURITY: never leak connection strings / paths / IPs to the caller.
      throw new AppError(ErrorCode.INTERNAL_ERROR, sanitizeErrorMessage(message), { cause: error });
    }
  }
}

/** Construct an executor bound to the shared pool (or a degraded null pool). */
export function createQueryExecutor(pool: Pool | null, log: Logger): QueryExecutor {
  return new PgQueryExecutor(pool, log, null, pool);
}
