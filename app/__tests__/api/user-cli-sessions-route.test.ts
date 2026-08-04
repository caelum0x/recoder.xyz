import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * GET/DELETE /api/user/cli-sessions — owner-scope isolation is the critical
 * invariant: user A must never list or revoke user B's sessions, and the
 * response must never carry token material. Uses an in-memory prisma fake
 * keyed by userId + a mocked requireAuth.
 */

interface FakeSession {
  id: string;
  userId: string;
  deviceName: string | null;
  deviceType: string;
  accessToken: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  isActive: boolean;
}

const state: { sessions: FakeSession[]; authUserId: string | null } = {
  sessions: [],
  authUserId: null,
};

vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: vi.fn(async () => {
    if (!state.authUserId) {
      return {
        error: true,
        response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      };
    }
    return {
      error: false,
      session: { user: { id: state.authUserId } },
      user: { id: state.authUserId, email: `${state.authUserId}@example.com` },
    };
  }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    cli_sessions: {
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
        state.sessions
          .filter((s) => s.userId === where.userId)
          .map((s) => ({ ...s }))
      ),
      findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) => {
        const found = state.sessions.find(
          (s) => s.id === where.id && s.userId === where.userId
        );
        return found ? { ...found } : null;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<FakeSession> }) => {
          state.sessions = state.sessions.map((s) =>
            s.id === where.id ? { ...s, ...data } : s
          );
          return state.sessions.find((s) => s.id === where.id);
        }
      ),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const { GET, DELETE } = await import('@/app/api/user/cli-sessions/route');

const USER_A_TOKEN = 'reco_a_secret_token_material_1234567890';
const USER_B_TOKEN = 'reco_b_secret_token_material_0987654321';

function makeSession(overrides: Partial<FakeSession>): FakeSession {
  return {
    id: 'sess-a',
    userId: 'user-a',
    deviceName: 'MacBook Pro',
    deviceType: 'cli',
    accessToken: USER_A_TOKEN,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    lastUsedAt: new Date('2026-08-02T00:00:00Z'),
    expiresAt: new Date('2026-09-01T00:00:00Z'),
    revokedAt: null,
    isActive: true,
    ...overrides,
  };
}

function getRequest(): NextRequest {
  return new NextRequest('http://localhost/api/user/cli-sessions');
}

function deleteRequest(id: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/user/cli-sessions?id=${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
}

beforeEach(() => {
  state.authUserId = 'user-a';
  state.sessions = [
    makeSession({}),
    makeSession({ id: 'sess-b', userId: 'user-b', accessToken: USER_B_TOKEN }),
  ];
});

describe('GET /api/user/cli-sessions', () => {
  it('rejects unauthenticated requests with 401', async () => {
    state.authUserId = null;
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
  });

  it('lists only the authenticated user own sessions', async () => {
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].id).toBe('sess-a');
  });

  it('never exposes token material — only a short prefix', async () => {
    const res = await GET(getRequest());
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain(USER_A_TOKEN);
    expect(raw).not.toContain(USER_B_TOKEN);
    expect(raw).toContain('"tokenPrefix"');
  });

  it('marks only the most-recently-used active session as isMostRecent', async () => {
    state.sessions = [
      makeSession({ id: 'a-old', lastUsedAt: new Date('2026-08-01T00:00:00Z') }),
      makeSession({ id: 'a-new', lastUsedAt: new Date('2026-08-05T00:00:00Z') }),
      makeSession({
        id: 'a-revoked',
        lastUsedAt: new Date('2026-08-09T00:00:00Z'),
        revokedAt: new Date('2026-08-09T01:00:00Z'),
        isActive: false,
      }),
    ];
    const res = await GET(getRequest());
    const body = await res.json();
    const byId = Object.fromEntries(
      body.sessions.map((s: { id: string; isMostRecent: boolean }) => [s.id, s.isMostRecent])
    );
    // Newest *active* wins; a newer revoked row does not, and it is not "current".
    expect(byId['a-new']).toBe(true);
    expect(byId['a-old']).toBe(false);
    expect(byId['a-revoked']).toBe(false);
    expect(JSON.stringify(body)).not.toContain('isCurrent');
  });

  it('marks no session when all of the user own sessions are revoked (honest degrade)', async () => {
    state.sessions = [
      makeSession({ id: 'a-1', isActive: false, revokedAt: new Date('2026-08-02T00:00:00Z') }),
      makeSession({ id: 'a-2', isActive: false, revokedAt: new Date('2026-08-03T00:00:00Z') }),
    ];
    const res = await GET(getRequest());
    const body = await res.json();
    expect(
      body.sessions.every((s: { isMostRecent: boolean }) => s.isMostRecent === false)
    ).toBe(true);
  });
});

describe('DELETE /api/user/cli-sessions', () => {
  it('rejects unauthenticated requests with 401', async () => {
    state.authUserId = null;
    const res = await DELETE(deleteRequest('sess-a'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when no id is provided', async () => {
    const res = await DELETE(new NextRequest('http://localhost/api/user/cli-sessions', { method: 'DELETE' }));
    expect(res.status).toBe(400);
  });

  it("returns 404 (not 403) for another user's session id and does not revoke it", async () => {
    const res = await DELETE(deleteRequest('sess-b'));
    expect(res.status).toBe(404);
    const victim = state.sessions.find((s) => s.id === 'sess-b');
    expect(victim?.isActive).toBe(true);
    expect(victim?.revokedAt).toBeNull();
  });

  it('returns 404 for a nonexistent id', async () => {
    const res = await DELETE(deleteRequest('sess-nope'));
    expect(res.status).toBe(404);
  });

  it('revokes the owner session', async () => {
    const res = await DELETE(deleteRequest('sess-a'));
    expect(res.status).toBe(200);
    const revoked = state.sessions.find((s) => s.id === 'sess-a');
    expect(revoked?.isActive).toBe(false);
    expect(revoked?.revokedAt).toBeInstanceOf(Date);
  });

  it('is idempotent: revoking an already-revoked session still succeeds', async () => {
    const first = await DELETE(deleteRequest('sess-a'));
    expect(first.status).toBe(200);
    const firstRevokedAt = state.sessions.find((s) => s.id === 'sess-a')?.revokedAt;

    const second = await DELETE(deleteRequest('sess-a'));
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.revoked).toBe(true);
    // The original revocation timestamp is preserved, not overwritten
    expect(state.sessions.find((s) => s.id === 'sess-a')?.revokedAt).toBe(firstRevokedAt);
  });
});
