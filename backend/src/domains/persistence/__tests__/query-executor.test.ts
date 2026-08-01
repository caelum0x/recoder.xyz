import { describe, it, expect } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { PgQueryExecutor, createQueryExecutor } from '../query/query-executor.js';
import { AppError, ErrorCode } from '../../../shared/errors.js';

interface LogCall {
  readonly level: 'warn' | 'error';
  readonly obj: unknown;
  readonly msg?: string;
}

function recordingLog(): { log: never; calls: LogCall[] } {
  const calls: LogCall[] = [];
  const log = {
    error: (obj: unknown, msg?: string) => calls.push({ level: 'error', obj, msg }),
    warn: (obj: unknown, msg?: string) => calls.push({ level: 'warn', obj, msg }),
    info: () => undefined,
    debug: () => undefined,
  } as unknown as never;
  return { log, calls };
}

interface QueryCall {
  readonly text: string;
  readonly values: unknown[];
}

/** A fake `Queryable` (pool or client) that records every text+values pair. */
function fakeDb(opts: {
  rows?: Record<string, unknown>[];
  rowCount?: number | null;
  throwOn?: Error;
}): { db: Pick<Pool, 'query'>; calls: QueryCall[] } {
  const calls: QueryCall[] = [];
  const db = {
    query: (async (text: string, values: unknown[]) => {
      calls.push({ text, values });
      if (opts.throwOn) throw opts.throwOn;
      return { rows: opts.rows ?? [], rowCount: opts.rowCount ?? (opts.rows?.length ?? 0) };
    }) as unknown as Pool['query'],
  };
  return { db, calls };
}

describe('PgQueryExecutor — degrade-safe (no pool → fail closed, never fake success)', () => {
  const { log } = recordingLog();
  const executor = createQueryExecutor(null, log);

  it('reports unavailable', () => {
    expect(executor.isAvailable()).toBe(false);
  });

  it('rejects execute/read/one/mutate with SERVICE_UNAVAILABLE instead of empty rows', async () => {
    for (const run of [
      () => executor.execute('select 1'),
      () => executor.read('select 1'),
      () => executor.one('select 1'),
      () => executor.mutate('update t set a = 1'),
    ]) {
      await expect(run()).rejects.toMatchObject({ code: ErrorCode.SERVICE_UNAVAILABLE });
    }
  });

  it('rejects withTransaction with SERVICE_UNAVAILABLE when there is no pool', async () => {
    await expect(
      executor.withTransaction(async () => 1),
    ).rejects.toMatchObject({ code: ErrorCode.SERVICE_UNAVAILABLE });
  });
});

describe('PgQueryExecutor — input guards at the single choke point', () => {
  const { log } = recordingLog();

  it('rejects empty SQL as INVALID_INPUT', async () => {
    const { db } = fakeDb({});
    const ex = new PgQueryExecutor(db, log);
    await expect(ex.execute('')).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('rejects over-long SQL as INVALID_INPUT (never sends it to the driver)', async () => {
    const { db, calls } = fakeDb({});
    const ex = new PgQueryExecutor(db, log);
    const huge = `select ${'a'.repeat(100_001)}`;
    await expect(ex.execute(huge)).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
    expect(calls).toHaveLength(0);
  });

  it('rejects an unsupported param type as INVALID_INPUT and never reaches the driver', async () => {
    const { db, calls } = fakeDb({});
    const ex = new PgQueryExecutor(db, log);
    await expect(
      ex.execute('select * from t where id = :id', { id: () => undefined }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
    expect(calls).toHaveLength(0);
  });
});

describe('PgQueryExecutor — named-param binding reaches the driver positionally', () => {
  const { log } = recordingLog();

  it('compiles :name to $n and passes an ordered values array', async () => {
    const { db, calls } = fakeDb({ rows: [{ id: 'x' }] });
    const ex = new PgQueryExecutor(db, log);
    await ex.execute('select * from core.kv_store where namespace = :ns and key = :key', {
      ns: 'sess',
      key: 'k1',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain('$1');
    expect(calls[0].text).toContain('$2');
    expect(calls[0].text).not.toContain(':ns');
    expect(calls[0].values).toEqual(['sess', 'k1']);
  });

  it('one() returns the first row, or null when there are none', async () => {
    const { log: l } = recordingLog();
    const hit = new PgQueryExecutor(fakeDb({ rows: [{ n: 1 }, { n: 2 }] }).db, l);
    expect(await hit.one('select n')).toEqual({ n: 1 });
    const miss = new PgQueryExecutor(fakeDb({ rows: [] }).db, l);
    expect(await miss.one('select n')).toBeNull();
  });

  it('mutate() returns the affected row count', async () => {
    const ex = new PgQueryExecutor(fakeDb({ rows: [], rowCount: 7 }).db, log);
    expect(await ex.mutate('update t set a = 1')).toBe(7);
  });

  it('mutate() returns 0 when rowCount is null', async () => {
    const ex = new PgQueryExecutor(fakeDb({ rows: [], rowCount: null }).db, log);
    expect(await ex.mutate('update t set a = 1')).toBe(0);
  });
});

describe('PgQueryExecutor — error message sanitization on driver failure', () => {
  it('wraps a driver error as INTERNAL_ERROR and strips secrets from the message', async () => {
    const { log } = recordingLog();
    const leaky = new Error('connect ECONNREFUSED postgres://recoder:pw@10.0.0.9:5432/db');
    const ex = new PgQueryExecutor(fakeDb({ throwOn: leaky }).db, log);
    let caught: unknown;
    try {
      await ex.execute('select 1');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AppError);
    const err = caught as AppError;
    expect(err.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(err.message).not.toContain('postgres://');
    expect(err.message).not.toContain('10.0.0.9');
    expect(err.message).toContain('[connection_string]');
  });
});

describe('PgQueryExecutor — suspicious query is warned but not blocked', () => {
  it('runs a parameterized query that trips a pattern and logs a warning', async () => {
    const { log, calls: logCalls } = recordingLog();
    const { db, calls } = fakeDb({ rows: [{ ok: true }] });
    const ex = new PgQueryExecutor(db, log);
    // Legitimate positional query text that still matches the advisory pattern.
    await ex.execute('select a from x UNION SELECT b from y');
    expect(calls).toHaveLength(1); // executed, not blocked
    expect(logCalls.some((c) => c.level === 'warn')).toBe(true);
  });
});

describe('PgQueryExecutor — withTransaction over a fake pool', () => {
  interface FakeClient extends Partial<PoolClient> {
    statements: string[];
    released: boolean;
  }

  function fakePool(): { pool: Pool; client: FakeClient } {
    const client: FakeClient = {
      statements: [],
      released: false,
      query: (async (sql: string) => {
        client.statements.push(typeof sql === 'string' ? sql.trim().split(/\s+/)[0].toUpperCase() : 'Q');
        return { rows: [{ n: 1 }], rowCount: 1 };
      }) as unknown as PoolClient['query'],
      release: (() => {
        client.released = true;
      }) as PoolClient['release'],
    };
    const pool = { connect: async () => client } as unknown as Pool;
    return { pool, client };
  }

  it('BEGIN/COMMIT and releases when the fn succeeds', async () => {
    const { log } = recordingLog();
    const { pool, client } = fakePool();
    const ex = createQueryExecutor(pool, log);
    const out = await ex.withTransaction(async (tx) => tx.one('select 1 as n'));
    expect(out).toEqual({ n: 1 });
    expect(client.statements).toContain('BEGIN');
    expect(client.statements).toContain('COMMIT');
    expect(client.statements).not.toContain('ROLLBACK');
    expect(client.released).toBe(true);
  });

  it('BEGIN/ROLLBACK and releases when the fn throws', async () => {
    const { log } = recordingLog();
    const { pool, client } = fakePool();
    const ex = createQueryExecutor(pool, log);
    await expect(
      ex.withTransaction(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(client.statements).toContain('BEGIN');
    expect(client.statements).toContain('ROLLBACK');
    expect(client.statements).not.toContain('COMMIT');
    expect(client.released).toBe(true);
  });

  it('reuses the same client for a nested withTransaction (flat, no second BEGIN)', async () => {
    const { log } = recordingLog();
    const { pool, client } = fakePool();
    const ex = createQueryExecutor(pool, log);
    await ex.withTransaction(async (tx) => {
      await tx.withTransaction(async (inner) => inner.mutate('update t set a = 1'));
    });
    const begins = client.statements.filter((s) => s === 'BEGIN').length;
    const commits = client.statements.filter((s) => s === 'COMMIT').length;
    expect(begins).toBe(1);
    expect(commits).toBe(1);
  });
});
