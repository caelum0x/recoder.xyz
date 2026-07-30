/**
 * FilesystemApiKeyStore — the DB-less durable sk_ store shared by mint + validate.
 *
 * Proves the ApiKeyStore contract over a file: insert persists a hashed record
 * (raw key never involved), findByPrefix returns only un-revoked matches,
 * listForUser is owner-scoped + newest-first, revoke is owner-scoped/idempotent,
 * touchLastUsed is best-effort, and the store survives a reload (dates revive to
 * Date). A corrupt file reads as empty (never throws).
 */
import { describe, it, expect } from 'vitest';
import { FilesystemApiKeyStore, type KeyFileFs } from './filesystem-api-key.repository.js';
import type { NewApiKeyRecord } from '../ports/api-key.port.js';

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, child() { return noopLogger; } } as never;

/** In-memory file seam shared across store instances (simulates persistence). */
function memFs(initial: string | null = null): KeyFileFs & { content: string | null } {
  const box = {
    content: initial,
    read() {
      return box.content;
    },
    write(c: string) {
      box.content = c;
    },
  };
  return box;
}

function rec(over: Partial<NewApiKeyRecord> = {}): NewApiKeyRecord {
  return {
    id: 'key_1',
    userId: 'user_1',
    name: 'desktop',
    keyPrefix: 'sk_live_ab12',
    keyHash: 'HASH_ONLY_never_raw',
    scopes: ['conductor:write'],
    ...over,
  };
}

function store(fs: KeyFileFs, now = () => new Date('2026-07-30T00:00:00Z')) {
  return new FilesystemApiKeyStore({ logger: noopLogger, fs, now });
}

describe('FilesystemApiKeyStore', () => {
  it('inserts a hashed record and finds it by prefix (raw key never persisted)', async () => {
    const fs = memFs();
    const s = store(fs);
    const inserted = await s.insert(rec());
    expect(inserted.keyHash).toBe('HASH_ONLY_never_raw');
    expect(inserted.revokedAt).toBeNull();
    const found = await s.findByPrefix('sk_live_ab12');
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('key_1');
    // The raw key is nowhere in the persisted file — only the hash.
    expect(fs.content).not.toContain('sk_live_ab12rawsecret');
    expect(fs.content).toContain('HASH_ONLY_never_raw');
  });

  it('survives a reload — a fresh store over the same file sees the key (dates revived)', async () => {
    const fs = memFs();
    await store(fs).insert(rec({ expiresAt: new Date('2027-01-01T00:00:00Z') }));
    const reloaded = store(fs);
    const found = await reloaded.findByPrefix('sk_live_ab12');
    expect(found).toHaveLength(1);
    expect(found[0].expiresAt).toBeInstanceOf(Date);
    expect(found[0].createdAt).toBeInstanceOf(Date);
  });

  it('findByPrefix excludes revoked keys; revoke is owner-scoped + idempotent', async () => {
    const fs = memFs();
    const s = store(fs);
    await s.insert(rec());
    expect(await s.revoke('key_1', 'other_user')).toBe(false); // not the owner
    expect(await s.revoke('key_1', 'user_1')).toBe(true);
    expect(await s.revoke('key_1', 'user_1')).toBe(false); // already revoked
    expect(await s.findByPrefix('sk_live_ab12')).toHaveLength(0);
  });

  it('listForUser is owner-scoped and newest-first', async () => {
    const fs = memFs();
    const s = new FilesystemApiKeyStore({
      logger: noopLogger,
      fs,
      now: () => new Date('2026-07-30T00:00:00Z'),
    });
    await s.insert(rec({ id: 'a', userId: 'u1' }));
    // second key with a later createdAt via a distinct store/now
    const s2 = new FilesystemApiKeyStore({ logger: noopLogger, fs, now: () => new Date('2026-07-31T00:00:00Z') });
    await s2.insert(rec({ id: 'b', userId: 'u1', keyPrefix: 'sk_live_cd34' }));
    await s2.insert(rec({ id: 'c', userId: 'u2', keyPrefix: 'sk_live_ef56' }));
    const list = await s2.listForUser('u1');
    expect(list.map((k) => k.id)).toEqual(['b', 'a']); // newest first, only u1
  });

  it('touchLastUsed updates the record and is a no-op for an unknown id (never throws)', async () => {
    const fs = memFs();
    const s = store(fs, () => new Date('2026-07-30T12:00:00Z'));
    await s.insert(rec());
    await s.touchLastUsed('key_1');
    await s.touchLastUsed('nope'); // no throw
    const found = await s.findByPrefix('sk_live_ab12');
    expect(found[0].lastUsedAt).toBeInstanceOf(Date);
  });

  it('reads a corrupt file as empty (never throws)', async () => {
    const s = store(memFs('{ not valid json'));
    expect(await s.findByPrefix('sk_live_ab12')).toEqual([]);
  });
});
