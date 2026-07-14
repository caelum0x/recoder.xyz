import { describe, it, expect } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { withTransaction } from '../query/transaction.js';

const silentLog = { error: () => undefined, warn: () => undefined, info: () => undefined } as never;

interface FakeClient extends Partial<PoolClient> {
  statements: string[];
  released: boolean;
}

function fakePool(rows: Record<string, unknown>[] = []): { pool: Pool; client: FakeClient } {
  const client: FakeClient = {
    statements: [],
    released: false,
    query: (async (sql: string) => {
      client.statements.push(typeof sql === 'string' ? sql.trim().toUpperCase().split(' ')[0] : 'QUERY');
      return { rows, rowCount: rows.length };
    }) as unknown as PoolClient['query'],
    release: (() => {
      client.released = true;
    }) as PoolClient['release'],
  };
  const pool = { connect: async () => client } as unknown as Pool;
  return { pool, client };
}

describe('withTransaction', () => {
  it('commits and releases when the fn succeeds', async () => {
    const { pool, client } = fakePool([{ n: 1 }]);
    const result = await withTransaction(pool, silentLog, async (tx) => {
      return tx.one('select 1 as n');
    });
    expect(result).toEqual({ n: 1 });
    expect(client.statements).toContain('BEGIN');
    expect(client.statements).toContain('COMMIT');
    expect(client.statements).not.toContain('ROLLBACK');
    expect(client.released).toBe(true);
  });

  it('rolls back and releases when the fn throws', async () => {
    const { pool, client } = fakePool();
    await expect(
      withTransaction(pool, silentLog, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(client.statements).toContain('BEGIN');
    expect(client.statements).toContain('ROLLBACK');
    expect(client.statements).not.toContain('COMMIT');
    expect(client.released).toBe(true);
  });
});
