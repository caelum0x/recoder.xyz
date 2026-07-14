/**
 * Agent OS Postgres migration applier.
 *
 * Auto-applies the SQL files in this directory (in lexical order) when the
 * Postgres repository is active, so a fresh `AGENT_OS_REPOSITORY=postgres` boot
 * provisions its schema (including the conductor_workspaces table) without an
 * out-of-band manual step.
 *
 * Properties:
 *  - Idempotent: each file is recorded in a `_recoder_agent_os_migrations` ledger
 *    after it applies; an already-applied file is skipped. The schema SQL itself
 *    also uses `create table/index if not exists`, so re-running is harmless even
 *    against a pre-existing manually-migrated database.
 *  - Degrade-safe: a failure logs and is reported, never thrown into boot. The
 *    process still starts (matching the conductor reconcile / outbox-drain boot
 *    pattern); the repository's own queries surface any real schema gap truthfully.
 *
 * Statements are split on top-level semicolons (the schema files contain plain
 * DDL — no functions/dollar-quoting — so a simple split is correct here).
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { createLogger } from '../../logger';

const logger = createLogger('agent-os-migrations');

type Queryable = Pick<Pool | PoolClient, 'query'>;

const LEDGER_TABLE = '_recoder_agent_os_migrations';

export interface ApplyMigrationsResult {
  /** Migration files that were applied this run. */
  applied: string[];
  /** Migration files already recorded as applied (skipped). */
  skipped: string[];
  /** Whether the run completed without an error (degrade-safe: false on failure). */
  ok: boolean;
  /** Error message when ok === false. */
  error?: string;
}

/**
 * Absolute path to the directory holding the `.sql` migration files.
 *
 * tsc compiles this module to `dist/agent-os/migrations/` but does NOT copy the
 * `.sql` files there, so we resolve the canonical SOURCE directory. `__dirname`
 * is `src/agent-os/migrations` under tsx/vitest (already correct), and
 * `dist/agent-os/migrations` after a compiled build — in the latter case we map
 * back to the sibling `src` tree. Falls back to `__dirname` if neither resolves
 * (a packaging that co-locates the .sql files).
 */
function migrationsDir(): string {
  const here = __dirname;
  if (existsSync(path.join(here, '0001-agent-os-schema.sql'))) {
    return here;
  }
  // dist/agent-os/migrations -> src/agent-os/migrations
  const distMarker = `${path.sep}dist${path.sep}`;
  if (here.includes(distMarker)) {
    const srcDir = here.replace(distMarker, `${path.sep}src${path.sep}`);
    if (existsSync(path.join(srcDir, '0001-agent-os-schema.sql'))) {
      return srcDir;
    }
  }
  return here;
}

/**
 * Split a SQL file into individual statements on top-level semicolons, stripping
 * full-line `--` comments so a comment-only fragment (e.g. the trailing comment
 * after the last `;`) is not sent to Postgres as an empty statement.
 */
function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !/^\s*--/.test(line))
        .join('\n')
        .trim(),
    )
    .filter((statement) => statement.length > 0);
}

/**
 * Apply all `.sql` migration files (idempotently) against `db`. Never throws —
 * returns a result describing what happened so the caller can log it. Intended to
 * run on boot only when the Postgres repository is the active driver.
 */
export async function applyAgentOsMigrations(db: Queryable): Promise<ApplyMigrationsResult> {
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    await db.query(
      `create table if not exists ${LEDGER_TABLE} (
         name text primary key,
         applied_at timestamptz not null default now()
       )`,
    );

    const dir = migrationsDir();
    const entries = await readdir(dir);
    const files = entries.filter((f) => f.endsWith('.sql')).sort();

    const ledger = await db.query<{ name: string }>(`select name from ${LEDGER_TABLE}`);
    const alreadyApplied = new Set(ledger.rows.map((r) => r.name));

    for (const file of files) {
      if (alreadyApplied.has(file)) {
        skipped.push(file);
        continue;
      }
      const sql = await readFile(path.join(dir, file), 'utf8');
      const statements = splitStatements(sql);
      for (const statement of statements) {
        await db.query(statement);
      }
      await db.query(`insert into ${LEDGER_TABLE} (name) values ($1) on conflict (name) do nothing`, [file]);
      applied.push(file);
      logger.info({ file, statements: statements.length }, 'applied Agent OS migration');
    }

    if (applied.length === 0) {
      logger.info({ skipped: skipped.length }, 'Agent OS migrations up to date');
    }
    return { applied, skipped, ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn({ err, applied, skipped }, 'Agent OS migration apply failed (degrade-safe; boot continues)');
    return { applied, skipped, ok: false, error };
  }
}
