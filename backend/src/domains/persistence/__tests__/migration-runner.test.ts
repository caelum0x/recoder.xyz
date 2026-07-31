import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Pool } from 'pg';
import { SqlMigrationRunner, splitStatements } from '../migrations/migration-runner.js';
import type { PersistenceConfig } from '../config.js';

const silentLog = { warn: () => undefined, info: () => undefined, error: () => undefined } as never;

/** A fake pool: records applied statements + a mutable ledger. */
function fakePool() {
  const executed: string[] = [];
  const ledger = new Set<string>();
  const pool = {
    query: (async (sql: string, params?: unknown[]) => {
      const text = sql.trim();
      if (/^select filename, checksum from/i.test(text)) {
        return { rows: [...ledger].map((filename) => ({ filename, checksum: 'x' })), rowCount: ledger.size };
      }
      if (/^insert into core\._recoder_migrations/i.test(text)) {
        ledger.add(String((params as unknown[])[0]));
        return { rows: [], rowCount: 1 };
      }
      executed.push(text.split('\n')[0]);
      return { rows: [], rowCount: 0 };
    }) as unknown as Pool['query'],
  } as unknown as Pool;
  return { pool, executed, ledger };
}

function cfg(dir: string): PersistenceConfig {
  return {
    databaseUrl: 'postgres://x',
    ssl: false,
    maxPoolSize: 10,
    minPoolSize: 0,
    statementTimeoutMs: 0,
    allowSeed: false,
    migrationsDir: dir,
    isProduction: false,
  };
}

describe('SqlMigrationRunner', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'mig-'));
    await writeFile(path.join(dir, '0000_a.sql'), 'create table a (id int);');
    await writeFile(path.join(dir, '0001_b.sql'), 'create table b (id int);');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('applies pending files in lexical order and records the ledger', async () => {
    const { pool, executed } = fakePool();
    const runner = new SqlMigrationRunner(pool, cfg(dir), silentLog);
    const report = await runner.apply();
    expect(report.ok).toBe(true);
    expect(report.applied).toEqual(['0000_a.sql', '0001_b.sql']);
    expect(executed.some((s) => s.includes('create table a'))).toBe(true);
    expect(executed.some((s) => s.includes('create table b'))).toBe(true);
  });

  it('is idempotent — a second run skips already-applied files', async () => {
    const { pool } = fakePool();
    const runner = new SqlMigrationRunner(pool, cfg(dir), silentLog);
    await runner.apply();
    const second = await runner.apply();
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(['0000_a.sql', '0001_b.sql']);
  });

  it('is degrade-safe with no pool (reports ok:false, never throws)', async () => {
    const runner = new SqlMigrationRunner(null, cfg(dir), silentLog);
    const report = await runner.apply();
    expect(report.ok).toBe(false);
    expect(report.applied).toEqual([]);
  });

  it('reports applied vs pending in status()', async () => {
    const { pool } = fakePool();
    const runner = new SqlMigrationRunner(pool, cfg(dir), silentLog);
    let status = await runner.status();
    expect(status.pending).toEqual(['0000_a.sql', '0001_b.sql']);
    await runner.apply();
    status = await runner.status();
    expect(status.applied).toEqual(['0000_a.sql', '0001_b.sql']);
    expect(status.pending).toEqual([]);
  });
});

describe('splitStatements', () => {
  it('splits on top-level semicolons and strips comment-only lines', () => {
    const sql = '-- header\ncreate table a (id int);\ncreate index i on a (id);\n-- trailing';
    expect(splitStatements(sql)).toEqual(['create table a (id int)', 'create index i on a (id)']);
  });

  it('a semicolon INSIDE a comment line never cuts the surrounding statement', () => {
    // Regression: comments were stripped AFTER the ';' split, so "-- ext; note"
    // produced a bogus statement and every fresh-DB migration failed.
    const sql =
      '-- enable the ext; used by the ledger below\ncreate table a (id int);\ncreate index i on a (id);';
    expect(splitStatements(sql)).toEqual(['create table a (id int)', 'create index i on a (id)']);
  });

  it('a `;` inside an INLINE comment does not sever the surrounding CREATE TABLE', () => {
    // Regression (cloud_0001_core.sql:43): an inline `-- ...;...` comment lives on
    // a line that does NOT start with `--`, so full-line stripping missed it and
    // the embedded `;` cut the CREATE TABLE into invalid fragments.
    const sql =
      'create table t (\n' +
      '  a int,\n' +
      '  expires_at timestamptz, -- TTL; reaped when passed (null = no expiry)\n' +
      '  b int\n' +
      ');\n' +
      'create index i on t (a);';
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain('create table t');
    // The statement survived intact past the comment's `;` (would be missing if severed).
    expect(stmts[0]).toContain('b int');
    expect(stmts[1]).toBe('create index i on t (a)');
  });

  it('a `;` inside a STRING literal does not split the statement', () => {
    const sql = "insert into t (msg) values ('a; b');\nselect 1;";
    expect(splitStatements(sql)).toEqual(["insert into t (msg) values ('a; b')", 'select 1']);
  });
});
