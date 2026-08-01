/**
 * Regression suite for {@link DeviceGrantRepository} — the RFC-8628 CLI
 * device-flow persistence seam (a credential-issuance path).
 *
 * The repository's safety is entirely in its guarded state transitions: the raw
 * device code is never stored (only its sha256 hash), `approve` only fires on a
 * still-pending, unexpired grant, and `consume` is single-use. These are the
 * invariants that make the token-exchange path race-safe. Since the repo depends
 * only on an injectable {@link QueryExecutor} + {@link Logger}, a fake executor
 * that returns controlled row/count values makes the transition→boolean mapping,
 * parameter binding, and row mapping fully unit-testable without a database.
 */
import { describe, it, expect } from 'vitest';
import { DeviceGrantRepository, createDeviceGrantRepository } from './device-flow.repository.js';
import type { QueryExecutor, QueryParams } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type { Logger } from '../../../shared/logger.js';
import type { NewDeviceGrantRecord } from '../ports/device-flow.port.js';

// --- Fakes ------------------------------------------------------------------

/** A recorded call to the executor, so tests can assert the SQL + bound params. */
interface Call {
  readonly method: 'one' | 'mutate' | 'execute' | 'read';
  readonly sql: string;
  readonly params: QueryParams;
}

interface FakeExecutorOpts {
  /** Row returned by `one` (INSERT ... RETURNING / SELECT). `null` = no row. */
  readonly oneResult?: QueryRow | null;
  /** Affected-row count returned by `mutate`. */
  readonly mutateCount?: number;
  /** When set, `mutate` rejects with this error (drives best-effort paths). */
  readonly mutateThrows?: Error;
}

/**
 * A {@link QueryExecutor} double that records every call and returns controlled
 * values. Only the surfaces the repository actually uses are meaningful; the
 * rest throw so an accidental new dependency is caught.
 */
function fakeExecutor(opts: FakeExecutorOpts = {}): { exec: QueryExecutor; calls: Call[] } {
  const calls: Call[] = [];
  const exec: QueryExecutor = {
    async one<T extends QueryRow = QueryRow>(sql: string, params: QueryParams = {}): Promise<T | null> {
      calls.push({ method: 'one', sql, params });
      return (opts.oneResult ?? null) as T | null;
    },
    async mutate(sql: string, params: QueryParams = {}): Promise<number> {
      calls.push({ method: 'mutate', sql, params });
      if (opts.mutateThrows) throw opts.mutateThrows;
      return opts.mutateCount ?? 0;
    },
    async execute<T extends QueryRow = QueryRow>(): Promise<readonly T[]> {
      throw new Error('execute not used by DeviceGrantRepository');
    },
    async read<T extends QueryRow = QueryRow>(): Promise<readonly T[]> {
      throw new Error('read not used by DeviceGrantRepository');
    },
    async withTransaction<T>(): Promise<T> {
      throw new Error('withTransaction not used by DeviceGrantRepository');
    },
    isAvailable(): boolean {
      return true;
    },
  };
  return { exec, calls };
}

/** A logger double that records warnings so best-effort paths are observable. */
function fakeLogger(): { log: Logger; warns: Array<{ ctx: unknown; msg: string }> } {
  const warns: Array<{ ctx: unknown; msg: string }> = [];
  const log = {
    info: () => {},
    warn: (ctx: unknown, msg?: string) => {
      warns.push({ ctx, msg: msg ?? '' });
    },
    error: () => {},
    debug: () => {},
  } as unknown as Logger;
  return { log, warns };
}

/** A fully-populated raw `device_grant` row (node-postgres column shape). */
function grantRow(overrides: Partial<QueryRow> = {}): QueryRow {
  return {
    id: 'dg_1',
    device_code_hash: 'sha256-of-device-code',
    user_code: 'WDJB-MJHT',
    user_id: 'user_42',
    status: 'pending',
    scopes: ['read', 'write'],
    client_id: 'cli',
    interval_seconds: 5,
    last_polled_at: null,
    approved_at: null,
    expires_at: new Date('2030-01-01T00:00:00.000Z'),
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

const RAW_DEVICE_CODE = 'raw-device-code-shown-once-never-stored';

function newRecord(overrides: Partial<NewDeviceGrantRecord> = {}): NewDeviceGrantRecord {
  return {
    id: 'dg_1',
    deviceCodeHash: 'sha256-of-device-code',
    userCode: 'WDJB-MJHT',
    clientId: 'cli',
    scopes: ['read', 'write'],
    intervalSeconds: 5,
    expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

// --- create -----------------------------------------------------------------

describe('DeviceGrantRepository.create — secret-never-stored insert', () => {
  it('inserts with a literal pending status and binds the hash, not the raw device code', async () => {
    const { exec, calls } = fakeExecutor({ oneResult: grantRow() });
    const { log } = fakeLogger();
    const repo = new DeviceGrantRepository(exec, log);

    const grant = await repo.create(newRecord({ deviceCodeHash: 'sha256-of-device-code' }));

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.method).toBe('one');
    // Status is a SQL literal, not a bound param — it can never be 'approved' on insert.
    expect(call.sql).toContain("'pending'");
    expect(call.sql).toContain('insert into identity.device_grant');
    expect(call.sql).toContain('returning *');

    // The hash is bound; the raw device code must NEVER appear in the params.
    expect(call.params.device_code_hash).toBe('sha256-of-device-code');
    const paramBlob = JSON.stringify(call.params);
    expect(paramBlob).not.toContain(RAW_DEVICE_CODE);
    // No `status` param — it is a literal, so a caller cannot inject an approved grant.
    expect(call.params).not.toHaveProperty('status');

    expect(grant.id).toBe('dg_1');
  });

  it('JSON-stringifies scopes for the ::jsonb column', async () => {
    const { exec, calls } = fakeExecutor({ oneResult: grantRow() });
    const repo = new DeviceGrantRepository(exec, fakeLogger().log);

    await repo.create(newRecord({ scopes: ['read', 'write'] }));

    expect(calls[0].params.scopes).toBe('["read","write"]');
  });

  it('defaults absent scopes to an empty JSON array', async () => {
    const { exec, calls } = fakeExecutor({ oneResult: grantRow() });
    const repo = new DeviceGrantRepository(exec, fakeLogger().log);

    // scopes is required by the type, but the impl guards `?? []` — exercise it.
    await repo.create({ ...newRecord(), scopes: undefined as unknown as readonly string[] });

    expect(calls[0].params.scopes).toBe('[]');
  });

  it('binds expires_at as an ISO string (never a Date object)', async () => {
    const { exec, calls } = fakeExecutor({ oneResult: grantRow() });
    const repo = new DeviceGrantRepository(exec, fakeLogger().log);

    await repo.create(newRecord({ expiresAt: new Date('2030-06-15T12:34:56.000Z') }));

    expect(calls[0].params.expires_at).toBe('2030-06-15T12:34:56.000Z');
  });

  it('FAIL-CLOSED: throws when the insert returns no row (never fabricates a grant)', async () => {
    const { exec } = fakeExecutor({ oneResult: null });
    const repo = new DeviceGrantRepository(exec, fakeLogger().log);

    await expect(repo.create(newRecord())).rejects.toThrow('device_grant insert returned no row');
  });
});

// --- findByDeviceCodeHash / findByUserCode ----------------------------------

describe('DeviceGrantRepository.findByDeviceCodeHash — the polling lookup', () => {
  it('returns null when no row matches (unknown/expired device code)', async () => {
    const { exec, calls } = fakeExecutor({ oneResult: null });
    const repo = new DeviceGrantRepository(exec, fakeLogger().log);

    const found = await repo.findByDeviceCodeHash('nope');

    expect(found).toBeNull();
    expect(calls[0].sql).toContain('device_code_hash = :hash');
    expect(calls[0].params).toEqual({ hash: 'nope' });
  });

  it('maps a matched row to a DeviceGrant and binds :hash', async () => {
    const { exec, calls } = fakeExecutor({ oneResult: grantRow({ device_code_hash: 'h1' }) });
    const repo = new DeviceGrantRepository(exec, fakeLogger().log);

    const found = await repo.findByDeviceCodeHash('h1');

    expect(found).not.toBeNull();
    expect(found?.deviceCodeHash).toBe('h1');
    expect(calls[0].params.hash).toBe('h1');
  });
});

describe('DeviceGrantRepository.findByUserCode — the browser-approval lookup', () => {
  it('returns null when no row matches', async () => {
    const { exec } = fakeExecutor({ oneResult: null });
    const repo = new DeviceGrantRepository(exec, fakeLogger().log);

    expect(await repo.findByUserCode('WDJB-MJHT')).toBeNull();
  });

  it('maps a matched row and binds :user_code', async () => {
    const { exec, calls } = fakeExecutor({ oneResult: grantRow({ user_code: 'ABCD-EFGH' }) });
    const repo = new DeviceGrantRepository(exec, fakeLogger().log);

    const found = await repo.findByUserCode('ABCD-EFGH');

    expect(found?.userCode).toBe('ABCD-EFGH');
    expect(calls[0].sql).toContain('user_code = :user_code');
    expect(calls[0].params).toEqual({ user_code: 'ABCD-EFGH' });
  });
});

// --- approve (single atomic transition) -------------------------------------

describe('DeviceGrantRepository.approve — single atomic pending→approved transition', () => {
  it('returns true only when a row actually transitioned (count > 0)', async () => {
    const { exec, calls } = fakeExecutor({ mutateCount: 1 });
    const repo = new DeviceGrantRepository(exec, fakeLogger().log);

    const ok = await repo.approve('dg_1', 'user_42');

    expect(ok).toBe(true);
    // The guard clause is what makes approval atomic and single-shot.
    expect(calls[0].sql).toContain("status = 'pending'");
    expect(calls[0].sql).toContain('expires_at > now()');
    expect(calls[0].sql).toContain("status = 'approved'");
    expect(calls[0].params).toEqual({ id: 'dg_1', user_id: 'user_42' });
  });

  it('FAIL-CLOSED: returns false when no row matched (already approved / expired)', async () => {
    const { exec } = fakeExecutor({ mutateCount: 0 });
    const repo = new DeviceGrantRepository(exec, fakeLogger().log);

    // A second concurrent approve, or an expired grant, changes zero rows.
    expect(await repo.approve('dg_1', 'user_42')).toBe(false);
  });
});

// --- consume (single-use) ---------------------------------------------------

describe('DeviceGrantRepository.consume — single-use approved→consumed', () => {
  it('returns true on the first consume of an approved grant (count > 0)', async () => {
    const { exec, calls } = fakeExecutor({ mutateCount: 1 });
    const repo = new DeviceGrantRepository(exec, fakeLogger().log);

    const ok = await repo.consume('dg_1');

    expect(ok).toBe(true);
    // Only an approved grant may be consumed — the guard prevents double-spend.
    expect(calls[0].sql).toContain("status = 'consumed'");
    expect(calls[0].sql).toContain("status = 'approved'");
    expect(calls[0].params).toEqual({ id: 'dg_1' });
  });

  it('FAIL-CLOSED: returns false on a repeat consume or a non-approved grant (count 0)', async () => {
    const { exec } = fakeExecutor({ mutateCount: 0 });
    const repo = new DeviceGrantRepository(exec, fakeLogger().log);

    // The row is already 'consumed' (or never approved) → zero rows change.
    expect(await repo.consume('dg_1')).toBe(false);
  });
});

// --- touchPolled (best-effort) ----------------------------------------------

describe('DeviceGrantRepository.touchPolled — best-effort poll timestamp', () => {
  it('binds :id and updates last_polled_at on the happy path', async () => {
    const { exec, calls } = fakeExecutor({ mutateCount: 1 });
    const repo = new DeviceGrantRepository(exec, fakeLogger().log);

    await repo.touchPolled('dg_1');

    expect(calls[0].sql).toContain('last_polled_at = now()');
    expect(calls[0].params).toEqual({ id: 'dg_1' });
  });

  it('swallows executor failures (a failed poll-timestamp must never break polling) and warns', async () => {
    const { exec } = fakeExecutor({ mutateThrows: new Error('db down') });
    const { log, warns } = fakeLogger();
    const repo = new DeviceGrantRepository(exec, log);

    await expect(repo.touchPolled('dg_1')).resolves.toBeUndefined();
    expect(warns).toHaveLength(1);
    expect(warns[0].msg).toContain('touchPolled failed');
    expect(warns[0].ctx).toMatchObject({ err: 'db down', id: 'dg_1' });
  });
});

// --- expireStale ------------------------------------------------------------

describe('DeviceGrantRepository.expireStale — only live grants are expired', () => {
  it('binds the live-statuses array and the provided now as ISO, returning the mutated count', async () => {
    const { exec, calls } = fakeExecutor({ mutateCount: 3 });
    const repo = new DeviceGrantRepository(exec, fakeLogger().log);

    const now = new Date('2026-05-05T05:05:05.000Z');
    const count = await repo.expireStale(now);

    expect(count).toBe(3);
    expect(calls[0].sql).toContain("status = 'expired'");
    expect(calls[0].sql).toContain('expires_at <= :now');
    // Only pending/approved grants are eligible — consumed/expired are left alone.
    expect(calls[0].params.live).toEqual(['pending', 'approved']);
    expect(calls[0].params.now).toBe('2026-05-05T05:05:05.000Z');
  });

  it("defaults now to the current time when omitted (bound as ISO)", async () => {
    const { exec, calls } = fakeExecutor({ mutateCount: 0 });
    const repo = new DeviceGrantRepository(exec, fakeLogger().log);

    const before = Date.now();
    const count = await repo.expireStale();
    const after = Date.now();

    expect(count).toBe(0);
    const boundNow = new Date(String(calls[0].params.now)).getTime();
    expect(boundNow).toBeGreaterThanOrEqual(before);
    expect(boundNow).toBeLessThanOrEqual(after);
  });
});

// --- mapGrant (row mapping, exercised via the public reads) ------------------

describe('mapGrant — row mapping invariants (via findByDeviceCodeHash)', () => {
  async function mapVia(row: QueryRow) {
    const { exec } = fakeExecutor({ oneResult: row });
    const repo = new DeviceGrantRepository(exec, fakeLogger().log);
    const grant = await repo.findByDeviceCodeHash('h');
    if (!grant) throw new Error('expected a mapped grant');
    return grant;
  }

  it('passes a null user_id through as null (unapproved grant has no user)', async () => {
    const grant = await mapVia(grantRow({ user_id: null }));
    expect(grant.userId).toBeNull();
  });

  it('maps a present user_id to a string', async () => {
    const grant = await mapVia(grantRow({ user_id: 12345 }));
    expect(grant.userId).toBe('12345');
  });

  it('falls back to epoch (new Date(0)) when expires_at is null', async () => {
    const grant = await mapVia(grantRow({ expires_at: null }));
    expect(grant.expiresAt.getTime()).toBe(0);
  });

  it('maps last_polled_at / approved_at nulls through as null', async () => {
    const grant = await mapVia(grantRow({ last_polled_at: null, approved_at: null }));
    expect(grant.lastPolledAt).toBeNull();
    expect(grant.approvedAt).toBeNull();
  });

  describe('parseScopes', () => {
    it('passes an already-parsed array through (node-postgres jsonb)', async () => {
      const grant = await mapVia(grantRow({ scopes: ['read', 'write'] }));
      expect(grant.scopes).toEqual(['read', 'write']);
    });

    it('parses a JSON-string array (defensive path)', async () => {
      const grant = await mapVia(grantRow({ scopes: '["a","b"]' }));
      expect(grant.scopes).toEqual(['a', 'b']);
    });

    it('yields [] for a malformed scopes string rather than throwing', async () => {
      const grant = await mapVia(grantRow({ scopes: 'not-json' }));
      expect(grant.scopes).toEqual([]);
    });

    it('yields [] for a null scopes column', async () => {
      const grant = await mapVia(grantRow({ scopes: null }));
      expect(grant.scopes).toEqual([]);
    });
  });
});

// --- factory ----------------------------------------------------------------

describe('createDeviceGrantRepository', () => {
  it('constructs a working repository bound to the given executor', async () => {
    const { exec, calls } = fakeExecutor({ mutateCount: 1 });
    const repo = createDeviceGrantRepository(exec, fakeLogger().log);

    expect(repo).toBeInstanceOf(DeviceGrantRepository);
    expect(await repo.consume('dg_1')).toBe(true);
    expect(calls).toHaveLength(1);
  });
});
