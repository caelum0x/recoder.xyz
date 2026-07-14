/**
 * Agent OS migration applier tests.
 *
 * Drives the real applyAgentOsMigrations() against an in-memory fake Queryable
 * (no real Postgres needed), proving:
 *   - all `.sql` files in this directory are applied on a fresh database;
 *   - a second run is a no-op (idempotent via the ledger table);
 *   - a query failure is degrade-safe (ok: false, never throws).
 */
import { describe, it, expect } from 'vitest';
import { applyAgentOsMigrations } from './apply-migrations.js';

type Row = Record<string, unknown>;

/**
 * Minimal in-memory fake of the pg Queryable. Tracks the migration ledger so the
 * idempotency path is exercised end-to-end, and records every statement run.
 */
function makeFakeDb(options: { failOn?: (sql: string) => boolean } = {}) {
  const ledger = new Set<string>();
  const statements: string[] = [];

  const query = async (text: string, params?: unknown[]): Promise<{ rows: Row[] }> => {
    statements.push(text);
    if (options.failOn?.(text)) {
      throw new Error('simulated db failure');
    }
    const sql = text.trim().toLowerCase();
    if (sql.startsWith('select name from')) {
      return { rows: [...ledger].map((name) => ({ name })) };
    }
    if (sql.startsWith('insert into _recoder_agent_os_migrations')) {
      const name = String(params?.[0] ?? '');
      if (name) ledger.add(name);
      return { rows: [] };
    }
    // create table / create index / DDL — accept silently.
    return { rows: [] };
  };

  return { db: { query }, ledger, statements };
}

describe('applyAgentOsMigrations', () => {
  it('applies every .sql file on a fresh database', async () => {
    const { db } = makeFakeDb();
    const result = await applyAgentOsMigrations(db);

    expect(result.ok).toBe(true);
    expect(result.applied.length).toBeGreaterThanOrEqual(2);
    expect(result.applied).toContain('0001-agent-os-schema.sql');
    expect(result.applied).toContain('0002-conductor-workspaces.sql');
    // Files are applied in lexical order.
    expect(result.applied).toEqual([...result.applied].sort());
    expect(result.skipped).toEqual([]);
  });

  it('is idempotent: a second run applies nothing and skips all files', async () => {
    const { db } = makeFakeDb();
    await applyAgentOsMigrations(db);
    const second = await applyAgentOsMigrations(db);

    expect(second.ok).toBe(true);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toContain('0001-agent-os-schema.sql');
    expect(second.skipped).toContain('0002-conductor-workspaces.sql');
  });

  it('actually runs the conductor_workspaces DDL', async () => {
    const { db, statements } = makeFakeDb();
    await applyAgentOsMigrations(db);
    const joined = statements.join('\n').toLowerCase();
    expect(joined).toContain('create table if not exists conductor_workspaces');
  });

  it('is degrade-safe: a query failure returns ok:false and does not throw', async () => {
    const { db } = makeFakeDb({ failOn: (sql) => sql.includes('conductor_workspaces') });
    const result = await applyAgentOsMigrations(db);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
