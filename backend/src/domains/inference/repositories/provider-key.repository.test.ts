/**
 * `PgProviderKeyRepository` — BYOK provider-key METADATA store. Locks the two
 * load-bearing invariants:
 *   1. SECURITY: no ciphertext is ever written here — only presence + `vault_ref`
 *      + `key_version` for rotation/routing audit. The upsert binds EXACTLY
 *      { user_id, provider, vault_ref } (never a raw key), and all SQL is
 *      parameterized `:param` (tenant-scoped by `user_id`), never interpolated.
 *   2. DEGRADE-SAFE: when the executor is unavailable, every write no-ops and
 *      every read returns empty/null/false WITHOUT touching the executor; a
 *      thrown query degrades the same truthful way and never propagates.
 *
 * Pure unit: an injected fake `QueryExecutor` records calls; no Postgres.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import { PgProviderKeyRepository } from './provider-key.repository.js';

const log = { info() {}, warn() {}, error() {}, debug() {} } as unknown as Logger;

function executor(over: Partial<QueryExecutor> & { available?: boolean } = {}): QueryExecutor {
  return {
    execute: vi.fn(async () => []),
    one: vi.fn(async () => null),
    read: vi.fn(async () => []),
    mutate: vi.fn(async () => 0),
    withTransaction: vi.fn(),
    isAvailable: () => over.available ?? true,
    ...over,
  } as unknown as QueryExecutor;
}

const ROW: QueryRow = {
  user_id: 'user-A',
  provider: 'openai',
  key_version: 3,
  vault_ref: 'vault://keys/user-A/openai',
  last_used_at: new Date('2026-01-02T00:00:00.000Z'),
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  rotated_at: null,
} as unknown as QueryRow;

describe('PgProviderKeyRepository — durability probe', () => {
  it('mirrors the executor availability', () => {
    expect(new PgProviderKeyRepository(executor({ available: true }), log).isDurable()).toBe(true);
    expect(new PgProviderKeyRepository(executor({ available: false }), log).isDurable()).toBe(false);
  });
});

describe('PgProviderKeyRepository — SECURITY: metadata only, tenant-scoped', () => {
  it('upsert binds ONLY { user_id, provider, vault_ref } — never a raw key/ciphertext', async () => {
    const one = vi.fn(async () => ROW);
    const repo = new PgProviderKeyRepository(executor({ one }), log);

    await repo.upsert({ userId: 'user-A', provider: 'openai', vaultRef: 'vault://keys/user-A/openai' });

    const [sql, params] = one.mock.calls[0]!;
    // Exactly the metadata columns — no secret/apikey/ciphertext binding.
    expect(params).toEqual({ user_id: 'user-A', provider: 'openai', vault_ref: 'vault://keys/user-A/openai' });
    expect(Object.keys(params as object)).toEqual(['user_id', 'provider', 'vault_ref']);
    const lowered = String(sql).toLowerCase();
    expect(lowered).not.toContain('ciphertext');
    expect(lowered).not.toContain('secret');
    expect(lowered).not.toMatch(/api_?key/);
    // Parameterized, never interpolated.
    expect(sql).toContain(':user_id');
    expect(sql).toContain(':vault_ref');
  });

  it('upsert coalesces a missing vaultRef to null (presence-only record)', async () => {
    const one = vi.fn(async () => ROW);
    const repo = new PgProviderKeyRepository(executor({ one }), log);
    await repo.upsert({ userId: 'user-A', provider: 'anthropic' });
    expect(one.mock.calls[0]![1]).toEqual({ user_id: 'user-A', provider: 'anthropic', vault_ref: null });
  });

  it('listForUser scopes the read by user_id (the tenant boundary)', async () => {
    const read = vi.fn(async () => [ROW]);
    const repo = new PgProviderKeyRepository(executor({ read }), log);
    const rows = await repo.listForUser('user-A');
    expect(read).toHaveBeenCalledWith(expect.stringContaining('where user_id = :user_id'), { user_id: 'user-A' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: 'user-A', provider: 'openai', keyVersion: 3 });
  });

  it('get scopes by BOTH user_id AND provider', async () => {
    const one = vi.fn(async () => ROW);
    const repo = new PgProviderKeyRepository(executor({ one }), log);
    await repo.get('user-A', 'openai');
    const [sql, params] = one.mock.calls[0]!;
    expect(sql).toContain('user_id = :user_id');
    expect(sql).toContain('provider = :provider');
    expect(params).toEqual({ user_id: 'user-A', provider: 'openai' });
  });

  it('rotate increments key_version + stamps rotated_at (parameterized)', async () => {
    const one = vi.fn(async () => ({ ...ROW, key_version: 4 }) as unknown as QueryRow);
    const repo = new PgProviderKeyRepository(executor({ one }), log);
    const record = await repo.rotate('user-A', 'openai');
    expect(one.mock.calls[0]![0]).toContain('key_version = key_version + 1');
    expect(one.mock.calls[0]![0]).toContain('rotated_at = now()');
    expect(record?.keyVersion).toBe(4);
  });
});

describe('PgProviderKeyRepository — DEGRADE-SAFE when the executor is unavailable', () => {
  it('reads return empty/null and writes no-op WITHOUT touching the executor', async () => {
    const one = vi.fn(async () => ROW);
    const read = vi.fn(async () => [ROW]);
    const mutate = vi.fn(async () => 1);
    const repo = new PgProviderKeyRepository(executor({ one, read, mutate, available: false }), log);

    await expect(repo.listForUser('user-A')).resolves.toEqual([]);
    await expect(repo.get('user-A', 'openai')).resolves.toBeNull();
    await expect(repo.upsert({ userId: 'user-A', provider: 'openai' })).resolves.toBeNull();
    await expect(repo.rotate('user-A', 'openai')).resolves.toBeNull();
    await expect(repo.delete('user-A', 'openai')).resolves.toBe(false);
    await expect(repo.markUsed('user-A', 'openai')).resolves.toBeUndefined();

    // No query was ever issued against the unavailable executor.
    expect(one).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });
});

describe('PgProviderKeyRepository — delete + markUsed semantics', () => {
  it('delete returns true only when a row was affected', async () => {
    const hit = new PgProviderKeyRepository(executor({ mutate: vi.fn(async () => 1) }), log);
    const miss = new PgProviderKeyRepository(executor({ mutate: vi.fn(async () => 0) }), log);
    await expect(hit.delete('user-A', 'openai')).resolves.toBe(true);
    await expect(miss.delete('user-A', 'openai')).resolves.toBe(false);
  });

  it('markUsed issues a tenant-scoped last_used_at touch', async () => {
    const mutate = vi.fn(async () => 1);
    const repo = new PgProviderKeyRepository(executor({ mutate }), log);
    await repo.markUsed('user-A', 'openai');
    const [sql, params] = mutate.mock.calls[0]!;
    expect(sql).toContain('last_used_at = now()');
    expect(params).toEqual({ user_id: 'user-A', provider: 'openai' });
  });
});

describe('PgProviderKeyRepository — a thrown query degrades truthfully (never propagates)', () => {
  it('listForUser returns empty when the read throws', async () => {
    const repo = new PgProviderKeyRepository(
      executor({ read: vi.fn(async () => { throw new Error('db down'); }) }),
      log,
    );
    await expect(repo.listForUser('user-A')).resolves.toEqual([]);
  });

  it('get / upsert / rotate return null when the query throws', async () => {
    const boom = vi.fn(async () => { throw new Error('db down'); });
    const repo = new PgProviderKeyRepository(executor({ one: boom }), log);
    await expect(repo.get('user-A', 'openai')).resolves.toBeNull();
    await expect(repo.upsert({ userId: 'user-A', provider: 'openai' })).resolves.toBeNull();
    await expect(repo.rotate('user-A', 'openai')).resolves.toBeNull();
  });

  it('delete returns false and markUsed swallows when the mutation throws', async () => {
    const repo = new PgProviderKeyRepository(
      executor({ mutate: vi.fn(async () => { throw new Error('db down'); }) }),
      log,
    );
    await expect(repo.delete('user-A', 'openai')).resolves.toBe(false);
    await expect(repo.markUsed('user-A', 'openai')).resolves.toBeUndefined();
  });

  it('maps a null rotated_at / last_used_at to null and defaults key_version to 1', async () => {
    const bare: QueryRow = {
      user_id: 'user-B',
      provider: 'groq',
      key_version: null,
      vault_ref: null,
      last_used_at: null,
      created_at: '2026-03-01T00:00:00.000Z',
      rotated_at: null,
    } as unknown as QueryRow;
    const repo = new PgProviderKeyRepository(executor({ one: vi.fn(async () => bare) }), log);
    const record = await repo.get('user-B', 'groq');
    expect(record).toEqual({
      userId: 'user-B',
      provider: 'groq',
      keyVersion: 1,
      vaultRef: null,
      lastUsedAt: null,
      createdAt: '2026-03-01T00:00:00.000Z',
      rotatedAt: null,
    });
  });
});
