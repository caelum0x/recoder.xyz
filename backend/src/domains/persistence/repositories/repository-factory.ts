/**
 * `RepositoryFactory` — the seam DI uses to hand out repositories. It owns the
 * shared `QueryExecutor` and injects it into any domain's repo class, so a
 * domain never constructs its own pool/executor. It also implements the
 * `UnitOfWork` (atomic multi-repo transaction) and exposes the built-in
 * persistence repositories (KV, state-of-record).
 */
import type { Logger } from '../../../shared/logger.js';
import type { QueryExecutor } from '../ports/query-executor.port.js';
import type { KvStore } from '../ports/kv-store.port.js';
import type { TxContext, UnitOfWork } from '../ports/repository.port.js';
import { KvStoreRepository } from './kv-store.repository.js';
import { StateOfRecordRepository } from './state-of-record.repository.js';

/** A domain repo constructor built from the shared executor. */
export type RepositoryConstructor<R> = (executor: QueryExecutor, log: Logger) => R;

export class RepositoryFactory implements UnitOfWork {
  private kv: KvStoreRepository | null = null;
  private stateOfRecord: StateOfRecordRepository | null = null;

  constructor(
    private readonly executor: QueryExecutor,
    private readonly log: Logger,
  ) {}

  /** The shared executor (for domains that build ad-hoc queries via a repo). */
  getExecutor(): QueryExecutor {
    return this.executor;
  }

  /** Build a domain repository, injecting the shared executor + logger. */
  build<R>(construct: RepositoryConstructor<R>): R {
    return construct(this.executor, this.log);
  }

  /** The DB-backed KV store (lazy singleton). */
  kvStore(): KvStore {
    if (!this.kv) this.kv = new KvStoreRepository(this.executor, this.log);
    return this.kv;
  }

  /** The versioned state-of-record repository (lazy singleton). */
  stateOfRecordRepository(): StateOfRecordRepository {
    if (!this.stateOfRecord) this.stateOfRecord = new StateOfRecordRepository(this.executor);
    return this.stateOfRecord;
  }

  /** Run repository operations atomically over a tx-scoped executor. */
  async transaction<T>(fn: (tx: TxContext) => Promise<T>): Promise<T> {
    return this.executor.withTransaction((txExecutor) => fn({ executor: txExecutor }));
  }
}

/** Construct a factory over the shared executor. */
export function createRepositoryFactory(executor: QueryExecutor, log: Logger): RepositoryFactory {
  return new RepositoryFactory(executor, log);
}
