/**
 * `PersistenceConfig` — the typed slice this domain consumes, derived purely
 * from the injected `AppConfig` (ARCHITECTURE §10.8: no `process.env` in domain
 * code). Also hosts the prod-safe DB-URL guard.
 */
import type { AppConfig } from '../../shared/app-config.js';

export interface PersistenceConfig {
  /** Control-plane Postgres URL, or `null` when unconfigured (degrade-safe). */
  readonly databaseUrl: string | null;
  readonly ssl: boolean;
  readonly maxPoolSize: number;
  readonly minPoolSize: number;
  readonly statementTimeoutMs: number;
  readonly allowSeed: boolean;
  /** Explicit migrations dir override; `null` → resolve `<repo>/migrations`. */
  readonly migrationsDir: string | null;
  readonly isProduction: boolean;
}

/** Project the persistence slice out of the whole config. */
export function slicePersistenceConfig(app: AppConfig): PersistenceConfig {
  return {
    databaseUrl: app.database.url,
    ssl: app.database.ssl,
    maxPoolSize: app.database.maxPoolSize,
    minPoolSize: app.database.minPoolSize,
    statementTimeoutMs: app.database.statementTimeoutMs,
    allowSeed: app.database.allowSeed,
    migrationsDir: app.database.migrationsDir,
    isProduction: app.runtime.isProduction,
  };
}

/**
 * Prod-safe DB-URL guard. In production a localhost/sqlite/file URL is almost
 * always config drift; reject it so it surfaces as an explicit boot error rather
 * than a silent connection to the wrong database. Returns the list of problems
 * (empty when the URL is acceptable or unset). Callers decide whether to throw
 * (boot config) or report `down` (runtime).
 */
export function assertProdDatabaseUrl(cfg: PersistenceConfig): readonly string[] {
  const problems: string[] = [];
  if (!cfg.isProduction || !cfg.databaseUrl) return problems;
  const lowered = cfg.databaseUrl.toLowerCase();
  if (lowered.includes('localhost') || lowered.includes('127.0.0.1')) {
    problems.push('DATABASE_URL points at localhost in production (likely config drift).');
  }
  if (lowered.startsWith('sqlite') || lowered.startsWith('file:') || lowered.includes(':memory:')) {
    problems.push('DATABASE_URL uses a sqlite/file driver in production; a real Postgres URL is required.');
  }
  return problems;
}
