import { describe, it, expect, vi } from 'vitest';
import {
  createIdentityRepository,
  type AuthUserReader,
  type AuthUserRecord,
} from '../repositories/identity.repository.js';
import type { QueryExecutor, QueryParams } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';

const noopLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } as never;

/**
 * A tiny in-memory stand-in for the control-plane executor. Backs the
 * `identity.user_cli_link` table with an array of { auth_user_id, legacy_users_id }.
 */
function fakeExecutor(options?: {
  links?: Array<{ auth: string; legacy: string }>;
  available?: boolean;
  throwOn?: 'one' | 'mutate';
}): QueryExecutor {
  const links = [...(options?.links ?? [])];
  const available = options?.available ?? true;
  const one = async <T extends QueryRow = QueryRow>(sql: string, params?: QueryParams): Promise<T | null> => {
    if (options?.throwOn === 'one') throw new Error('db down');
    const p = (params ?? {}) as Record<string, unknown>;
    if (sql.includes('where legacy_users_id')) {
      const hit = links.find((l) => l.legacy === p.legacy);
      return hit ? ({ auth_user_id: hit.auth } as unknown as T) : null;
    }
    if (sql.includes('where auth_user_id')) {
      const hit = links.find((l) => l.auth === p.auth);
      return hit ? ({ legacy_users_id: hit.legacy } as unknown as T) : null;
    }
    return null;
  };
  const mutate = async (_sql: string, params?: QueryParams): Promise<number> => {
    if (options?.throwOn === 'mutate') throw new Error('db down');
    const p = (params ?? {}) as { auth: string; legacy: string };
    if (!links.some((l) => l.auth === p.auth && l.legacy === p.legacy)) {
      links.push({ auth: p.auth, legacy: p.legacy });
      return 1;
    }
    return 0;
  };
  return {
    one,
    mutate,
    execute: async () => [],
    read: async () => [],
    withTransaction: async (fn) => fn({ one, mutate } as unknown as QueryExecutor),
    isAvailable: () => available,
  } as QueryExecutor;
}

function fakeReader(users: Record<string, AuthUserRecord>): AuthUserReader {
  return { findById: vi.fn(async (id: string) => users[id] ?? null) };
}

const alice: AuthUserRecord = {
  id: 'user-alice',
  email: 'alice@recoder.xyz',
  name: 'Alice',
  emailVerified: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('IdentityRepository — unified read model over user/users', () => {
  it('findUserById returns the canonical identity and attaches a linked legacy id', async () => {
    const repo = createIdentityRepository({
      executor: fakeExecutor({ links: [{ auth: 'user-alice', legacy: 'cli-42' }] }),
      logger: noopLogger,
      authUserReader: fakeReader({ 'user-alice': alice }),
    });
    const identity = await repo.findUserById('user-alice');
    expect(identity?.userId).toBe('user-alice');
    expect(identity?.email).toBe('alice@recoder.xyz');
    expect(identity?.legacyCliUserId).toBe('cli-42');
  });

  it('resolveIdentity resolves a canonical user.id directly', async () => {
    const repo = createIdentityRepository({
      executor: fakeExecutor(),
      logger: noopLogger,
      authUserReader: fakeReader({ 'user-alice': alice }),
    });
    const identity = await repo.resolveIdentity('user-alice');
    expect(identity?.userId).toBe('user-alice');
    expect(identity?.legacyCliUserId).toBeUndefined();
  });

  it('resolveIdentity resolves a legacy CLI users.id via the link (no merge)', async () => {
    const repo = createIdentityRepository({
      executor: fakeExecutor({ links: [{ auth: 'user-alice', legacy: 'cli-42' }] }),
      logger: noopLogger,
      authUserReader: fakeReader({ 'user-alice': alice }),
    });
    const identity = await repo.resolveIdentity('cli-42');
    expect(identity?.userId).toBe('user-alice');
    expect(identity?.legacyCliUserId).toBe('cli-42');
  });

  it('resolveIdentity returns null for an unknown id', async () => {
    const repo = createIdentityRepository({
      executor: fakeExecutor(),
      logger: noopLogger,
      authUserReader: fakeReader({ 'user-alice': alice }),
    });
    expect(await repo.resolveIdentity('nobody')).toBeNull();
  });

  it('linkLegacyUser is idempotent and returns the unified identity', async () => {
    const executor = fakeExecutor();
    const repo = createIdentityRepository({
      executor,
      logger: noopLogger,
      authUserReader: fakeReader({ 'user-alice': alice }),
    });
    const first = await repo.linkLegacyUser('user-alice', 'cli-99');
    expect(first?.legacyCliUserId).toBe('cli-99');
    // Second call must not throw and must still resolve (on conflict do nothing).
    const second = await repo.linkLegacyUser('user-alice', 'cli-99');
    expect(second?.userId).toBe('user-alice');
    // The legacy id is now resolvable back to the canonical identity.
    const back = await repo.resolveCliUser('cli-99');
    expect(back?.userId).toBe('user-alice');
  });

  it('degrades to null (never throws) when the auth reader is absent', async () => {
    const repo = createIdentityRepository({ executor: fakeExecutor(), logger: noopLogger });
    expect(await repo.findUserById('user-alice')).toBeNull();
    expect(await repo.resolveIdentity('user-alice')).toBeNull();
  });

  it('degrades to null (never throws) when the control DB read faults', async () => {
    const repo = createIdentityRepository({
      executor: fakeExecutor({ throwOn: 'one' }),
      logger: noopLogger,
      authUserReader: fakeReader({ 'user-alice': alice }),
    });
    // findUserById swallows the legacy-link read fault and still returns the user.
    const identity = await repo.findUserById('user-alice');
    expect(identity?.userId).toBe('user-alice');
    expect(identity?.legacyCliUserId).toBeUndefined();
    // A legacy resolution whose only source is the faulting read returns null.
    expect(await repo.resolveCliUser('cli-42')).toBeNull();
  });

  it('reports availability from the underlying executor', () => {
    const up = createIdentityRepository({ executor: fakeExecutor({ available: true }), logger: noopLogger });
    const down = createIdentityRepository({ executor: fakeExecutor({ available: false }), logger: noopLogger });
    expect(up.isAvailable()).toBe(true);
    expect(down.isAvailable()).toBe(false);
  });
});
