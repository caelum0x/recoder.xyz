/**
 * Persistence domain — public factory + interface.
 *
 * `createPersistenceModule(deps)` builds the composer that fuses the shared
 * `pg.Pool`, the `:param` `QueryExecutor`, the migration runner, the
 * `RepositoryFactory`, the DB-backed `KvStore`, and truthful health. This is the
 * ONE interface other domains import to reach Postgres (ARCHITECTURE §5:
 * persistence exposes `QueryExecutor` + `Repository`/`RepositoryFactory` +
 * `KvStore` + `StateOfRecordRepository` + `MigrationRunner`).
 */
import type { Router } from 'express';
import type { AppConfig } from '../../shared/app-config.js';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { QueryExecutor } from './ports/query-executor.port.js';
import type { KvStore } from './ports/kv-store.port.js';
import type { MigrationRunner } from './ports/migration-runner.port.js';
import type { RepositoryFactory } from './repositories/repository-factory.js';
import type { StateOfRecordRepository } from './repositories/state-of-record.repository.js';
import type { SchemaInspector } from './schema/schema-inspector.js';
import type { MigrationReport } from './types.js';

/** Dependencies injected by bootstrap. */
export interface PersistenceDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
}

/** The public surface every other domain consumes. */
export interface PersistenceModule {
  readonly name: 'persistence';
  /** The shared `:param` executor — the seam every repo binds to. */
  executor(): QueryExecutor;
  /** The factory DI uses to hand out repositories. */
  repositories(): RepositoryFactory;
  /** The DB-backed namespaced KV store (JSON persistence replacement). */
  kvStore(): KvStore;
  /** The versioned state-of-record repository. */
  stateOfRecord(): StateOfRecordRepository;
  /** The migration runner. */
  migrations(): MigrationRunner;
  /** Read-only schema introspection. */
  schema(): SchemaInspector;
  /** Apply pending migrations (idempotent, degrade-safe). */
  migrate(): Promise<MigrationReport>;
  /** Truthful health. */
  health(): Promise<ComponentHealth>;
  /** Express router for `/internal/persistence/*`. */
  routes(): Router;
  /** MCP tool registrations. */
  mcp(): readonly McpToolRegistration[];
  /** Boot hook: migrate + hydrate KV cache + seed (all degrade-safe). */
  start(): Promise<void>;
  /** Shutdown hook: flush pending KV writes + drain the pool. */
  stop(): Promise<void>;
}

// Value import last so the type-only imports above form no runtime cycle.
import { PersistenceComposer } from './persistence-module.js';

/** Build the persistence module. */
export function createPersistenceModule(deps: PersistenceDeps): PersistenceModule {
  return new PersistenceComposer(deps.config, deps.logger);
}
