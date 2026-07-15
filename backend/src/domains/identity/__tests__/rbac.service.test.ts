import { describe, it, expect, vi } from 'vitest';
import { RbacService, ROLE_PERMISSIONS } from '../rbac.service.js';
import type { MembershipStore } from '../ports/org.port.js';
import type { PermissionOverrideStore, PermissionOverride } from '../ports/rbac.port.js';
import type { Membership, Principal, Role } from '../types.js';

const noopLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as never;

function membership(over: Partial<Membership> & { orgId: string; userId: string; role: Role }): Membership {
  return {
    id: over.id ?? `m-${over.orgId}-${over.userId}`,
    orgId: over.orgId,
    userId: over.userId,
    teamId: over.teamId ?? null,
    role: over.role,
    status: over.status ?? 'active',
    invitedBy: over.invitedBy ?? null,
    createdAt: over.createdAt ?? new Date(),
  };
}

/** A membership store backed by a fixed list. */
function membershipStore(rows: readonly Membership[]): MembershipStore {
  return {
    insert: vi.fn(),
    find: vi.fn(async (orgId: string, userId: string) => rows.find((m) => m.orgId === orgId && m.userId === userId) ?? null),
    listForOrg: vi.fn(async (orgId: string) => rows.filter((m) => m.orgId === orgId)),
    listForUser: vi.fn(async (userId: string) => rows.filter((m) => m.userId === userId)),
    activate: vi.fn(),
    setRole: vi.fn(),
    remove: vi.fn(),
  } as unknown as MembershipStore;
}

function overrideStore(rows: readonly PermissionOverride[]): PermissionOverrideStore {
  return {
    listForMembership: vi.fn(async (membershipId: string) => rows.filter((o) => o.membershipId === membershipId)),
  };
}

function principal(over: Partial<Principal> & { userId: string }): Principal {
  return {
    userId: over.userId,
    ...(over.orgId ? { orgId: over.orgId } : {}),
    scopes: over.scopes ?? ['read', 'write'],
    kind: over.kind ?? 'session',
    isAnonymous: over.isAnonymous ?? false,
    raw: over.raw ?? null,
  };
}

function build(rows: readonly Membership[], overrides: readonly PermissionOverride[] = []): RbacService {
  return new RbacService({
    memberships: membershipStore(rows),
    overrides: overrideStore(overrides),
    logger: noopLogger,
  });
}

describe('RbacService — PermissionEvaluator', () => {
  describe('permissionsForRole (role expansion, owner ⊃ admin ⊃ member ⊃ viewer)', () => {
    it('viewer holds only read permissions', () => {
      const perms = ROLE_PERMISSIONS.viewer;
      expect(perms).toContain('org:read');
      expect(perms).not.toContain('run:create');
      expect(perms).not.toContain('org:manage');
    });

    it('member inherits every viewer permission and adds writes', () => {
      const member = new Set(ROLE_PERMISSIONS.member);
      for (const p of ROLE_PERMISSIONS.viewer) expect(member.has(p)).toBe(true);
      expect(member.has('run:create')).toBe(true);
      expect(member.has('org:manage')).toBe(false);
    });

    it('admin inherits member and adds org management', () => {
      const admin = new Set(ROLE_PERMISSIONS.admin);
      for (const p of ROLE_PERMISSIONS.member) expect(admin.has(p)).toBe(true);
      expect(admin.has('member:invite')).toBe(true);
      expect(admin.has('org:delete')).toBe(false);
    });

    it('owner is the superset of every weaker role', () => {
      const owner = new Set(ROLE_PERMISSIONS.owner);
      for (const p of ROLE_PERMISSIONS.admin) expect(owner.has(p)).toBe(true);
      expect(owner.has('org:delete')).toBe(true);
      expect(owner.has('billing:manage')).toBe(true);
    });

    it('expansion is deduped (a permission appears once)', () => {
      const perms = ROLE_PERMISSIONS.owner;
      expect(perms.length).toBe(new Set(perms).size);
    });
  });

  describe('can() allow/deny matrix', () => {
    it('grants an action the role holds', async () => {
      const svc = build([membership({ orgId: 'o1', userId: 'u1', role: 'admin' })]);
      expect(await svc.can(principal({ userId: 'u1' }), 'member:invite', { orgId: 'o1' })).toBe(true);
    });

    it('denies an action above the role', async () => {
      const svc = build([membership({ orgId: 'o1', userId: 'u1', role: 'member' })]);
      expect(await svc.can(principal({ userId: 'u1' }), 'org:manage', { orgId: 'o1' })).toBe(false);
    });

    it('viewer can read but not write', async () => {
      const svc = build([membership({ orgId: 'o1', userId: 'u1', role: 'viewer' })]);
      const p = principal({ userId: 'u1' });
      expect(await svc.can(p, 'member:read', { orgId: 'o1' })).toBe(true);
      expect(await svc.can(p, 'run:create', { orgId: 'o1' })).toBe(false);
    });

    it('falls back to principal.orgId when the resource omits an org', async () => {
      const svc = build([membership({ orgId: 'o1', userId: 'u1', role: 'admin' })]);
      expect(await svc.can(principal({ userId: 'u1', orgId: 'o1' }), 'team:create')).toBe(true);
    });
  });

  describe('org isolation', () => {
    it('denies a member of org A acting on org B (no membership → deny)', async () => {
      const svc = build([membership({ orgId: 'orgA', userId: 'u1', role: 'owner' })]);
      const decision = await svc.decide(principal({ userId: 'u1', orgId: 'orgA' }), 'member:read', { orgId: 'orgB' });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('no membership in org orgB');
    });

    it('denies when there is no org scope at all', async () => {
      const svc = build([]);
      const decision = await svc.decide(principal({ userId: 'u1' }), 'org:read');
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('no org scope');
    });

    it('denies an invited (not active) membership', async () => {
      const svc = build([membership({ orgId: 'o1', userId: 'u1', role: 'admin', status: 'invited' })]);
      const decision = await svc.decide(principal({ userId: 'u1' }), 'org:read', { orgId: 'o1' });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('not active');
    });
  });

  describe('super-users bypass org RBAC', () => {
    it('internal principals are always allowed', async () => {
      const svc = build([]);
      const internal = principal({ userId: 'internal-service', kind: 'internal', scopes: ['internal', 'admin'] });
      expect(await svc.can(internal, 'org:delete', { orgId: 'anything' })).toBe(true);
    });

    it('an admin scope bypasses membership resolution', async () => {
      const svc = build([]);
      const admin = principal({ userId: 'root', scopes: ['read', 'write', 'admin'] });
      expect(await svc.can(admin, 'org:delete', { orgId: 'o1' })).toBe(true);
    });

    it('anonymous never authorizes', async () => {
      const svc = build([]);
      const anon = principal({ userId: 'anonymous', kind: 'anonymous', scopes: [], isAnonymous: true });
      expect(await svc.can(anon, 'org:read', { orgId: 'o1' })).toBe(false);
    });
  });

  describe('per-membership overrides', () => {
    it('a deny override beats the role grant', async () => {
      const m = membership({ orgId: 'o1', userId: 'u1', role: 'owner' });
      const svc = build([m], [{ id: 'ov1', membershipId: m.id, permission: 'org:delete', effect: 'deny' }]);
      expect(await svc.can(principal({ userId: 'u1' }), 'org:delete', { orgId: 'o1' })).toBe(false);
    });

    it('an allow override grants a permission beyond the role', async () => {
      const m = membership({ orgId: 'o1', userId: 'u1', role: 'viewer' });
      const svc = build([m], [{ id: 'ov2', membershipId: m.id, permission: 'run:create', effect: 'allow' }]);
      expect(await svc.can(principal({ userId: 'u1' }), 'run:create', { orgId: 'o1' })).toBe(true);
    });
  });

  describe('fail-closed', () => {
    it('denies (never throws an allow) when the store faults', async () => {
      const faulting: MembershipStore = {
        insert: vi.fn(),
        find: vi.fn(async () => {
          throw new Error('db down');
        }),
        listForOrg: vi.fn(),
        listForUser: vi.fn(),
        activate: vi.fn(),
        setRole: vi.fn(),
        remove: vi.fn(),
      } as unknown as MembershipStore;
      const svc = new RbacService({ memberships: faulting, overrides: overrideStore([]), logger: noopLogger });
      const decision = await svc.decide(principal({ userId: 'u1' }), 'org:read', { orgId: 'o1' });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('evaluation error');
    });
  });
});
