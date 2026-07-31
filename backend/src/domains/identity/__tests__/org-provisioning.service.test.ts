import { describe, it, expect, vi } from 'vitest';
import { createOrgProvisioningService } from '../org-provisioning.service.js';
import type { CreateOrgParams } from '../ports/org.port.js';
import type { Membership, Org } from '../types.js';

const noopLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as never;

/**
 * In-memory fakes for the two narrow seams the provisioner consumes:
 *  - `orgService.createOrg` (atomic org + owner membership, slug-unique)
 *  - `memberships.listForUser` (the authz-resolution read)
 */
function fakes() {
  const orgs: Org[] = [];
  const memberships: Membership[] = [];
  let seq = 0;

  const createOrg = vi.fn(async (params: CreateOrgParams): Promise<Org> => {
    if (orgs.some((o) => o.slug === params.slug)) {
      throw new Error(`org slug "${params.slug}" is already taken`);
    }
    seq += 1;
    const org: Org = {
      id: `org-${seq}`,
      slug: params.slug,
      name: params.name,
      ownerUserId: params.ownerUserId,
      ssoConnection: null,
      createdAt: new Date(),
    };
    orgs.push(org);
    memberships.push({
      id: `m-${seq}`,
      orgId: org.id,
      userId: params.ownerUserId,
      teamId: null,
      role: 'owner',
      status: 'active',
      invitedBy: null,
      createdAt: new Date(),
    });
    return org;
  });

  const listForUser = vi.fn(
    async (userId: string): Promise<readonly Membership[]> => memberships.filter((m) => m.userId === userId),
  );

  return { orgs, memberships, createOrg, listForUser };
}

function build(overrides?: { createOrg?: unknown; listForUser?: unknown }) {
  const f = fakes();
  const svc = createOrgProvisioningService({
    orgService: { createOrg: (overrides?.createOrg ?? f.createOrg) as typeof f.createOrg },
    memberships: { listForUser: (overrides?.listForUser ?? f.listForUser) as typeof f.listForUser },
    logger: noopLogger,
  });
  return { svc, ...f };
}

describe('OrgProvisioningService — lazy personal-org provisioning (#11) + orgId resolution (#9)', () => {
  it('provisions exactly one personal org + owner membership on a fresh user first request', async () => {
    const { svc, createOrg, orgs, memberships } = build();
    const orgId = await svc.ensurePersonalOrg('user-1');

    expect(orgId).toBe('org-1');
    expect(createOrg).toHaveBeenCalledTimes(1);
    expect(orgs.length).toBe(1);
    expect(memberships.length).toBe(1);
    expect(memberships[0].role).toBe('owner');
    expect(memberships[0].status).toBe('active');
    expect(memberships[0].userId).toBe('user-1');
    // Personal-org slug is stable + user-scoped (idempotent key).
    expect(orgs[0].slug).toBe('personal-user-1');
  });

  it('is idempotent: a second call no-ops (cache), never creates a duplicate', async () => {
    const { svc, createOrg, listForUser, orgs } = build();
    const first = await svc.ensurePersonalOrg('user-1');
    const second = await svc.ensurePersonalOrg('user-1');

    expect(first).toBe(second);
    expect(createOrg).toHaveBeenCalledTimes(1); // only the first provisioned
    expect(orgs.length).toBe(1);
    // Second call served from the per-process cache — no repeat DB read either.
    expect(listForUser).toHaveBeenCalledTimes(1);
  });

  it('resolves an existing active membership without creating a new org', async () => {
    const { svc, createOrg, memberships } = build();
    // Seed an existing active membership in a (non-personal) org the user already joined.
    memberships.push({
      id: 'm-existing',
      orgId: 'org-existing',
      userId: 'user-2',
      teamId: null,
      role: 'member',
      status: 'active',
      invitedBy: 'owner',
      createdAt: new Date(),
    });

    const orgId = await svc.ensurePersonalOrg('user-2');
    expect(orgId).toBe('org-existing');
    expect(createOrg).not.toHaveBeenCalled();
  });

  it('ignores invited-only memberships and provisions a personal org', async () => {
    const { svc, createOrg, memberships } = build();
    memberships.push({
      id: 'm-invited',
      orgId: 'org-invited',
      userId: 'user-3',
      teamId: null,
      role: 'member',
      status: 'invited',
      invitedBy: 'owner',
      createdAt: new Date(),
    });

    const orgId = await svc.ensurePersonalOrg('user-3');
    expect(orgId).toBe('org-1'); // freshly provisioned personal org
    expect(createOrg).toHaveBeenCalledTimes(1);
  });

  it('is race-safe: a concurrent creator wins → re-resolves to the existing org', async () => {
    const { svc, memberships } = build({
      // createOrg loses the race (slug already taken by a concurrent request).
      createOrg: vi.fn(async () => {
        throw new Error('org slug "personal-user-4" is already taken');
      }),
      // First read sees nothing; the retry read (after the failed create) sees the winner's membership.
      listForUser: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'm-winner',
            orgId: 'org-winner',
            userId: 'user-4',
            teamId: null,
            role: 'owner',
            status: 'active',
            invitedBy: null,
            createdAt: new Date(),
          } satisfies Membership,
        ]),
    });
    void memberships;

    const orgId = await svc.ensurePersonalOrg('user-4');
    expect(orgId).toBe('org-winner');
  });

  it('degrades safely: a hard create failure with no membership resolves to undefined (never throws)', async () => {
    const { svc } = build({
      createOrg: vi.fn(async () => {
        throw new Error('db down');
      }),
      listForUser: vi.fn(async () => []),
    });
    await expect(svc.ensurePersonalOrg('user-5')).resolves.toBeUndefined();
  });

  it('does not cache a degraded (undefined) resolution — a later request retries', async () => {
    const listForUser = vi
      .fn()
      .mockRejectedValueOnce(new Error('db blip')) // provision throws
      .mockResolvedValueOnce([]) // re-resolve after throw → still none
      .mockResolvedValueOnce([
        {
          id: 'm-late',
          orgId: 'org-late',
          userId: 'user-6',
          teamId: null,
          role: 'owner',
          status: 'active',
          invitedBy: null,
          createdAt: new Date(),
        } satisfies Membership,
      ]);
    const { svc } = build({ createOrg: vi.fn(async () => { throw new Error('unused'); }), listForUser });

    expect(await svc.ensurePersonalOrg('user-6')).toBeUndefined();
    // DB recovered: a later request now resolves — proving the negative was not cached.
    expect(await svc.ensurePersonalOrg('user-6')).toBe('org-late');
  });

  it('returns undefined for an empty userId without touching the stores', async () => {
    const { svc, createOrg, listForUser } = build();
    expect(await svc.ensurePersonalOrg('')).toBeUndefined();
    expect(createOrg).not.toHaveBeenCalled();
    expect(listForUser).not.toHaveBeenCalled();
  });
});
