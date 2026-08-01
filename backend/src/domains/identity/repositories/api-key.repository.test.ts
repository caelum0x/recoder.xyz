/**
 * Regression suite for {@link PgApiKeyStore} — the ONLY place the `sk_` platform
 * key feature touches Postgres. These tests lock in the security invariants the
 * store encodes in its SQL + param binding, using a capturing fake
 * {@link QueryExecutor} so the store is fully unit-testable with no DB:
 *
 *  - the raw/plaintext key is NEVER a bound param (only `key_hash` + `key_prefix`)
 *  - `findByPrefix` filters `revoked_at is null` (revoked keys never reach validation)
 *  - `revoke` is owner-scoped (`user_id`) + idempotent (count>0 → true)
 *  - `touchLastUsed` swallows faults (a failed write never breaks the hot auth path)
 *  - `isAvailable` delegates truthfully
 *  - row mapping / scope parsing survives jsonb-array, JSON-string, and malformed input
 */
import { describe, it, expect } from 'vitest';
import { PgApiKeyStore } from './api-key.repository.js';
import type { QueryExecutor, QueryParams } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type { NewApiKeyRecord } from '../ports/api-key.port.js';

/** A single captured executor call. */
interface Call {
  readonly method: 'one' | 'read' | 'mutate' | 'execute';
  readonly sql: string;
  readonly params: QueryParams;
}

interface FakeExecutorOpts {
  /** Row returned by `one` (insert `returning *`). `null` simulates a returning-less insert. */
  readonly oneRow?: QueryRow | null;
  /** Rows returned by `read`/`execute` (findByPrefix / listForUser). */
  readonly readRows?: readonly QueryRow[];
  /** Affected-row count returned by `mutate` (revoke / touchLastUsed). */
  readonly mutateCount?: number;
  /** When set, `mutate` rejects with this error (touchLastUsed best-effort path). */
  readonly mutateThrows?: Error;
  /** Value returned by `isAvailable`. */
  readonly available?: boolean;
}

/** A capturing {@link QueryExecutor} double — records every call's sql + params. */
function fakeExecutor(opts: FakeExecutorOpts = {}): { executor: QueryExecutor; calls: Call[] } {
  const calls: Call[] = [];
  const executor: QueryExecutor = {
    async execute<T extends QueryRow = QueryRow>(sql: string, params: QueryParams = {}): Promise<readonly T[]> {
      calls.push({ method: 'execute', sql, params });
      return (opts.readRows ?? []) as readonly T[];
    },
    async one<T extends QueryRow = QueryRow>(sql: string, params: QueryParams = {}): Promise<T | null> {
      calls.push({ method: 'one', sql, params });
      return (opts.oneRow === undefined ? null : opts.oneRow) as T | null;
    },
    async read<T extends QueryRow = QueryRow>(sql: string, params: QueryParams = {}): Promise<readonly T[]> {
      calls.push({ method: 'read', sql, params });
      return (opts.readRows ?? []) as readonly T[];
    },
    async mutate(sql: string, params: QueryParams = {}): Promise<number> {
      calls.push({ method: 'mutate', sql, params });
      if (opts.mutateThrows) throw opts.mutateThrows;
      return opts.mutateCount ?? 0;
    },
    async withTransaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T> {
      return fn(executor);
    },
    isAvailable(): boolean {
      return opts.available ?? true;
    },
  };
  return { executor, calls };
}

/** Captures logger.warn calls so we can assert best-effort faults are logged, not thrown. */
function capturingLogger(): { logger: never; warnings: unknown[][] } {
  const warnings: unknown[][] = [];
  const logger = {
    info: () => {},
    warn: (...args: unknown[]) => {
      warnings.push(args);
    },
    error: () => {},
    debug: () => {},
  } as never;
  return { logger, warnings };
}

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as never;

function newRecord(overrides: Partial<NewApiKeyRecord> = {}): NewApiKeyRecord {
  return {
    id: 'key_1',
    userId: 'u1',
    name: 'ci key',
    keyPrefix: 'sk_live_ab12',
    keyHash: 'a'.repeat(64),
    scopes: ['read', 'write'],
    ...overrides,
  };
}

/** A fully-populated raw row as pg would hand back from `returning *` / `select *`. */
function rawRow(overrides: Partial<QueryRow> = {}): QueryRow {
  return {
    id: 'key_1',
    user_id: 'u1',
    org_id: null,
    name: 'ci key',
    key_prefix: 'sk_live_ab12',
    key_hash: 'a'.repeat(64),
    scopes: ['read', 'write'],
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const RAW_KEY = 'sk_live_ab12cdef34567890raw-secret';

describe('PgApiKeyStore.insert — secret-never-persisted invariant', () => {
  it('binds key_hash + key_prefix but NEVER a raw/plaintext key column', async () => {
    const { executor, calls } = fakeExecutor({ oneRow: rawRow() });
    const store = new PgApiKeyStore(executor, silentLogger);

    await store.insert(newRecord({ keyHash: 'h'.repeat(64), keyPrefix: 'sk_live_zz99' }));

    expect(calls).toHaveLength(1);
    const { sql, params } = calls[0];
    expect(calls[0].method).toBe('one');
    // The hashed representation + indexed prefix are the ONLY key material bound.
    expect(params.key_hash).toBe('h'.repeat(64));
    expect(params.key_prefix).toBe('sk_live_zz99');
    // Deny-by-construction: no raw/plaintext key ever reaches a bound param.
    const paramValues = Object.values(params).map((v) => String(v));
    expect(paramValues).not.toContain(RAW_KEY);
    for (const forbidden of ['key', 'rawKey', 'raw_key', 'plaintext', 'secret', 'token']) {
      expect(Object.prototype.hasOwnProperty.call(params, forbidden)).toBe(false);
    }
    // SQL only writes hash+prefix columns, never a raw key column.
    expect(sql).toContain('key_hash');
    expect(sql).toContain('key_prefix');
    expect(sql).not.toMatch(/\braw_key\b/);
  });

  it('binds org_id = null when the record carries no org, and JSON.stringifies scopes', async () => {
    const { executor, calls } = fakeExecutor({ oneRow: rawRow() });
    const store = new PgApiKeyStore(executor, silentLogger);

    await store.insert(newRecord({ orgId: undefined, scopes: ['read', 'write', 'admin'] }));

    const { params } = calls[0];
    expect(params.org_id).toBeNull();
    expect(params.scopes).toBe(JSON.stringify(['read', 'write', 'admin']));
    expect(typeof params.scopes).toBe('string');
  });

  it('binds the supplied org_id when present', async () => {
    const { executor, calls } = fakeExecutor({ oneRow: rawRow({ org_id: 'org_9' }) });
    const store = new PgApiKeyStore(executor, silentLogger);

    const result = await store.insert(newRecord({ orgId: 'org_9' }));

    expect(calls[0].params.org_id).toBe('org_9');
    expect(result.orgId).toBe('org_9');
  });

  it('throws "insert returned no row" when the returning-less insert yields null (infra fault, not silent success)', async () => {
    const { executor } = fakeExecutor({ oneRow: null });
    const store = new PgApiKeyStore(executor, silentLogger);

    await expect(store.insert(newRecord())).rejects.toThrow('platform_api_key insert returned no row');
  });

  it('maps the returned row into a PlatformApiKey entity', async () => {
    const { executor } = fakeExecutor({
      oneRow: rawRow({ id: 'key_42', user_id: 'u7', created_at: '2026-02-02T00:00:00.000Z' }),
    });
    const store = new PgApiKeyStore(executor, silentLogger);

    const result = await store.insert(newRecord());

    expect(result.id).toBe('key_42');
    expect(result.userId).toBe('u7');
    expect(result.keyHash).toBe('a'.repeat(64));
    expect(result.createdAt).toBeInstanceOf(Date);
    // The mapped entity carries the hash but was built from the DB row, not the raw key.
    expect(JSON.stringify(result)).not.toContain(RAW_KEY);
  });
});

describe('PgApiKeyStore.findByPrefix — revoked keys never reach validation', () => {
  it('filters revoked_at is null and binds :key_prefix', async () => {
    const { executor, calls } = fakeExecutor({ readRows: [rawRow()] });
    const store = new PgApiKeyStore(executor, silentLogger);

    await store.findByPrefix('sk_live_ab12');

    expect(calls).toHaveLength(1);
    const { method, sql, params } = calls[0];
    expect(method).toBe('read');
    // The validation lookup MUST exclude revoked rows — a revoked key can never authenticate.
    expect(sql).toMatch(/revoked_at\s+is\s+null/i);
    expect(sql).toContain('key_prefix = :key_prefix');
    expect(params.key_prefix).toBe('sk_live_ab12');
  });

  it('maps every returned row to a PlatformApiKey entity', async () => {
    const { executor } = fakeExecutor({
      readRows: [rawRow({ id: 'k1' }), rawRow({ id: 'k2' })],
    });
    const store = new PgApiKeyStore(executor, silentLogger);

    const results = await store.findByPrefix('sk_live_ab12');

    expect(results.map((r) => r.id)).toEqual(['k1', 'k2']);
  });

  it('returns [] when no candidate rows match', async () => {
    const { executor } = fakeExecutor({ readRows: [] });
    const store = new PgApiKeyStore(executor, silentLogger);

    expect(await store.findByPrefix('sk_live_none')).toEqual([]);
  });
});

describe('PgApiKeyStore.revoke — owner-scoped + idempotent', () => {
  it('returns true when a row was updated (count > 0)', async () => {
    const { executor } = fakeExecutor({ mutateCount: 1 });
    const store = new PgApiKeyStore(executor, silentLogger);

    expect(await store.revoke('key_1', 'u1')).toBe(true);
  });

  it('returns false when no row matched (count === 0) — idempotent re-revoke', async () => {
    const { executor } = fakeExecutor({ mutateCount: 0 });
    const store = new PgApiKeyStore(executor, silentLogger);

    expect(await store.revoke('key_1', 'u1')).toBe(false);
  });

  it('binds BOTH id and the caller user_id so a cross-user revoke cannot match another owner', async () => {
    const { executor, calls } = fakeExecutor({ mutateCount: 0 });
    const store = new PgApiKeyStore(executor, silentLogger);

    // attacker u_evil tries to revoke a key owned by someone else
    await store.revoke('victim_key', 'u_evil');

    const { method, sql, params } = calls[0];
    expect(method).toBe('mutate');
    expect(params.id).toBe('victim_key');
    expect(params.user_id).toBe('u_evil'); // the CALLER's id is bound — not the victim's
    expect(sql).toContain('user_id = :user_id');
    // Owner-scope + only-un-revoked flips.
    expect(sql).toMatch(/revoked_at\s+is\s+null/i);
    expect(sql).toMatch(/set\s+revoked_at\s*=\s*now\(\)/i);
  });
});

describe('PgApiKeyStore.touchLastUsed — best-effort, never faults the hot path', () => {
  it('issues a bound update on the happy path', async () => {
    const { executor, calls } = fakeExecutor({ mutateCount: 1 });
    const store = new PgApiKeyStore(executor, silentLogger);

    await store.touchLastUsed('key_1');

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('mutate');
    expect(calls[0].params.id).toBe('key_1');
    expect(calls[0].sql).toMatch(/last_used_at\s*=\s*now\(\)/i);
  });

  it('resolves WITHOUT throwing when the update rejects, and logs a warning', async () => {
    const { logger, warnings } = capturingLogger();
    const { executor } = fakeExecutor({ mutateThrows: new Error('pool exhausted') });
    const store = new PgApiKeyStore(executor, logger);

    // A failed last-used touch must NEVER surface into the validation path.
    await expect(store.touchLastUsed('key_1')).resolves.toBeUndefined();
    expect(warnings).toHaveLength(1);
  });
});

describe('PgApiKeyStore.isAvailable — truthful health', () => {
  it('delegates to executor.isAvailable() (true)', () => {
    const { executor } = fakeExecutor({ available: true });
    expect(new PgApiKeyStore(executor, silentLogger).isAvailable()).toBe(true);
  });

  it('delegates to executor.isAvailable() (false)', () => {
    const { executor } = fakeExecutor({ available: false });
    expect(new PgApiKeyStore(executor, silentLogger).isAvailable()).toBe(false);
  });
});

describe('PgApiKeyStore mapRow / parseScopes (via findByPrefix)', () => {
  async function mapOne(row: QueryRow) {
    const { executor } = fakeExecutor({ readRows: [row] });
    const store = new PgApiKeyStore(executor, silentLogger);
    const [entity] = await store.findByPrefix('sk_live_ab12');
    return entity;
  }

  it('passes a jsonb scopes ARRAY through unchanged', async () => {
    const e = await mapOne(rawRow({ scopes: ['read', 'write', 'admin'] }));
    expect(e.scopes).toEqual(['read', 'write', 'admin']);
  });

  it('parses scopes delivered as a JSON STRING', async () => {
    const e = await mapOne(rawRow({ scopes: JSON.stringify(['read', 'internal']) }));
    expect(e.scopes).toEqual(['read', 'internal']);
  });

  it('yields [] for a MALFORMED scopes string (fail-safe: no accidental privilege)', async () => {
    const e = await mapOne(rawRow({ scopes: '{not valid json' }));
    expect(e.scopes).toEqual([]);
  });

  it('yields [] when scopes is a non-array JSON value', async () => {
    const e = await mapOne(rawRow({ scopes: JSON.stringify({ read: true }) }));
    expect(e.scopes).toEqual([]);
  });

  it('maps null date columns to null and coerces created_at', async () => {
    const e = await mapOne(rawRow({ last_used_at: null, expires_at: null, revoked_at: null }));
    expect(e.lastUsedAt).toBeNull();
    expect(e.expiresAt).toBeNull();
    expect(e.revokedAt).toBeNull();
    expect(e.createdAt).toBeInstanceOf(Date);
  });

  it('parses populated date columns into Date instances', async () => {
    const e = await mapOne(
      rawRow({
        last_used_at: '2026-03-03T10:00:00.000Z',
        expires_at: '2026-12-31T00:00:00.000Z',
        revoked_at: '2026-04-04T00:00:00.000Z',
      }),
    );
    expect(e.lastUsedAt).toBeInstanceOf(Date);
    expect(e.expiresAt).toBeInstanceOf(Date);
    expect(e.revokedAt).toBeInstanceOf(Date);
    expect((e.expiresAt as Date).toISOString()).toBe('2026-12-31T00:00:00.000Z');
  });

  it('OMITS orgId from the entity when org_id is null', async () => {
    const e = await mapOne(rawRow({ org_id: null }));
    expect('orgId' in e).toBe(false);
  });

  it('includes orgId when org_id is present', async () => {
    const e = await mapOne(rawRow({ org_id: 'org_5' }));
    expect(e.orgId).toBe('org_5');
  });
});
