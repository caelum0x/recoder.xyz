/**
 * `BaseRepository<T, Id>` — the abstract CRUD base every domain repository
 * extends. It builds parameterized `:param` SQL over the injected
 * `QueryExecutor` and enforces app-layer tenancy: when a `TenantScope` is passed
 * it appends a `<userColumn> = :user_id` guard so a cross-tenant id can never
 * read or mutate another owner's row (ARCHITECTURE §7).
 *
 * Subclasses declare their table, id/owner columns, and row↔entity mapping; the
 * base owns the query construction so no domain hand-writes SQL string
 * concatenation.
 */
import { AppError, ErrorCode } from '../../../shared/errors.js';
import type { QueryExecutor, QueryParams } from '../ports/query-executor.port.js';
import type { Repository, TenantScope } from '../ports/repository.port.js';
import type { QueryRow } from '../types.js';

export interface RepositoryColumns {
  /** Fully-qualified table, e.g. `agent_os.tasks`. */
  readonly table: string;
  /** Primary-key column. */
  readonly idColumn: string;
  /** App-layer owner column used for tenant scoping (e.g. `user_id`). */
  readonly userColumn: string;
  /** Optional org-scope column. */
  readonly orgColumn?: string;
}

export abstract class BaseRepository<T, Id = string> implements Repository<T, Id> {
  protected constructor(
    protected readonly executor: QueryExecutor,
    protected readonly columns: RepositoryColumns,
  ) {}

  /** Map a raw DB row to the domain entity. */
  protected abstract mapRow(row: QueryRow): T;

  /** Map a domain entity (or patch) to a column→value record for writes. */
  protected abstract toColumns(entity: Partial<T>): Record<string, unknown>;

  async findAll(scope?: TenantScope): Promise<readonly T[]> {
    const scoped = this.tenantConditions(scope);
    const where = scoped.conditions.length ? ` where ${scoped.conditions.join(' and ')}` : '';
    const rows = await this.executor.read<QueryRow>(`select * from ${this.columns.table}${where}`, scoped.params);
    return rows.map((r) => this.mapRow(r));
  }

  async findById(id: Id, scope?: TenantScope): Promise<T | null> {
    const scoped = this.tenantConditions(scope);
    const conditions = [`${this.columns.idColumn} = :id`, ...scoped.conditions];
    const row = await this.executor.one<QueryRow>(
      `select * from ${this.columns.table} where ${conditions.join(' and ')}`,
      { ...scoped.params, id },
    );
    return row ? this.mapRow(row) : null;
  }

  async create(entity: T, scope?: TenantScope): Promise<T> {
    const record = this.toColumns(entity);
    if (scope) record[this.columns.userColumn] = scope.userId;
    const keys = Object.keys(record);
    if (keys.length === 0) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'cannot insert an empty row');
    }
    const cols = keys.join(', ');
    const placeholders = keys.map((k) => `:${k}`).join(', ');
    const inserted = await this.executor.one<QueryRow>(
      `insert into ${this.columns.table} (${cols}) values (${placeholders}) returning *`,
      record as QueryParams,
    );
    if (!inserted) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, 'insert returned no row');
    }
    return this.mapRow(inserted);
  }

  async update(id: Id, patch: Partial<T>, scope?: TenantScope): Promise<T | null> {
    const record = this.toColumns(patch);
    // Never allow the id or owner columns to be reassigned via a patch.
    delete record[this.columns.idColumn];
    delete record[this.columns.userColumn];
    const keys = Object.keys(record);
    if (keys.length === 0) {
      // No-op patch → return the current row (still scope-checked).
      return this.findById(id, scope);
    }
    const setClause = keys.map((k) => `${k} = :${k}`).join(', ');
    const scoped = this.tenantConditions(scope);
    const conditions = [`${this.columns.idColumn} = :id`, ...scoped.conditions];
    const updated = await this.executor.one<QueryRow>(
      `update ${this.columns.table} set ${setClause} where ${conditions.join(' and ')} returning *`,
      { ...record, ...scoped.params, id } as QueryParams,
    );
    return updated ? this.mapRow(updated) : null;
  }

  async delete(id: Id, scope?: TenantScope): Promise<boolean> {
    const scoped = this.tenantConditions(scope);
    const conditions = [`${this.columns.idColumn} = :id`, ...scoped.conditions];
    const count = await this.executor.mutate(
      `delete from ${this.columns.table} where ${conditions.join(' and ')}`,
      { ...scoped.params, id } as QueryParams,
    );
    return count > 0;
  }

  /**
   * Build the tenant-scope conditions + params. Empty (unscoped) when no scope
   * is provided — reserved for internal/admin callers.
   */
  protected tenantConditions(scope: TenantScope | undefined): {
    conditions: string[];
    params: Record<string, unknown>;
  } {
    if (!scope) return { conditions: [], params: {} };
    const conditions = [`${this.columns.userColumn} = :user_id`];
    const params: Record<string, unknown> = { user_id: scope.userId };
    if (scope.orgId && this.columns.orgColumn) {
      conditions.push(`${this.columns.orgColumn} = :org_id`);
      params.org_id = scope.orgId;
    }
    return { conditions, params };
  }
}
