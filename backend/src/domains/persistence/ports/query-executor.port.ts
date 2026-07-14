/**
 * `QueryExecutor` — the one seam every stateful domain reaches Postgres through.
 *
 * All access is parameterized `:param` SQL. The executor compiles named
 * placeholders to positional `$n`, rejects raw string interpolation upstream,
 * and returns typed rows. A domain's repository depends on THIS interface, never
 * on `pg` directly, so the pool, driver, and injection analysis are owned in one
 * place (ARCHITECTURE §2 persistence).
 */
import type { QueryRow } from '../types.js';

/** Named parameters for a `:param` query. Values are bound positionally. */
export type QueryParams = Readonly<Record<string, unknown>>;

/**
 * The executor contract. `execute` is the general form; `one`/`read`/`mutate`
 * are typed conveniences. Every method binds named params — never interpolates.
 */
export interface QueryExecutor {
  /** Run a query and return all rows (typed). */
  execute<T extends QueryRow = QueryRow>(sql: string, params?: QueryParams): Promise<readonly T[]>;
  /** Run a query expecting at most one row; returns `null` when none match. */
  one<T extends QueryRow = QueryRow>(sql: string, params?: QueryParams): Promise<T | null>;
  /** Alias of {@link execute} for read-intent call sites (readability). */
  read<T extends QueryRow = QueryRow>(sql: string, params?: QueryParams): Promise<readonly T[]>;
  /** Run a mutation (INSERT/UPDATE/DELETE) and return the affected row count. */
  mutate(sql: string, params?: QueryParams): Promise<number>;
  /**
   * Run `fn` inside a single transaction. The executor passed to `fn` is bound
   * to the transaction's client; a thrown error rolls back, otherwise commits.
   */
  withTransaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T>;
  /** True when the underlying pool is connectable (drives truthful health). */
  isAvailable(): boolean;
}
