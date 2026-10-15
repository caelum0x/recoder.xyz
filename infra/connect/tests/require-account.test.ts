import { describe, expect, it, vi } from 'vitest';
import { requireAccount } from '../src/auth/require-account.js';
import { createFakeDb } from './fake-db.js';
import type { ConnectEnv } from '../src/env.js';
import type { ConnectDb } from '../src/db/client.js';

// requireAccount calls `connectDb(env)` internally, which builds a real
// drizzle instance over a real `pg.Pool` — we intercept at that seam so the
// fake db above is what the function actually queries.
vi.mock('../src/db/client.js', () => ({
  connectDb: (env: unknown) => (env as { __fakeDb: ConnectDb }).__fakeDb,
}));

function fakeEnv(db: ConnectDb): ConnectEnv {
  return { __fakeDb: db } as unknown as ConnectEnv;
}

function authWithSession(session: { user?: { id?: string; email?: string } } | null) {
  return { api: { getSession: vi.fn().mockResolvedValue(session) } } as never;
}

describe('requireAccount', () => {
  it('returns null when there is no session', async () => {
    const fake = createFakeDb([]);
    const result = await requireAccount(authWithSession(null), new Request('https://connect.recoder.xyz/devices'), fakeEnv(fake.db));
    expect(result).toBeNull();
  });

  it('returns null when the session is missing a user id or email', async () => {
    const fake = createFakeDb([]);
    const result = await requireAccount(authWithSession({ user: { id: 'u1' } }), new Request('https://x/'), fakeEnv(fake.db));
    expect(result).toBeNull();
  });

  it('reuses an existing connect_accounts row for a known user', async () => {
    const fake = createFakeDb([{ id: 'acct_existing', userId: 'u1', email: 'dev@example.com' }]);
    const result = await requireAccount(
      authWithSession({ user: { id: 'u1', email: 'dev@example.com' } }),
      new Request('https://x/'),
      fakeEnv(fake.db),
    );
    expect(result).toEqual({ accountId: 'acct_existing', userId: 'u1', email: 'dev@example.com' });
    expect(fake.inserted).toHaveLength(0);
  });

  it('creates a new connect_accounts row for a first-time user', async () => {
    const fake = createFakeDb([]);
    const result = await requireAccount(
      authWithSession({ user: { id: 'u2', email: 'new@example.com' } }),
      new Request('https://x/'),
      fakeEnv(fake.db),
    );
    expect(result?.userId).toBe('u2');
    expect(result?.email).toBe('new@example.com');
    expect(fake.inserted).toHaveLength(1);
    expect(fake.inserted[0]).toMatchObject({ userId: 'u2', email: 'new@example.com' });
  });
});
