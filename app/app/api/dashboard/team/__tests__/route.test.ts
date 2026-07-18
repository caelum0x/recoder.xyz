// @vitest-environment node
/**
 * Team Route Tests — POST /api/dashboard/team (invite a member)
 *
 * Focus: the cross-org overwrite guard. Identity is derived from the verified
 * session (never the request body); only an org admin/owner may invite; and a
 * user who already belongs to ANOTHER organization must NOT be silently moved.
 *
 * NOTE: The app unit-test env currently mismatches on React version for hook/
 * component tests, but these route handlers run in the `node` environment
 * (see the `@vitest-environment node` pragma above) with prisma/auth mocked,
 * so they are runnable and deterministic regardless of that mismatch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    users: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { POST } from '@/app/api/dashboard/team/route';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

const mockRequireAuth = vi.mocked(requireAuth);
const mockPrisma = vi.mocked(prisma);

const CALLER_EMAIL = 'owner@example.com';
const TARGET_EMAIL = 'target@example.com';

function buildPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/dashboard/team', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function authAs(email: string) {
  mockRequireAuth.mockResolvedValue({
    error: false,
    user: { id: 'auth-user', email },
  } as any);
}

/**
 * Wire prisma.users.findUnique to return the caller for the caller-email
 * lookup and the invited user for any other email.
 */
function stubUsers(caller: unknown, invited: unknown) {
  mockPrisma.users.findUnique.mockImplementation((args: any) => {
    if (args?.where?.email === CALLER_EMAIL) return Promise.resolve(caller as any);
    return Promise.resolve(invited as any);
  });
}

describe('POST /api/dashboard/team', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.users.update.mockResolvedValue({} as any);
    // Default: the bootstrap org name is unclaimed. Individual tests override
    // this to simulate a name collision with an existing organization.
    mockPrisma.users.findFirst.mockResolvedValue(null as any);
    authAs(CALLER_EMAIL);
  });

  it('returns 401 when the caller is not authenticated', async () => {
    mockRequireAuth.mockResolvedValue({
      error: true,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    } as any);

    const res = await POST(buildPostRequest({ email: TARGET_EMAIL }));

    expect(res.status).toBe(401);
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is only a member (not admin/owner)', async () => {
    stubUsers(
      { id: 'caller-1', organization: 'Acme', name: 'Cara', role: 'member' },
      { id: 'target-1', organization: null },
    );

    const res = await POST(buildPostRequest({ email: TARGET_EMAIL }));

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('admin or owner');
    // No writes at all when unauthorized.
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('refuses (409) to move a user who already belongs to another organization', async () => {
    stubUsers(
      { id: 'caller-1', organization: 'Acme', name: 'Cara', role: 'user' },
      { id: 'target-1', organization: 'Globex' },
    );

    const res = await POST(buildPostRequest({ email: TARGET_EMAIL }));

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('another organization');
    // The existing user's org/role must NOT be overwritten.
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('invites a brand-new unaffiliated user into the caller org', async () => {
    stubUsers(
      { id: 'caller-1', organization: 'Acme', name: 'Cara', role: 'user' },
      { id: 'target-1', organization: null },
    );

    const res = await POST(buildPostRequest({ email: TARGET_EMAIL, role: 'admin' }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockPrisma.users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'target-1' },
        data: expect.objectContaining({ organization: 'Acme', role: 'admin' }),
      }),
    );
  });

  it('allows a role change for a user already in the same organization', async () => {
    stubUsers(
      { id: 'caller-1', organization: 'Acme', name: 'Cara', role: 'admin' },
      { id: 'target-1', organization: 'Acme' },
    );

    const res = await POST(buildPostRequest({ email: TARGET_EMAIL, role: 'member' }));

    expect(res.status).toBe(200);
    expect(mockPrisma.users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'target-1' },
        data: expect.objectContaining({ organization: 'Acme', role: 'member' }),
      }),
    );
  });

  it('bootstraps an org for a first-time owner and invites into it', async () => {
    stubUsers(
      { id: 'caller-1', organization: null, name: 'Cara', role: 'user' },
      { id: 'target-1', organization: null },
    );

    const res = await POST(buildPostRequest({ email: TARGET_EMAIL }));

    expect(res.status).toBe(200);
    // Caller's org is materialized, then the invitee is assigned to it.
    expect(mockPrisma.users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'caller-1' },
        data: expect.objectContaining({ organization: 'Cara Team' }),
      }),
    );
    expect(mockPrisma.users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'target-1' },
        data: expect.objectContaining({ organization: 'Cara Team', role: 'member' }),
      }),
    );
  });

  it('refuses (409) to bootstrap into an organization name another user already occupies', async () => {
    // Regression for the cross-org overwrite bypass: an attacker with NO org of
    // their own sets their display name to a victim org's creator name so the
    // computed `${name} Team` collides with the victim organization. Without the
    // occupancy guard the attacker would be materialized into that existing org
    // and could then read/rewrite its members. The guard must refuse.
    stubUsers(
      { id: 'attacker-1', organization: null, name: 'Cara', role: 'user' },
      { id: 'throwaway-1', organization: null },
    );
    // "Cara Team" is already occupied by the real victim org.
    mockPrisma.users.findFirst.mockResolvedValue({ id: 'victim-1' } as any);

    const res = await POST(buildPostRequest({ email: TARGET_EMAIL }));

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('already in use');
    // Neither the attacker's org nor the throwaway account may be written.
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
    // The occupancy check must exclude the caller so a legit re-bootstrap of
    // one's OWN name is still gated only on other users.
    expect(mockPrisma.users.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organization: 'Cara Team',
          id: { not: 'attacker-1' },
        }),
      }),
    );
  });

  it('returns 404 when the invited user has not signed up yet', async () => {
    stubUsers(
      { id: 'caller-1', organization: 'Acme', name: 'Cara', role: 'user' },
      null,
    );

    const res = await POST(buildPostRequest({ email: TARGET_EMAIL }));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('sign up');
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });
});
