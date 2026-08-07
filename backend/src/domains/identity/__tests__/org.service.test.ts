import { describe, it, expect, vi } from 'vitest';
import { OrgServiceImpl, type GovernanceGate } from '../org.service.js';
import type { QueryExecutor, QueryParams } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';

const noopLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as never;

/**
 * A minimal in-memory {@link QueryExecutor} that interprets exactly the SQL the
 * org/membership repositories emit. It lets the service's real transaction +
 * store logic run end-to-end without Postgres.
 */
class FakeExecutor implements QueryExecutor {
  readonly orgs = new Map<string, QueryRow>();
  readonly teams = new Map<string, QueryRow>();
  readonly memberships = new Map<string, QueryRow>();

  async one<T extends QueryRow = QueryRow>(sql: string, params?: QueryParams): Promise<T | null> {
    const s = sql.toLowerCase();
    const p = (params ?? {}) as Record<string, unknown>;

    if (s.includes('insert into identity.organization')) {
      const row: QueryRow = {
        id: p.id,
        slug: p.slug,
        name: p.name,
        owner_user_id: p.ownerUserId,
        sso_connection: p.sso == null ? null : JSON.parse(String(p.sso)),
        created_at: new Date(),
      };
      this.orgs.set(String(p.id), row);
      return row as T;
    }
    if (s.includes('from identity.organization') && s.includes('where slug')) {
      return (([...this.orgs.values()].find((r) => r.slug === p.slug) as T | undefined) ?? null) as T | null;
    }
    if (s.includes('from identity.organization') && s.includes('where id')) {
      return ((this.orgs.get(String(p.id)) as T | undefined) ?? null) as T | null;
    }
    if (s.includes('insert into identity.team')) {
      const row: QueryRow = { id: p.id, org_id: p.orgId, slug: p.slug, name: p.name, created_at: new Date() };
      this.teams.set(String(p.id), row);
      return row as T;
    }
    if (s.includes('insert into identity.org_membership')) {
      const row: QueryRow = {
        id: p.id,
        org_id: p.orgId,
        user_id: p.userId,
        team_id: p.teamId ?? null,
        role: p.role,
        status: p.status,
        invited_by: p.invitedBy ?? null,
        created_at: new Date(),
      };
      this.memberships.set(String(p.id), row);
      return row as T;
    }
    if (s.includes('from identity.org_membership') && s.includes('user_id')) {
      const found = [...this.memberships.values()].find((r) => r.org_id === p.orgId && r.user_id === p.userId);
      return ((found as T | undefined) ?? null) as T | null;
    }
    if (s.includes('from identity.org_membership') && s.includes('where id')) {
      return ((this.memberships.get(String(p.id)) as T | undefined) ?? null) as T | null;
    }
    return null;
  }

  async execute<T extends QueryRow = QueryRow>(sql: string, params?: QueryParams): Promise<readonly T[]> {
    return this.read<T>(sql, params);
  }

  async read<T extends QueryRow = QueryRow>(sql: string, params?: QueryParams): Promise<readonly T[]> {
    const s = sql.toLowerCase();
    const p = (params ?? {}) as Record<string, unknown>;
    if (s.includes('from identity.org_membership') && s.includes('where org_id')) {
      return [...this.memberships.values()].filter((r) => r.org_id === p.orgId) as T[];
    }
    if (s.includes('from identity.organization')) {
      // listForUser: owned orgs (membership join not modelled — owner path suffices here).
      return [...this.orgs.values()].filter((r) => r.owner_user_id === p.userId) as T[];
    }
    return [];
  }

  async mutate(sql: string, params?: QueryParams): Promise<number> {
    const s = sql.toLowerCase();
    const p = (params ?? {}) as Record<string, unknown>;
    if (s.includes("set status = 'active'")) {
      const row = this.memberships.get(String(p.id));
      if (row && row.status === 'invited') {
        this.memberships.set(String(p.id), { ...row, status: 'active' });
        return 1;
      }
      return 0;
    }
    return 0;
  }

  async withTransaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T> {
    return fn(this);
  }

  isAvailable(): boolean {
    return true;
  }
}

function build(governance?: GovernanceGate): { svc: OrgServiceImpl; db: FakeExecutor } {
  const db = new FakeExecutor();
  const svc = new OrgServiceImpl({ executor: db, logger: noopLogger, ...(governance ? { governance } : {}) });
  return { svc, db };
}

describe('OrgServiceImpl — lifecycle', () => {
  it('createOrg inserts the org AND an active owner membership atomically', async () => {
    const { svc, db } = build();
    const org = await svc.createOrg({ name: 'Acme', slug: 'Acme Inc', ownerUserId: 'u1' });
    expect(org.slug).toBe('acme-inc'); // normalized
    expect(db.orgs.size).toBe(1);
    expect(db.memberships.size).toBe(1);
    const membership = [...db.memberships.values()][0];
    expect(membership.role).toBe('owner');
    expect(membership.status).toBe('active');
    expect(membership.user_id).toBe('u1');
  });

  it('rejects a duplicate slug before insert', async () => {
    const { svc } = build();
    await svc.createOrg({ name: 'Acme', slug: 'acme', ownerUserId: 'u1' });
    await expect(svc.createOrg({ name: 'Acme Two', slug: 'acme', ownerUserId: 'u2' })).rejects.toThrow(/already taken/);
  });

  it('rejects an empty name/slug', async () => {
    const { svc } = build();
    await expect(svc.createOrg({ name: '', slug: 'x', ownerUserId: 'u1' })).rejects.toThrow(/name is required/);
    await expect(svc.createOrg({ name: 'X', slug: '   ', ownerUserId: 'u1' })).rejects.toThrow(/slug is required/);
  });

  it('addTeam requires the org to exist', async () => {
    const { svc } = build();
    await expect(svc.addTeam('missing-org', 'core', 'Core')).rejects.toThrow(/not found/);
  });

  it('invite creates an invited membership and blocks a duplicate', async () => {
    const { svc, db } = build();
    const org = await svc.createOrg({ name: 'Acme', slug: 'acme', ownerUserId: 'owner1' });
    const m = await svc.invite({ orgId: org.id, userId: 'u2', invitedBy: 'owner1', role: 'member' });
    expect(m.status).toBe('invited');
    expect(m.role).toBe('member');
    expect(db.memberships.size).toBe(2); // owner + invitee
    await expect(svc.invite({ orgId: org.id, userId: 'u2', invitedBy: 'owner1' })).rejects.toThrow(/already a member/);
  });

  it('an admin CANNOT invite someone as owner — role ceiling (recoder-q54e)', async () => {
    const { svc } = build();
    const org = await svc.createOrg({ name: 'Acme', slug: 'acme', ownerUserId: 'owner1' });
    await svc.invite({ orgId: org.id, userId: 'adminU', invitedBy: 'owner1', role: 'admin' });
    // adminU (role admin) tries to mint an OWNER — must be refused (can't grant above self).
    await expect(
      svc.invite({ orgId: org.id, userId: 'victim', invitedBy: 'adminU', role: 'owner' }),
    ).rejects.toThrow(/above your own role|role ceiling|not grantable/i);
  });

  it('the org owner CAN invite an admin (grant at-or-below own role)', async () => {
    const { svc } = build();
    const org = await svc.createOrg({ name: 'Acme', slug: 'acme', ownerUserId: 'owner1' });
    const m = await svc.invite({ orgId: org.id, userId: 'u2', invitedBy: 'owner1', role: 'admin' });
    expect(m.role).toBe('admin');
  });

  it('acceptInvite transitions invited → active for the invited user', async () => {
    const { svc } = build();
    const org = await svc.createOrg({ name: 'Acme', slug: 'acme', ownerUserId: 'owner1' });
    const m = await svc.invite({ orgId: org.id, userId: 'u2', invitedBy: 'owner1' });
    expect(await svc.acceptInvite(m.id, 'u2')).toBe(true);
    // a second accept is a no-op (already active)
    expect(await svc.acceptInvite(m.id, 'u2')).toBe(false);
  });

  it('acceptInvite rejects a caller who does not own the membership (IDOR)', async () => {
    const { svc, db } = build();
    const org = await svc.createOrg({ name: 'Acme', slug: 'acme', ownerUserId: 'owner1' });
    const m = await svc.invite({ orgId: org.id, userId: 'victim', invitedBy: 'owner1' });
    // An attacker who merely learns the membershipId cannot activate the victim's invite.
    expect(await svc.acceptInvite(m.id, 'attacker')).toBe(false);
    // The victim's membership is still 'invited' — never silently activated.
    expect(db.memberships.get(m.id)?.status).toBe('invited');
    // The rightful owner can still accept.
    expect(await svc.acceptInvite(m.id, 'victim')).toBe(true);
  });

  it('a denying governance gate blocks org creation', async () => {
    const gate: GovernanceGate = { decide: vi.fn(async () => ({ allowed: false, reason: 'policy: no orgs' })) };
    const { svc, db } = build(gate);
    await expect(svc.createOrg({ name: 'Acme', slug: 'acme', ownerUserId: 'u1' })).rejects.toThrow(/policy: no orgs/);
    expect(db.orgs.size).toBe(0);
  });

  it('membersOf lists the org roster', async () => {
    const { svc } = build();
    const org = await svc.createOrg({ name: 'Acme', slug: 'acme', ownerUserId: 'owner1' });
    await svc.invite({ orgId: org.id, userId: 'u2', invitedBy: 'owner1' });
    const members = await svc.membersOf(org.id);
    expect(members.length).toBe(2);
  });
});
