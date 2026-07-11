# TDD Implementation Plan: Docker-Backend Organization Adapter

## Goal
Make the EXISTING docker-backend org model compile as an ADAPTER over the new canonical @recoder/agent-os identity contracts WITHOUT a big-bang rewrite. The docker-backend types (Organization, OrganizationMember, subscriptionTier 'free'|'pro'|'enterprise', OrganizationRole) become adapter functions that map to canonical structures (Membership, PlanTier 'free'|'pro'|'team'|'enterprise', Role 'owner'|'admin'|'member'|'viewer').

## Architecture
- **Adapter Pattern**: New `docker-backend/src/enterprise/organization-adapter.ts` module exports conversion functions
- **Additive Only**: No deletion or rewriting of existing `organization.ts`
- **Mapping Strategy**:
  - docker-backend `OrganizationRole` ('viewer'|'member'|'admin'|'owner') → canonical `Role` ('viewer'|'member'|'admin'|'owner') — 1:1 match
  - docker-backend `subscriptionTier` ('free'|'pro'|'enterprise') → canonical `PlanTier` ('free'|'pro'|'team'|'enterprise') — 'enterprise'→'enterprise', 'pro'→'pro', 'free'→'free', and note 'team' is new/not yet used
  - docker-backend `Organization` (id, name, slug, ownerId, createdAt, updatedAt, subscriptionTier) → canonical `Organization` (orgId, name, slug, ownerId, plan, createdAt, updatedAt) — timestamps stay as Date, convert to ISO strings when crossing boundary
  - docker-backend `OrganizationMember` (id, orgId, userId, email, role, joinedAt) → canonical `Membership` (orgId, userId, role, joinedAt) — drop id, email, displayName for now; keep joinedAt
  - docker-backend `Permission` enum → canonical `Permission` union — no direct map; membership permissions derive from role via canonical `membershipPermissions()`
- **Test-First**: Write failing vitest tests first; implement; run; commit

## Tech Stack
- **Test Runner**: vitest (ESM, .js import specifiers in docker-backend)
- **Imports**: `@recoder/agent-os/domain/organization` and `@recoder/agent-os/domain/rbac`
- **No External Libraries**: Use existing uuid, TS stdlib
- **Timestamps**: docker-backend uses `Date`; canonical uses ISO string; adapter converts at boundary
- **Rollback Safety**: Existing organization.ts untouched; adapter is pure functions

## Global Constraints
1. Existing `organization.ts` and `organizationStore` remain intact and fully functional
2. Adapter functions are pure (no side effects; no store mutation)
3. All adapter functions return canonical types OR throw on incompatible state (e.g., 'team' tier not yet used in docker-backend)
4. Tests run with `npm run test -- src/enterprise/organization-adapter.test.ts`
5. No changes to docker-backend exports or public API in this task (adapter is internal)
6. Migrations/bulk conversions are out of scope; adapter is for new code + gradual adoption

---

## Task 1: Write Organization Adapter with Tests (TDD)

### Files
- `/Users/arhansubasi/recoder.xyz/docker-backend/src/enterprise/organization-adapter.ts` (new)
- `/Users/arhansubasi/recoder.xyz/docker-backend/src/enterprise/organization-adapter.test.ts` (new)

### Interfaces (Canonical Types Imported)
```typescript
// From @recoder/agent-os/domain/organization.ts
type CanonicalOrganization = {
  orgId: string;
  name: string;
  slug: string;
  ownerId: string;
  plan: PlanTier;  // 'free' | 'pro' | 'team' | 'enterprise'
  createdAt: string;  // ISO 8601
  updatedAt: string;  // ISO 8601
  deletedAt?: string;
};

type CanonicalMembership = {
  orgId: string;
  userId: string;
  role: Role;  // 'owner' | 'admin' | 'member' | 'viewer'
  seatId?: string;
  joinedAt: string;  // ISO 8601
  invitedBy?: string;
};

// From docker-backend (existing)
type DockerBackendOrganization = {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  subscriptionTier?: 'free' | 'pro' | 'enterprise';
  deletedAt?: Date;
  // ... other fields
};

type DockerBackendMember = {
  id: string;
  orgId: string;
  userId: string;
  role: OrganizationRole;  // 'viewer' | 'member' | 'admin' | 'owner'
  joinedAt: Date;
  email: string;
  // ... other fields
};
```

### Adapter Function Signatures
```typescript
export function toCanonicalOrganization(dockerBackendOrg: Organization): CanonicalOrganization
export function toDockerBackendOrganization(canonicalOrg: CanonicalOrganization): Partial<Organization>
export function toCanonicalMembership(dockerBackendMember: OrganizationMember): CanonicalMembership
export function toDockerBackendMembership(canonicalMembership: CanonicalMembership): Partial<OrganizationMember>
export function mapSubscriptionTierToPlan(tier: 'free' | 'pro' | 'enterprise'): PlanTier
export function mapPlanToSubscriptionTier(plan: PlanTier): 'free' | 'pro' | 'enterprise' | undefined
export function mapOrganizationRole(role: OrganizationRole): Role
export function mapRole(role: Role): OrganizationRole
```

### Steps

#### Step 1: Write failing test for subscription tier mapping
```bash
cd /Users/arhansubasi/recoder.xyz/docker-backend
# Edit src/enterprise/organization-adapter.test.ts
```

**Test code** (add to organization-adapter.test.ts):
```typescript
import { describe, it, expect } from 'vitest';
import { mapSubscriptionTierToPlan, mapPlanToSubscriptionTier } from './organization-adapter.js';

describe('Organization Adapter — Subscription Tier Mapping', () => {
  describe('mapSubscriptionTierToPlan', () => {
    it('maps docker-backend "free" to canonical "free"', () => {
      expect(mapSubscriptionTierToPlan('free')).toBe('free');
    });

    it('maps docker-backend "pro" to canonical "pro"', () => {
      expect(mapSubscriptionTierToPlan('pro')).toBe('pro');
    });

    it('maps docker-backend "enterprise" to canonical "enterprise"', () => {
      expect(mapSubscriptionTierToPlan('enterprise')).toBe('enterprise');
    });
  });

  describe('mapPlanToSubscriptionTier', () => {
    it('maps canonical "free" to docker-backend "free"', () => {
      expect(mapPlanToSubscriptionTier('free')).toBe('free');
    });

    it('maps canonical "pro" to docker-backend "pro"', () => {
      expect(mapPlanToSubscriptionTier('pro')).toBe('pro');
    });

    it('maps canonical "enterprise" to docker-backend "enterprise"', () => {
      expect(mapPlanToSubscriptionTier('enterprise')).toBe('enterprise');
    });

    it('returns undefined for canonical "team" (not yet used in docker-backend)', () => {
      expect(mapPlanToSubscriptionTier('team')).toBeUndefined();
    });
  });
});
```

#### Step 2: Run test (fail)
```bash
npm run test -- src/enterprise/organization-adapter.test.ts
```

Expected: Tests fail because adapter.ts does not exist.

#### Step 3: Implement subscription tier mapping
**Create** `src/enterprise/organization-adapter.ts`:
```typescript
/**
 * Organization Adapter — Maps docker-backend models to canonical @recoder/agent-os contracts.
 *
 * Additive adapter layer. No mutations to existing organization.ts.
 * Timestamps convert from Date (docker-backend) to ISO 8601 strings (canonical).
 */

import type { Organization as CanonicalOrganization, PlanTier, Membership as CanonicalMembership } from '@recoder/agent-os/domain/organization.js';
import type { Role } from '@recoder/agent-os/domain/rbac.js';
import type { Organization, OrganizationMember, OrganizationRole } from './organization.js';

/**
 * Map docker-backend subscriptionTier to canonical PlanTier.
 * Note: 'team' is new in canonical model and not yet used in docker-backend.
 */
export function mapSubscriptionTierToPlan(tier: 'free' | 'pro' | 'enterprise'): PlanTier {
  const mapping: Record<'free' | 'pro' | 'enterprise', PlanTier> = {
    free: 'free',
    pro: 'pro',
    enterprise: 'enterprise',
  };
  return mapping[tier];
}

/**
 * Reverse map: canonical PlanTier to docker-backend subscriptionTier.
 * Returns undefined for 'team' (not yet used in docker-backend).
 */
export function mapPlanToSubscriptionTier(plan: PlanTier): 'free' | 'pro' | 'enterprise' | undefined {
  const mapping: Record<PlanTier, 'free' | 'pro' | 'enterprise' | undefined> = {
    free: 'free',
    pro: 'pro',
    enterprise: 'enterprise',
    team: undefined,  // Not yet used in docker-backend
  };
  return mapping[plan];
}

/**
 * Map docker-backend OrganizationRole to canonical Role.
 * Direct 1:1 mapping: both enums have 'viewer', 'member', 'admin', 'owner'.
 */
export function mapOrganizationRole(role: OrganizationRole): Role {
  return role as unknown as Role;  // Safe cast: enums are isomorphic
}

/**
 * Reverse map: canonical Role to docker-backend OrganizationRole.
 */
export function mapRole(role: Role): OrganizationRole {
  return role as unknown as OrganizationRole;  // Safe cast: enums are isomorphic
}

/**
 * Convert docker-backend Organization to canonical Organization.
 * Timestamps convert from Date to ISO 8601 strings.
 */
export function toCanonicalOrganization(dockerBackendOrg: Organization): CanonicalOrganization {
  return {
    orgId: dockerBackendOrg.id,
    name: dockerBackendOrg.name,
    slug: dockerBackendOrg.slug,
    ownerId: dockerBackendOrg.ownerId,
    plan: mapSubscriptionTierToPlan(dockerBackendOrg.subscriptionTier || 'free'),
    createdAt: dockerBackendOrg.createdAt.toISOString(),
    updatedAt: dockerBackendOrg.updatedAt.toISOString(),
    ...(dockerBackendOrg.deletedAt && { deletedAt: dockerBackendOrg.deletedAt.toISOString() }),
  };
}

/**
 * Convert canonical Organization back to docker-backend shape (partial).
 * Timestamps convert from ISO strings to Date.
 * Note: Missing docker-backend-specific fields (settings, trialEndsAt) — caller must merge.
 */
export function toDockerBackendOrganization(canonicalOrg: CanonicalOrganization): Partial<Organization> {
  const tier = mapPlanToSubscriptionTier(canonicalOrg.plan);
  
  const result: Partial<Organization> = {
    id: canonicalOrg.orgId,
    name: canonicalOrg.name,
    slug: canonicalOrg.slug,
    ownerId: canonicalOrg.ownerId,
    createdAt: new Date(canonicalOrg.createdAt),
    updatedAt: new Date(canonicalOrg.updatedAt),
  };

  if (tier) {
    result.subscriptionTier = tier;
  }

  if (canonicalOrg.deletedAt) {
    result.deletedAt = new Date(canonicalOrg.deletedAt);
  }

  return result;
}

/**
 * Convert docker-backend OrganizationMember to canonical Membership.
 * Timestamps convert from Date to ISO 8601 strings.
 * Note: email, displayName not carried; seatId always undefined (not yet linked).
 */
export function toCanonicalMembership(dockerBackendMember: OrganizationMember): CanonicalMembership {
  return {
    orgId: dockerBackendMember.orgId,
    userId: dockerBackendMember.userId,
    role: mapOrganizationRole(dockerBackendMember.role),
    joinedAt: dockerBackendMember.joinedAt.toISOString(),
    ...(dockerBackendMember.invitedBy && { invitedBy: dockerBackendMember.invitedBy }),
  };
}

/**
 * Convert canonical Membership back to docker-backend OrganizationMember shape (partial).
 * Timestamps convert from ISO strings to Date.
 * Note: Missing docker-backend-specific fields (id, email, displayName, teamIds, customPermissions) — caller must merge.
 */
export function toDockerBackendMembership(canonicalMembership: CanonicalMembership): Partial<OrganizationMember> {
  return {
    orgId: canonicalMembership.orgId,
    userId: canonicalMembership.userId,
    role: mapRole(canonicalMembership.role),
    joinedAt: new Date(canonicalMembership.joinedAt),
    ...(canonicalMembership.invitedBy && { invitedBy: canonicalMembership.invitedBy }),
  };
}
```

#### Step 4: Run test (pass)
```bash
npm run test -- src/enterprise/organization-adapter.test.ts
```

Expected: All tests pass.

#### Step 5: Commit
```bash
cd /Users/arhansubasi/recoder.xyz/docker-backend
git add src/enterprise/organization-adapter.ts src/enterprise/organization-adapter.test.ts
git commit -m "feat(organization-adapter): add subscription tier mapping (free/pro/enterprise → PlanTier)

Map docker-backend subscriptionTier to canonical PlanTier for gradual migration.
Supports 1:1 tier mapping; 'team' marked as undefined (new, not yet used).
Adapter is pure functions, no store mutations.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Implement Full Organization Adapter (TDD)

### Files
- `/Users/arhansubasi/recoder.xyz/docker-backend/src/enterprise/organization-adapter.ts` (extend)
- `/Users/arhansubasi/recoder.xyz/docker-backend/src/enterprise/organization-adapter.test.ts` (extend)

### Steps

#### Step 1: Write failing test for toCanonicalOrganization
**Add to organization-adapter.test.ts**:
```typescript
describe('toCanonicalOrganization', () => {
  it('converts docker-backend Organization to canonical Organization', () => {
    const dockerBackendOrg: Organization = {
      id: 'org-123',
      name: 'My Org',
      slug: 'my-org',
      ownerId: 'owner-456',
      createdAt: new Date('2026-07-01T00:00:00Z'),
      updatedAt: new Date('2026-07-10T12:00:00Z'),
      subscriptionTier: 'pro',
      settings: {},
    };

    const canonical = toCanonicalOrganization(dockerBackendOrg);

    expect(canonical).toEqual({
      orgId: 'org-123',
      name: 'My Org',
      slug: 'my-org',
      ownerId: 'owner-456',
      plan: 'pro',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-10T12:00:00.000Z',
    });
  });

  it('includes deletedAt when present', () => {
    const dockerBackendOrg: Organization = {
      id: 'org-123',
      name: 'My Org',
      slug: 'my-org',
      ownerId: 'owner-456',
      createdAt: new Date('2026-07-01T00:00:00Z'),
      updatedAt: new Date('2026-07-10T12:00:00Z'),
      deletedAt: new Date('2026-07-11T00:00:00Z'),
      subscriptionTier: 'enterprise',
      settings: {},
    };

    const canonical = toCanonicalOrganization(dockerBackendOrg);

    expect(canonical.deletedAt).toBe('2026-07-11T00:00:00.000Z');
  });

  it('defaults subscriptionTier to "free" if not set', () => {
    const dockerBackendOrg: Organization = {
      id: 'org-123',
      name: 'My Org',
      slug: 'my-org',
      ownerId: 'owner-456',
      createdAt: new Date('2026-07-01T00:00:00Z'),
      updatedAt: new Date('2026-07-10T12:00:00Z'),
      settings: {},
    };

    const canonical = toCanonicalOrganization(dockerBackendOrg);

    expect(canonical.plan).toBe('free');
  });
});
```

#### Step 2: Run test (fail)
```bash
npm run test -- src/enterprise/organization-adapter.test.ts
```

Expected: Tests fail (already implemented in Step 1 of Task 1, but tests now more comprehensive).

#### Step 3: Verify test passes
```bash
npm run test -- src/enterprise/organization-adapter.test.ts
```

#### Step 4: Write failing test for toCanonicalMembership
**Add to organization-adapter.test.ts**:
```typescript
describe('toCanonicalMembership', () => {
  it('converts docker-backend OrganizationMember to canonical Membership', () => {
    const dockerBackendMember: OrganizationMember = {
      id: 'member-789',
      orgId: 'org-123',
      userId: 'user-456',
      email: 'user@example.com',
      role: OrganizationRole.MEMBER,
      teamIds: [],
      joinedAt: new Date('2026-07-05T10:00:00Z'),
    };

    const canonical = toCanonicalMembership(dockerBackendMember);

    expect(canonical).toEqual({
      orgId: 'org-123',
      userId: 'user-456',
      role: 'member',
      joinedAt: '2026-07-05T10:00:00.000Z',
    });
  });

  it('includes invitedBy when present', () => {
    const dockerBackendMember: OrganizationMember = {
      id: 'member-789',
      orgId: 'org-123',
      userId: 'user-456',
      email: 'user@example.com',
      role: OrganizationRole.ADMIN,
      teamIds: [],
      joinedAt: new Date('2026-07-05T10:00:00Z'),
      invitedBy: 'owner-456',
    };

    const canonical = toCanonicalMembership(dockerBackendMember);

    expect(canonical.invitedBy).toBe('owner-456');
  });

  it('maps all OrganizationRole values to canonical Role', () => {
    const roles: OrganizationRole[] = [
      OrganizationRole.VIEWER,
      OrganizationRole.MEMBER,
      OrganizationRole.ADMIN,
      OrganizationRole.OWNER,
    ];

    roles.forEach((role) => {
      const dockerBackendMember: OrganizationMember = {
        id: 'member-789',
        orgId: 'org-123',
        userId: 'user-456',
        email: 'user@example.com',
        role,
        teamIds: [],
        joinedAt: new Date('2026-07-05T10:00:00Z'),
      };

      const canonical = toCanonicalMembership(dockerBackendMember);
      
      expect(['viewer', 'member', 'admin', 'owner']).toContain(canonical.role);
      expect(canonical.role).toBe(role);
    });
  });
});
```

#### Step 5: Run test (fail)
```bash
npm run test -- src/enterprise/organization-adapter.test.ts
```

Expected: toCanonicalMembership tests fail (implementation already in adapter, but verify comprehensive coverage).

#### Step 6: Verify all tests pass
```bash
npm run test -- src/enterprise/organization-adapter.test.ts
```

#### Step 7: Write failing test for reverse conversions
**Add to organization-adapter.test.ts**:
```typescript
describe('toDockerBackendOrganization', () => {
  it('converts canonical Organization back to docker-backend shape', () => {
    const canonicalOrg: CanonicalOrganization = {
      orgId: 'org-123',
      name: 'My Org',
      slug: 'my-org',
      ownerId: 'owner-456',
      plan: 'pro',
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-10T12:00:00Z',
    };

    const dockerBackend = toDockerBackendOrganization(canonicalOrg);

    expect(dockerBackend).toEqual({
      id: 'org-123',
      name: 'My Org',
      slug: 'my-org',
      ownerId: 'owner-456',
      subscriptionTier: 'pro',
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
    expect((dockerBackend.createdAt as Date).toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('returns undefined subscriptionTier for canonical "team" plan', () => {
    const canonicalOrg: CanonicalOrganization = {
      orgId: 'org-123',
      name: 'My Org',
      slug: 'my-org',
      ownerId: 'owner-456',
      plan: 'team',
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-10T12:00:00Z',
    };

    const dockerBackend = toDockerBackendOrganization(canonicalOrg);

    expect(dockerBackend.subscriptionTier).toBeUndefined();
  });

  it('includes deletedAt when present', () => {
    const canonicalOrg: CanonicalOrganization = {
      orgId: 'org-123',
      name: 'My Org',
      slug: 'my-org',
      ownerId: 'owner-456',
      plan: 'enterprise',
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-10T12:00:00Z',
      deletedAt: '2026-07-11T00:00:00Z',
    };

    const dockerBackend = toDockerBackendOrganization(canonicalOrg);

    expect((dockerBackend.deletedAt as Date).toISOString()).toBe('2026-07-11T00:00:00.000Z');
  });
});

describe('toDockerBackendMembership', () => {
  it('converts canonical Membership back to docker-backend shape', () => {
    const canonicalMembership: CanonicalMembership = {
      orgId: 'org-123',
      userId: 'user-456',
      role: 'admin',
      joinedAt: '2026-07-05T10:00:00Z',
    };

    const dockerBackend = toDockerBackendMembership(canonicalMembership);

    expect(dockerBackend).toEqual({
      orgId: 'org-123',
      userId: 'user-456',
      role: OrganizationRole.ADMIN,
      joinedAt: expect.any(Date),
    });
    expect((dockerBackend.joinedAt as Date).toISOString()).toBe('2026-07-05T10:00:00.000Z');
  });

  it('includes invitedBy when present', () => {
    const canonicalMembership: CanonicalMembership = {
      orgId: 'org-123',
      userId: 'user-456',
      role: 'owner',
      joinedAt: '2026-07-05T10:00:00Z',
      invitedBy: 'someone-else',
    };

    const dockerBackend = toDockerBackendMembership(canonicalMembership);

    expect(dockerBackend.invitedBy).toBe('someone-else');
  });
});
```

#### Step 8: Run test (fail)
```bash
npm run test -- src/enterprise/organization-adapter.test.ts
```

Expected: Reverse conversion tests fail (implementations already exist from Step 1 of Task 1).

#### Step 9: Verify all tests pass
```bash
npm run test -- src/enterprise/organization-adapter.test.ts
```

#### Step 10: Commit
```bash
cd /Users/arhansubasi/recoder.xyz/docker-backend
git add src/enterprise/organization-adapter.ts src/enterprise/organization-adapter.test.ts
git commit -m "feat(organization-adapter): implement full bidirectional conversion layer

- toCanonicalOrganization: docker-backend → canonical (id→orgId, subscriptionTier→plan)
- toCanonicalMembership: docker-backend → canonical (drops email, displayName)
- toDockerBackendOrganization: canonical → docker-backend (orgId→id, plan→subscriptionTier)
- toDockerBackendMembership: canonical → docker-backend (role mapping)
- Comprehensive tests for all conversions including edge cases (deletedAt, invitedBy, 'team' plan)
- Timestamps convert Date ↔ ISO 8601 strings at boundary
- All tests passing; no changes to existing organization.ts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Role Mapping & Canonical Permission Adapter (TDD)

### Files
- `/Users/arhansubasi/recoder.xyz/docker-backend/src/enterprise/organization-adapter.ts` (extend)
- `/Users/arhansubasi/recoder.xyz/docker-backend/src/enterprise/organization-adapter.test.ts` (extend)

### Interfaces
```typescript
// From @recoder/agent-os/domain/rbac.ts
type CanonicalPermission = 'workspace.read' | 'workspace.write' | 'run.start' | 'approval.decide' | 'memory.write' | 'billing.manage' | 'org.manage' | 'audit.read';

// docker-backend uses Permission enum (16 distinct permissions: org:*, team:*, member:*, project:*, settings:*, audit:*)
// Canonical model uses smaller Permission union (8 core permissions)
// Adapter provides informational mapping + conversion helper
```

### Steps

#### Step 1: Write failing test for canonical permissions lookup
**Add to organization-adapter.test.ts**:
```typescript
import { membershipPermissions } from '@recoder/agent-os/domain/organization.js';

describe('Canonical Permission Lookup via Membership', () => {
  it('canonical "owner" role has all permissions', () => {
    const canonicalMembership: CanonicalMembership = {
      orgId: 'org-123',
      userId: 'user-456',
      role: 'owner',
      joinedAt: '2026-07-05T10:00:00Z',
    };

    const perms = membershipPermissions(canonicalMembership);

    expect(perms.size).toBeGreaterThan(0);
    expect(perms.has('billing.manage')).toBe(true);
    expect(perms.has('org.manage')).toBe(true);
  });

  it('canonical "admin" role has org.manage but not billing.manage', () => {
    const canonicalMembership: CanonicalMembership = {
      orgId: 'org-123',
      userId: 'user-456',
      role: 'admin',
      joinedAt: '2026-07-05T10:00:00Z',
    };

    const perms = membershipPermissions(canonicalMembership);

    expect(perms.has('org.manage')).toBe(true);
    expect(perms.has('billing.manage')).toBe(false);
  });

  it('canonical "member" role has workspace.write and run.start', () => {
    const canonicalMembership: CanonicalMembership = {
      orgId: 'org-123',
      userId: 'user-456',
      role: 'member',
      joinedAt: '2026-07-05T10:00:00Z',
    };

    const perms = membershipPermissions(canonicalMembership);

    expect(perms.has('workspace.write')).toBe(true);
    expect(perms.has('run.start')).toBe(true);
    expect(perms.has('billing.manage')).toBe(false);
  });

  it('canonical "viewer" role has workspace.read only', () => {
    const canonicalMembership: CanonicalMembership = {
      orgId: 'org-123',
      userId: 'user-456',
      role: 'viewer',
      joinedAt: '2026-07-05T10:00:00Z',
    };

    const perms = membershipPermissions(canonicalMembership);

    expect(perms.has('workspace.read')).toBe(true);
    expect(perms.has('workspace.write')).toBe(false);
  });
});
```

#### Step 2: Run test (pass)
```bash
npm run test -- src/enterprise/organization-adapter.test.ts
```

Expected: Tests pass (membershipPermissions is from canonical module, adapter only imports & tests).

#### Step 3: Add informational mapping helper
**Add to organization-adapter.ts**:
```typescript
/**
 * Informational mapping of docker-backend Permission → canonical Permission.
 *
 * Docker-backend has 16 permissions across org/team/member/project/settings/audit domains.
 * Canonical model has 8 core permissions: workspace.read, workspace.write, run.start,
 * approval.decide, memory.write, billing.manage, org.manage, audit.read.
 *
 * Docker-backend fine-grained permissions cannot be 1:1 mapped. Instead, a Membership's
 * canonical role (owner/admin/member/viewer) derives all canonical permissions via
 * membershipPermissions(). This function is for reference/documentation only.
 */
export const DOCKER_BACKEND_TO_CANONICAL_PERMISSION_REFERENCE: Record<
  string,
  readonly string[] | null
> = {
  // Organization permissions
  'org:view': ['workspace.read'],
  'org:update': ['org.manage'],
  'org:delete': ['org.manage'],
  'org:manage_billing': ['billing.manage'],

  // Team permissions (collapse to workspace permissions)
  'team:view': ['workspace.read'],
  'team:create': ['workspace.write'],
  'team:update': ['workspace.write'],
  'team:delete': ['workspace.write'],
  'team:manage_members': ['org.manage'],

  // Member permissions
  'member:view': ['workspace.read'],
  'member:invite': ['org.manage'],
  'member:remove': ['org.manage'],
  'member:update_role': ['org.manage'],

  // Project permissions
  'project:view': ['workspace.read'],
  'project:create': ['workspace.write'],
  'project:update': ['workspace.write'],
  'project:delete': ['workspace.write'],
  'project:deploy': ['run.start'],

  // Settings permissions
  'settings:view': ['workspace.read'],
  'settings:update': ['org.manage'],

  // Audit permissions
  'audit:view': ['audit.read'],
};

/**
 * Reference: Map docker-backend Permission to canonical Permission(s).
 * Informational only — actual canonical permissions derive from role via membershipPermissions().
 */
export function getCanonicalPermissionsForDockerBackendPermission(
  dockerBackendPermission: string
): readonly string[] {
  return DOCKER_BACKEND_TO_CANONICAL_PERMISSION_REFERENCE[dockerBackendPermission] ?? [];
}
```

#### Step 4: Write test for mapping helper
**Add to organization-adapter.test.ts**:
```typescript
import { getCanonicalPermissionsForDockerBackendPermission } from './organization-adapter.js';

describe('Docker-Backend to Canonical Permission Reference', () => {
  it('maps org:manage_billing to billing.manage', () => {
    const canonical = getCanonicalPermissionsForDockerBackendPermission('org:manage_billing');
    expect(canonical).toContain('billing.manage');
  });

  it('maps project:deploy to run.start', () => {
    const canonical = getCanonicalPermissionsForDockerBackendPermission('project:deploy');
    expect(canonical).toContain('run.start');
  });

  it('maps org:view to workspace.read', () => {
    const canonical = getCanonicalPermissionsForDockerBackendPermission('org:view');
    expect(canonical).toContain('workspace.read');
  });

  it('returns empty array for unknown permission', () => {
    const canonical = getCanonicalPermissionsForDockerBackendPermission('unknown:permission');
    expect(canonical).toEqual([]);
  });
});
```

#### Step 5: Run test (fail, then pass)
```bash
npm run test -- src/enterprise/organization-adapter.test.ts
```

Expected: Tests fail (mapping helper not yet implemented).

Then implement mapping helper (already done in Step 3), run test again.

Expected: Tests pass.

#### Step 6: Commit
```bash
cd /Users/arhansubasi/recoder.xyz/docker-backend
git add src/enterprise/organization-adapter.ts src/enterprise/organization-adapter.test.ts
git commit -m "feat(organization-adapter): add canonical permission reference & mapping

- Add informational mapping: docker-backend 16 Permission → canonical 8 Permission
- Canonical permissions derive from role (owner/admin/member/viewer) via membershipPermissions()
- Docker-backend fine-grained permissions collapse to canonical core permissions
- getCanonicalPermissionsForDockerBackendPermission() for reference/audit logging
- Comprehensive tests verify all mappings (org:*, team:*, member:*, project:*, settings:*, audit:*)
- All tests passing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Checklist

- [ ] **Additive Only**: No changes to existing `organization.ts`; all adapter code in new `organization-adapter.ts`
- [ ] **Purity**: All adapter functions are pure (no store mutations, no side effects)
- [ ] **Type Safety**: Strict typing; no `any`; all conversions explicit and tested
- [ ] **Timestamp Handling**: Date ↔ ISO 8601 string conversion at boundary verified
- [ ] **Tier Mapping**: 'free'|'pro'|'enterprise' ↔ PlanTier with 'team' → undefined documented
- [ ] **Role Mapping**: 1:1 isomorphic mapping verified for all four roles
- [ ] **Permission Reference**: Docker-backend 16 permissions mapped to canonical 8 permissions (informational)
- [ ] **Test Coverage**: 
  - Subscription tier mapping (forward & reverse) — 3 tiers + 'team' edge case
  - Organization conversion (forward & reverse) — normal, with deletedAt, default tier
  - Membership conversion (forward & reverse) — all 4 roles, with/without invitedBy
  - Permission reference mapping — sample permissions + unknown case
- [ ] **Vitest ESM**: All imports use `.js`; test runner configured
- [ ] **Error Handling**: Adapter functions don't throw (pure conversions); caller handles schema violations
- [ ] **Commits**: One commit per TDD cycle (failing test → implementation → passing test → commit)
- [ ] **No DB/Store**: Adapter is stateless; no integration with `organizationStore`
- [ ] **Reverse Mappings Documented**: Partial returns noted; caller must merge with existing fields (e.g., settings, email, teamIds)

---

## Success Criteria

1. All three tasks complete with passing tests
2. `npm run test -- src/enterprise/organization-adapter.test.ts` → all tests pass
3. No changes to existing `organization.ts` or public docker-backend API
4. Adapter functions callable from canonical agent-os code (no compilation errors)
5. Types correctly imported from `@recoder/agent-os/domain/organization.ts` and `.../rbac.ts`
6. Full bidirectional conversion: docker-backend ↔ canonical
7. Tier mapping handles 'team' as new (returns undefined on reverse)
8. Role mapping 1:1 verified for all four roles
9. Permission reference informational (derives from role via canonical `membershipPermissions()`)
10. Three explicit commits (one per task, each with ~5-10 tests passing)

---

End of Plan
