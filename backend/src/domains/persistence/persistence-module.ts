/**
 * `PersistenceComposer` — the composer that fuses the persistence pieces into
 * one module. It:
 *  - builds the single shared `pg.Pool` (degrade-safe: null when unconfigured),
 *  - constructs the `:param` `QueryExecutor` over it,
 *  - owns the migration runner, repository factory, KV store, state-of-record,
 *    and schema inspector,
 *  - runs boot-time migrate + KV hydrate + optional seed (all degrade-safe),
 *  - reports truthful health and exposes the internal routes + MCP tools.
 *
 * No `process.env` reads (config is injected); no top-level singletons.
 */
import type { Router } from 'express';
import type { Pool } from 'pg';
import type { AppConfig } from '../../shared/app-config.js';
import type { Logger } from '../../shared/logger.js';
import { childLogger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';

import { slicePersistenceConfig, assertProdDatabaseUrl, type PersistenceConfig } from './config.js';
import { createPgPool, drainPool } from './client/pg-pool.js';
import { createQueryExecutor } from './query/query-executor.js';
import { createMigrationRunner } from './migrations/migration-runner.js';
import { createRepositoryFactory, RepositoryFactory } from './repositories/repository-factory.js';
import { createSchemaInspector, SchemaInspector } from './schema/schema-inspector.js';
import { runSeeds } from './schema/seed.js';
import { legacyKv } from './repositories/kv-compat.js';
import { buildPersistenceHealth } from './health.js';
import { registerPersistenceRoutes } from './routes/persistence.routes.js';
import { buildPersistenceMcpTools } from './mcp/persistence-engine.js';
import type { QueryExecutor } from './ports/query-executor.port.js';
import type { KvStore } from './ports/kv-store.port.js';
import type { MigrationRunner } from './ports/migration-runner.port.js';
import type { StateOfRecordRepository } from './repositories/state-of-record.repository.js';
import type { MigrationReport } from './types.js';
import type { PersistenceModule } from './index.js';

export class PersistenceComposer implements PersistenceModule {
  readonly name = 'persistence' as const;

  private readonly cfg: PersistenceConfig;
  private readonly log: Logger;
  private readonly pool: Pool | null;
  private readonly queryExecutor: QueryExecutor;
  private readonly runner: MigrationRunner;
  private readonly factory: RepositoryFactory;
  private readonly inspector: SchemaInspector;
  private started = false;

  constructor(config: AppConfig, logger: Logger) {
    this.cfg = slicePersistenceConfig(config);
    this.log = childLogger('persistence');

    // Prod-URL guard: a localhost/sqlite URL in production is config drift.
    // Report loudly, but stay degrade-safe (do not crash boot) — the module
    // will simply run without the misconfigured pool.
    const problems = assertProdDatabaseUrl(this.cfg);
    const safeUrl = problems.length > 0 ? null : this.cfg.databaseUrl;
    if (problems.length > 0) {
      for (const problem of problems) this.log.error({ problem }, 'invalid production DATABASE_URL — pool disabled');
    }

    this.pool = createPgPool({ ...this.cfg, databaseUrl: safeUrl }, this.log);
    this.queryExecutor = createQueryExecutor(this.pool, this.log);
    this.runner = createMigrationRunner(this.pool, this.cfg, this.log);
    this.factory = createRepositoryFactory(this.queryExecutor, this.log);
    this.inspector = createSchemaInspector(this.queryExecutor);

    // Bind the legacy sync-KV facade to the DB-backed store so the recreated
    // `src/persistence.ts` shim + migrated consumers write through to Postgres.
    legacyKv.bind(this.factory.kvStore(), this.log);
  }

  executor(): QueryExecutor {
    return this.queryExecutor;
  }

  repositories(): RepositoryFactory {
    return this.factory;
  }

  kvStore(): KvStore {
    return this.factory.kvStore();
  }

  stateOfRecord(): StateOfRecordRepository {
    return this.factory.stateOfRecordRepository();
  }

  migrations(): MigrationRunner {
    return this.runner;
  }

  schema(): SchemaInspector {
    return this.inspector;
  }

  async migrate(): Promise<MigrationReport> {
    return this.runner.apply();
  }

  async health(): Promise<ComponentHealth> {
    return buildPersistenceHealth(this.pool, this.runner, this.cfg.maxPoolSize);
  }

  routes(): Router {
    return registerPersistenceRoutes(this);
  }

  mcp(): readonly McpToolRegistration[] {
    return buildPersistenceMcpTools(this);
  }

  /** Boot: apply migrations, hydrate the KV cache, optionally seed. Never throws. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (!this.pool) {
      this.log.warn('persistence started in degraded mode (no pool) — KV falls back to in-memory');
      return;
    }
    const report = await this.migrate();
    if (!report.ok) {
      this.log.warn({ error: report.error }, 'boot migration incomplete (degrade-safe; continuing)');
    }
    await legacyKv.hydrate();
    if (this.cfg.allowSeed) {
      await runSeeds(this.queryExecutor, this.cfg, this.log);
    }
  }

  /** Shutdown: flush pending KV writes, then drain the pool. Never throws. */
  async stop(): Promise<void> {
    try {
      await legacyKv.flush();
    } catch (err) {
      this.log.warn({ err: err instanceof Error ? err.message : String(err) }, 'KV flush on shutdown failed');
    }
    await drainPool(this.pool, this.log);
  }
}
