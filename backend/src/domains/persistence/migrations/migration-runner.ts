/**
 * `SqlMigrationRunner` — MOVED + generalized from
 * `backend/src/agent-os/migrations/apply-migrations.ts`. Applies the ordered
 * `backend/migrations/*.sql` files against the shared pool, recording each in
 * the `core._recoder_migrations` ledger with a content checksum.
 *
 * Properties (unchanged from the origin pattern):
 *  - Idempotent: an already-recorded file is skipped; the SQL itself uses
 *    `if not exists`, so a re-run against a manually-migrated DB is harmless.
 *  - Degrade-safe: any failure is logged + returned in the report, NEVER thrown
 *    into boot. With no pool it reports `ok:false` and the process still starts.
 *  - Checksum drift: an already-applied file whose bytes changed is reported as
 *    a warning (not re-applied) so edited migrations surface instead of silently
 *    diverging.
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Pool } from 'pg';
import type { Logger } from '../../../shared/logger.js';
import type { PersistenceConfig } from '../config.js';
import type { MigrationRunner } from '../ports/migration-runner.port.js';
import type { MigrationReport, MigrationStatus } from '../types.js';

const LEDGER = 'core._recoder_migrations';

interface LedgerRow {
  filename: string;
  checksum: string;
}

export class SqlMigrationRunner implements MigrationRunner {
  constructor(
    private readonly pool: Pool | null,
    private readonly cfg: PersistenceConfig,
    private readonly log: Logger,
  ) {}

  async apply(): Promise<MigrationReport> {
    const applied: string[] = [];
    const skipped: string[] = [];
    if (!this.pool) {
      return { applied, skipped, ok: false, error: 'no database pool (degraded mode)' };
    }
    const pool = this.pool;

    try {
      const dir = this.resolveDir();
      const files = await this.listFiles(dir);

      // The 0000 file creates the ledger; before it runs the ledger may not
      // exist, so read defensively and treat a missing table as "nothing applied".
      const ledger = await this.readLedger();
      const appliedByName = new Map(ledger.map((r) => [r.filename, r.checksum]));

      for (const file of files) {
        const sql = await readFile(path.join(dir, file), 'utf8');
        const checksum = sha256(sql);
        const priorChecksum = appliedByName.get(file);

        if (priorChecksum !== undefined) {
          if (priorChecksum !== checksum) {
            this.log.warn({ file }, 'migration file changed after apply (checksum drift) — not re-applied');
          }
          skipped.push(file);
          continue;
        }

        const statements = splitStatements(sql);
        for (const statement of statements) {
          await pool.query(statement);
        }
        await pool.query(
          `insert into ${LEDGER} (filename, checksum) values ($1, $2)
           on conflict (filename) do nothing`,
          [file, checksum],
        );
        applied.push(file);
        this.log.info({ file, statements: statements.length }, 'applied migration');
      }

      if (applied.length === 0) {
        this.log.info({ skipped: skipped.length }, 'migrations up to date');
      }
      return { applied, skipped, ok: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.log.warn({ err: error, applied, skipped }, 'migration apply failed (degrade-safe; boot continues)');
      return { applied, skipped, ok: false, error };
    }
  }

  async status(): Promise<MigrationStatus> {
    if (!this.pool) {
      return { applied: [], pending: [], ok: false, error: 'no database pool (degraded mode)' };
    }
    try {
      const dir = this.resolveDir();
      const files = await this.listFiles(dir);
      const ledger = await this.readLedger();
      const appliedSet = new Set(ledger.map((r) => r.filename));
      return {
        applied: files.filter((f) => appliedSet.has(f)),
        pending: files.filter((f) => !appliedSet.has(f)),
        ok: true,
      };
    } catch (err) {
      return { applied: [], pending: [], ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Read the ledger, tolerating its non-existence before 0000 runs. */
  private async readLedger(): Promise<LedgerRow[]> {
    if (!this.pool) return [];
    try {
      const res = await this.pool.query<LedgerRow>(`select filename, checksum from ${LEDGER}`);
      return res.rows;
    } catch {
      return []; // table not created yet → treat as empty
    }
  }

  private async listFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir);
    return entries.filter((f) => f.endsWith('.sql')).sort();
  }

  /**
   * Resolve the migrations directory: an explicit config override wins;
   * otherwise search upward from `__dirname` and `process.cwd()` for a
   * `migrations` dir containing `0000_extensions_and_ledger.sql`.
   */
  private resolveDir(): string {
    if (this.cfg.migrationsDir) return this.cfg.migrationsDir;

    const marker = '0000_extensions_and_ledger.sql';
    const roots = [__dirname, process.cwd()];
    for (const root of roots) {
      let current = root;
      for (let depth = 0; depth < 8; depth++) {
        const candidate = path.join(current, 'migrations');
        if (existsSync(path.join(candidate, marker))) return candidate;
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }
    // Last resort: the conventional location relative to the compiled file.
    return path.resolve(__dirname, '../../../../migrations');
  }
}

/** Build a runner. */
export function createMigrationRunner(pool: Pool | null, cfg: PersistenceConfig, log: Logger): SqlMigrationRunner {
  return new SqlMigrationRunner(pool, cfg, log);
}

/** SHA-256 hex of a migration file's bytes. */
function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Split a SQL file into statements on top-level semicolons.
 *
 * A single left-to-right scan that is aware of SQL lexical structure, so a `;`
 * that lives inside a string/dollar-quoted literal or a comment never severs a
 * statement:
 *  - single-quoted string literals (with `''` escapes) are preserved verbatim;
 *  - `$tag$ ... $tag$` dollar-quoted literals are preserved verbatim;
 *  - `-- ...` line comments and `/* ... *\/` block comments are DROPPED
 *    (including any `;` inside them — the source of the original mis-split where
 *    an inline `-- TTL; ...` comment cut a CREATE TABLE into invalid fragments).
 *
 * Only a `;` seen at top level (outside every literal/comment) ends a statement.
 * A failure here previously returned `ok:false` and, under degrade-safe boot,
 * left the DB half-migrated in silence.
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  const flush = (): void => {
    const trimmed = current.trim();
    if (trimmed.length > 0) statements.push(trimmed);
    current = '';
  };

  const n = sql.length;
  let i = 0;
  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Line comment: drop to end of line (its `;` must not split a statement).
    if (ch === '-' && next === '-') {
      i += 2;
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    // Block comment: drop to closing `*/`.
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // Single-quoted string literal (kept verbatim, incl. `''` escapes).
    if (ch === "'") {
      current += ch;
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          current += "''";
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          current += "'";
          i++;
          break;
        }
        current += sql[i];
        i++;
      }
      continue;
    }
    // Dollar-quoted literal `$tag$ ... $tag$` (kept verbatim).
    if (ch === '$') {
      const tagMatch = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        current += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }
    // Top-level statement separator.
    if (ch === ';') {
      flush();
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  flush();
  return statements;
}
