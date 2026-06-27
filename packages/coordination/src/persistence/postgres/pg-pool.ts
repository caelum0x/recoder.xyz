/**
 * PgPool — the narrow structural slice of `pg.Pool` (and `pg.PoolClient`) that
 * the Postgres adapters depend on. Declaring it structurally here means the pure
 * coordination core takes NO hard dependency on the `pg` package: a real
 * `pg.Pool` satisfies this interface, and the unit suite drives the same code
 * against a fake pool it owns (testing the store's CAS logic, not a mock of the
 * store).
 *
 * Production wiring passes a real `new pg.Pool(...)` via a lazy `import("pg")`
 * at the composition root; this module never imports `pg`.
 */

/** A single result row is a string-keyed bag of column values. */
export type PgRow = Record<string, unknown>;

/** The subset of `pg.QueryResult` the adapters read. */
export interface PgQueryResult<R extends PgRow = PgRow> {
  rows: R[];
  rowCount: number | null;
}

/**
 * A queryable handle. Both `pg.Pool` and a checked-out `pg.PoolClient` expose
 * this `query(text, values)` overload, so adapter helpers can run against either
 * the pool directly or a transaction client.
 */
export interface PgQueryable {
  query<R extends PgRow = PgRow>(
    text: string,
    values?: ReadonlyArray<unknown>,
  ): Promise<PgQueryResult<R>>;
}

/** A checked-out client that must be released back to the pool. */
export interface PgClient extends PgQueryable {
  release(err?: Error | boolean): void;
}

/** The narrow slice of `pg.Pool` the adapters use. */
export interface PgPool extends PgQueryable {
  /** Check out a client for a multi-statement transaction. */
  connect(): Promise<PgClient>;
}

/**
 * Run `fn` inside a `BEGIN`/`COMMIT` transaction on a checked-out client,
 * rolling back on any thrown error and always releasing the client. The CAS
 * paths use this so the fence-token read and the lock write are atomic under a
 * single serialized transaction.
 */
export async function withTransaction<T>(
  pool: PgPool,
  fn: (client: PgQueryable) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error: unknown) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Rollback failures are subordinate to the original error; surface that.
    }
    throw error;
  } finally {
    client.release();
  }
}
