import { describe, it, expect, beforeEach } from 'vitest';
import { KvStoreRepository } from '../repositories/kv-store.repository.js';
import type { QueryExecutor } from '../ports/query-executor.port.js';

/** An executor that is NOT available → exercises the in-memory fallback path. */
const unavailableExecutor = {
  isAvailable: () => false,
} as unknown as QueryExecutor;

const silentLog = {
  warn: () => undefined,
  info: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

describe('KvStoreRepository (degraded in-memory fallback)', () => {
  let kv: KvStoreRepository;
  beforeEach(() => {
    kv = new KvStoreRepository(unavailableExecutor, silentLog);
  });

  it('reports non-durable when the executor is unavailable', () => {
    expect(kv.isDurable()).toBe(false);
  });

  it('sets and gets a namespaced JSON value', async () => {
    await kv.setJson('ns', 'k', { a: 1 });
    expect(await kv.getJson('ns', 'k')).toEqual({ a: 1 });
  });

  it('returns null for a missing key', async () => {
    expect(await kv.get('ns', 'nope')).toBeNull();
  });

  it('isolates namespaces', async () => {
    await kv.set('ns1', 'k', 'one');
    await kv.set('ns2', 'k', 'two');
    expect(await kv.get('ns1', 'k')).toBe('one');
    expect(await kv.get('ns2', 'k')).toBe('two');
  });

  it('deletes a key', async () => {
    await kv.set('ns', 'k', 'v');
    await kv.delete('ns', 'k');
    expect(await kv.get('ns', 'k')).toBeNull();
  });

  it('lists live entries sorted by key', async () => {
    await kv.set('ns', 'b', 2);
    await kv.set('ns', 'a', 1);
    const entries = await kv.list('ns');
    expect(entries.map((e) => e.key)).toEqual(['a', 'b']);
    expect(entries[0].version).toBe(1);
  });

  it('bumps the version on overwrite', async () => {
    await kv.set('ns', 'k', 1);
    await kv.set('ns', 'k', 2);
    const entries = await kv.list('ns');
    expect(entries[0].version).toBe(2);
  });

  it('expires a TTL entry', async () => {
    await kv.set('ns', 'k', 'v', { ttlMs: -1 });
    expect(await kv.get('ns', 'k')).toBeNull();
    expect(await kv.list('ns')).toHaveLength(0);
  });
});

/**
 * An executor that reports itself AVAILABLE but whose read/write throw
 * (transient DB fault). A durable write (sk_ keys, locks, idempotency markers)
 * must NOT silently degrade to memory-only — the caller has to learn the durable
 * op failed, so the error is surfaced, not swallowed into the in-memory fallback.
 */
const failingAvailableExecutor = {
  isAvailable: () => true,
  mutate: async () => {
    throw new Error('transient insert failure');
  },
  one: async () => {
    throw new Error('transient read failure');
  },
} as unknown as QueryExecutor;

describe('KvStoreRepository (available pool — surfaces DB faults, never silent write-drop)', () => {
  it('set() rethrows when the pool is available but the write fails', async () => {
    const kv = new KvStoreRepository(failingAvailableExecutor, silentLog);
    await expect(kv.set('ns', 'k', 'v')).rejects.toThrow('transient insert failure');
  });

  it('get() rethrows when the pool is available but the read fails', async () => {
    const kv = new KvStoreRepository(failingAvailableExecutor, silentLog);
    await expect(kv.get('ns', 'k')).rejects.toThrow('transient read failure');
  });

  it('list() rethrows when the pool is available but the read fails — never a false-empty (recoder-6yxg)', async () => {
    const kv = new KvStoreRepository(failingAvailableExecutor, silentLog);
    // Masking a transient fault with the empty in-memory fallback would make
    // durable keys look ABSENT; surface it, mirroring get().
    await expect(kv.list('ns')).rejects.toThrow('transient read failure');
  });
});
