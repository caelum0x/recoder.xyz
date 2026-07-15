import { describe, it, expect, vi } from 'vitest';
import { createApiKeyService } from '../api-key.service.js';
import type { ApiKeyStore, NewApiKeyRecord } from '../ports/api-key.port.js';
import type { PlatformApiKey } from '../types.js';

/** A minimal in-memory {@link ApiKeyStore} for service-level unit tests. */
class FakeApiKeyStore implements ApiKeyStore {
  readonly rows = new Map<string, PlatformApiKey>();
  touched: string[] = [];

  async insert(record: NewApiKeyRecord): Promise<PlatformApiKey> {
    const row: PlatformApiKey = {
      id: record.id,
      userId: record.userId,
      ...(record.orgId ? { orgId: record.orgId } : {}),
      name: record.name,
      keyPrefix: record.keyPrefix,
      keyHash: record.keyHash,
      scopes: record.scopes,
      lastUsedAt: null,
      expiresAt: record.expiresAt ?? null,
      revokedAt: null,
      createdAt: new Date(),
    };
    this.rows.set(row.id, row);
    return row;
  }

  async findByPrefix(keyPrefix: string): Promise<readonly PlatformApiKey[]> {
    return [...this.rows.values()].filter((r) => r.keyPrefix === keyPrefix && !r.revokedAt);
  }

  async listForUser(userId: string): Promise<readonly PlatformApiKey[]> {
    return [...this.rows.values()].filter((r) => r.userId === userId);
  }

  async revoke(id: string, userId: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId || row.revokedAt) return false;
    this.rows.set(id, { ...row, revokedAt: new Date() });
    return true;
  }

  async touchLastUsed(id: string): Promise<void> {
    this.touched.push(id);
  }
}

const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as never;

function build(overrides?: { store?: FakeApiKeyStore; hashSalt?: string | null }) {
  const store = overrides?.store ?? new FakeApiKeyStore();
  const service = createApiKeyService({
    store,
    logger,
    hashSalt: overrides?.hashSalt ?? 'unit-test-pepper',
  });
  return { store, service };
}

describe('ApiKeyService — DB-backed sk_ platform keys', () => {
  it('mints an sk_ key, returns the raw key once, and never stores it', async () => {
    const { store, service } = build();
    const { rawKey, record } = await service.mint({ userId: 'u1', name: 'ci' });

    expect(rawKey.startsWith('sk_')).toBe(true);
    expect(record.userId).toBe('u1');
    expect(record.keyPrefix).toBe(rawKey.slice(0, 12));
    // The raw key is NOWHERE in the stored row.
    const stored = store.rows.get(record.id)!;
    expect(stored.keyHash).not.toBe(rawKey);
    expect(stored.keyHash).not.toContain(rawKey);
    expect(stored.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.scopes).toEqual(['read', 'write']);
  });

  it('validates a minted key and resolves the owning identity + scopes', async () => {
    const { service } = build();
    const { rawKey } = await service.mint({ userId: 'owner-1', orgId: 'org-9', name: 'k', scopes: ['read'] });

    const validation = await service.validate(rawKey);
    expect(validation).not.toBeNull();
    expect(validation?.userId).toBe('owner-1');
    expect(validation?.orgId).toBe('org-9');
    expect(validation?.scopes).toEqual(['read']);
  });

  it('touches last_used_at on a successful validate (best-effort)', async () => {
    const { store, service } = build();
    const { rawKey, record } = await service.mint({ userId: 'u1', name: 'k' });
    await service.validate(rawKey);
    // fire-and-forget — allow the microtask to flush
    await Promise.resolve();
    expect(store.touched).toContain(record.id);
  });

  it('rejects an unknown / malformed key', async () => {
    const { service } = build();
    expect(await service.validate('sk_definitely-not-real')).toBeNull();
    expect(await service.validate('not-an-sk-key')).toBeNull();
    expect(await service.validate('')).toBeNull();
  });

  it('rejects a revoked key', async () => {
    const { service } = build();
    const { rawKey, record } = await service.mint({ userId: 'u1', name: 'k' });
    expect(await service.validate(rawKey)).not.toBeNull();

    const revoked = await service.revoke(record.id, 'u1');
    expect(revoked).toBe(true);
    expect(await service.validate(rawKey)).toBeNull();
  });

  it('does not revoke a key owned by another user', async () => {
    const { service } = build();
    const { record } = await service.mint({ userId: 'u1', name: 'k' });
    expect(await service.revoke(record.id, 'someone-else')).toBe(false);
  });

  it('rejects an expired key', async () => {
    const { service } = build();
    const { rawKey } = await service.mint({
      userId: 'u1',
      name: 'k',
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await service.validate(rawKey)).toBeNull();
  });

  it('is pepper-sensitive: a key minted under one salt does not validate under another', async () => {
    const store = new FakeApiKeyStore();
    const a = createApiKeyService({ store, logger, hashSalt: 'pepper-A' });
    const b = createApiKeyService({ store, logger, hashSalt: 'pepper-B' });
    const { rawKey } = await a.mint({ userId: 'u1', name: 'k' });

    expect(await a.validate(rawKey)).not.toBeNull();
    expect(await b.validate(rawKey)).toBeNull();
  });

  it('lists a user keys without leaking another user keys', async () => {
    const { service } = build();
    await service.mint({ userId: 'u1', name: 'a' });
    await service.mint({ userId: 'u1', name: 'b' });
    await service.mint({ userId: 'u2', name: 'c' });

    const keys = await service.list('u1');
    expect(keys).toHaveLength(2);
    expect(keys.every((k) => k.userId === 'u1')).toBe(true);
  });

  it('degrades truthfully: mint/list/revoke throw SERVICE_UNAVAILABLE when the pool is down', async () => {
    const store = new FakeApiKeyStore();
    const service = createApiKeyService({ store, logger, hashSalt: 'p', isAvailable: () => false });
    await expect(service.mint({ userId: 'u1', name: 'k' })).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    await expect(service.list('u1')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    await expect(service.revoke('x', 'u1')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    // validate never throws — an unresolvable credential is unauthenticated, not a 500.
    expect(await service.validate('sk_whatever')).toBeNull();
  });

  it('enforces an injected governance gate on mint and revoke', async () => {
    const store = new FakeApiKeyStore();
    const governance = {
      authorize: vi.fn(async (action: string) => ({
        allowed: action !== 'key.revoke',
        reason: 'denied by policy',
      })),
    };
    const service = createApiKeyService({ store, logger, hashSalt: 'p', governance });

    const { rawKey, record } = await service.mint({ userId: 'u1', name: 'k' });
    expect(governance.authorize).toHaveBeenCalledWith('key.mint', expect.any(Object));
    expect(rawKey.startsWith('sk_')).toBe(true);

    await expect(service.revoke(record.id, 'u1')).rejects.toMatchObject({
      code: 'AUTHZ_PROJECT_ACCESS_DENIED',
    });
  });
});
