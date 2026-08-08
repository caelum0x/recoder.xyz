import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Pin the signing secret BEFORE the module (and its lazy singleton) load — vi.hoisted
// runs ahead of the imports, so the SessionSyncManager reads it at construction.
vi.hoisted(() => {
  process.env.SESSION_SYNC_SECRET = 'test-sync-secret';
});

vi.mock('@/lib/auth-helpers', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/database', () => ({ userDb: { findByEmail: vi.fn(), findById: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { getSession } from '@/lib/auth-helpers';
import { userDb } from '@/lib/database';
import { handleSessionSync } from '../session-sync';

function post(body: unknown) {
  return new Request('http://localhost/api/auth/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

const ATTACKER_BODY = {
  action: 'sync_session',
  sessionData: { userId: 'VICTIM', email: 'victim@x.com', name: 'V', plan: 'enterprise', expiresAt: Date.now() + 1e9, domains: [] },
};

describe('POST /api/auth/sync — identity comes from the caller session, not the body (recoder-6lie)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects an UNAUTHENTICATED caller (401) and sets NO sync cookie', async () => {
    (getSession as any).mockResolvedValue(null);
    const res = await handleSessionSync(post(ATTACKER_BODY));
    expect(res.status).toBe(401);
    expect(res.cookies.get('recoder-session-sync')?.value).toBeFalsy();
    expect(userDb.findById).not.toHaveBeenCalled(); // never trusts body userId
  });

  it('ignores the body and mints the cookie for the CALLER (server-resolved id/plan)', async () => {
    (getSession as any).mockResolvedValue({ user: { email: 'attacker@x.com' } });
    (userDb.findByEmail as any).mockResolvedValue({
      id: 'attacker', email: 'attacker@x.com', name: 'Att',
      subscription_status: 'active', subscription_plan: 'free',
    });

    const res = await handleSessionSync(post(ATTACKER_BODY)); // body claims VICTIM/enterprise
    expect(res.status).toBe(200);
    // Resolved by the AUTHENTICATED email, never the body userId.
    expect(userDb.findByEmail).toHaveBeenCalledWith('attacker@x.com');

    const token = res.cookies.get('recoder-session-sync')!.value;
    const claims = jwt.verify(token, 'test-sync-secret') as { userId: string; plan: string };
    expect(claims.userId).toBe('attacker'); // NOT 'VICTIM'
    expect(claims.plan).toBe('free');        // NOT 'enterprise'
  });
});
