/**
 * The generic `Repository` + unit-of-work seam every domain's repo port binds
 * to. Persistence supplies the concrete `BaseRepository` (over `QueryExecutor`)
 * that domain repositories extend; the domain declares its own `Repository<T>`
 * port in its `ports/` and gets the impl from the `RepositoryFactory`.
 *
 * Tenancy is app-layer (ARCHITECTURE §7): every scoped read/write threads the
 * caller's `userId` (or `orgId`) into a `WHERE user_id = :user_id` guard. There
 * is no Supabase RLS / `auth.uid()`.
 */
import type { QueryExecutor } from './query-executor.port.js';

/** The tenant scope threaded into scoped repository operations. */
export interface TenantScope {
  /** App-layer owner id — the `WHERE user_id = :user_id` guard value. */
  readonly userId: string;
  /** Optional org scope for org-isolated aggregates. */
  readonly orgId?: string;
}

/** A transaction context: an executor bound to an open transaction. */
export interface TxContext {
  readonly executor: QueryExecutor;
}

/**
 * The generic aggregate repository. `Id` defaults to `string`. All reads/writes
 * are tenant-scoped: passing a `TenantScope` restricts to that owner and denies
 * cross-tenant access at the SQL boundary.
 */
export interface Repository<T, Id = string> {
  /** All rows visible to the scope (unscoped only for internal/admin callers). */
  findAll(scope?: TenantScope): Promise<readonly T[]>;
  /** One row by id, or `null` when absent / not owned by the scope. */
  findById(id: Id, scope?: TenantScope): Promise<T | null>;
  /** Insert a new row and return the persisted entity. */
  create(entity: T, scope?: TenantScope): Promise<T>;
  /** Patch an existing row; returns the updated entity or `null` when absent. */
  update(id: Id, patch: Partial<T>, scope?: TenantScope): Promise<T | null>;
  /** Delete a row; returns `true` when a row was removed. */
  delete(id: Id, scope?: TenantScope): Promise<boolean>;
}

/**
 * The unit-of-work seam: run a set of repository operations atomically. The
 * `RepositoryFactory` (persistence) implements this over `withTransaction`.
 */
export interface UnitOfWork {
  transaction<T>(fn: (tx: TxContext) => Promise<T>): Promise<T>;
}
