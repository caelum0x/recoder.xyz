# P0c — Canonical Identity Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the canonical, additive identity contracts — `Organization`, `Membership`, `Seat`, and the unified `PlanTier` — to `@recoder/agent-os`, with membership roles wired to the RBAC model already shipped (`rbac.ts`). This is the single source of truth the existing divergent org model (`docker-backend/src/enterprise/organization.ts`) will become an adapter over later (deferred to P0c-2, not this plan).

**Architecture:** Follow the established `packages/agent-os` contract pattern — immutable `type` definitions, `*Enum` constants, guard/derivation functions, barrel exports. The `Membership.role` reuses `Role` from `./rbac`, and `membershipPermissions()` composes with `permissionsForRoles()`. Timestamps are ISO strings (matching `workspace.ts`), NOT `Date`. `orgId` matches `TenantContext.orgId`. Spec: `docs/superpowers/specs/2026-07-11-recoder-desktop-enterprise-architecture-design.md` §6 D5 (one identity/org model, one tier enum).

**Tech Stack:** TypeScript ESM, `packages/agent-os` builds with `tsup`, tests use **`node:test` + tsx** (`import test from 'node:test'; import assert from 'node:assert/strict'`), strict + `verbatimModuleSyntax`.

## Global Constraints

- Test runner: `cd packages/agent-os && node --test --import tsx src/domain/<file>.test.ts`.
- `verbatimModuleSyntax: true` — type-only imports use `import type { X }`.
- Immutable `type` contracts; ISO-string timestamps; additive only (no edits to existing types).
- The unified `PlanTier` is exactly `'free' | 'pro' | 'team' | 'enterprise'` (spec D5 — retires the docker-backend `free/pro/enterprise` set; that retirement is deferred to P0c-2).
- `Membership.role` MUST be the canonical `Role` from `./rbac` (no second role enum).
- Barrel: add every new file to `packages/agent-os/src/domain/index.ts`.
- Root contract tests live at `tests/contracts/agent-os/*.test.ts`, run with `pnpm test:contracts:agent-os`.

---

### Task 1: Organization / Membership / Seat contracts + PlanTier

**Files:**
- Create: `packages/agent-os/src/domain/organization.ts`
- Create (test): `packages/agent-os/src/domain/organization.test.ts`
- Modify: `packages/agent-os/src/domain/index.ts`

**Interfaces:**
- Consumes: `Role`, `Permission`, `permissionsForRoles` from `./rbac`.
- Produces: `type PlanTier`, const `PlanTierEnum`, `type Organization`, `type Membership`, `type Seat`, `type SeatStatus`, `membershipPermissions(m): Set<Permission>`, `isSeatActive(s): boolean`.

- [ ] **Step 1: Write the failing test**

Create `packages/agent-os/src/domain/organization.test.ts`:

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PlanTierEnum,
  isSeatActive,
  membershipPermissions,
  type Membership,
  type Organization,
  type Seat,
} from './organization';

const org: Organization = {
  orgId: 'org-1',
  name: 'Acme',
  slug: 'acme',
  ownerId: 'user-1',
  plan: PlanTierEnum.Team,
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
};

test('PlanTierEnum is the unified free/pro/team/enterprise set', () => {
  assert.deepEqual(Object.values(PlanTierEnum).sort(), ['enterprise', 'free', 'pro', 'team']);
  assert.equal(org.plan, 'team');
});

test('membershipPermissions derives permissions from the canonical RBAC role', () => {
  const admin: Membership = { orgId: 'org-1', userId: 'u2', role: 'admin', joinedAt: '2026-07-11T00:00:00.000Z' };
  const viewer: Membership = { orgId: 'org-1', userId: 'u3', role: 'viewer', joinedAt: '2026-07-11T00:00:00.000Z' };
  assert.equal(membershipPermissions(admin).has('approval.decide'), true);
  assert.equal(membershipPermissions(viewer).has('approval.decide'), false);
});

test('isSeatActive is true only for active seats', () => {
  const active: Seat = { seatId: 's1', orgId: 'org-1', userId: 'u2', status: 'active', assignedAt: '2026-07-11T00:00:00.000Z' };
  const revoked: Seat = { seatId: 's2', orgId: 'org-1', status: 'revoked' };
  assert.equal(isSeatActive(active), true);
  assert.equal(isSeatActive(revoked), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-os && node --test --import tsx src/domain/organization.test.ts`
Expected: FAIL — cannot find module `./organization`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/agent-os/src/domain/organization.ts`:

```typescript
import { permissionsForRoles, type Permission, type Role } from './rbac';

/** The unified plan tier (spec D5). Retires the divergent free/pro/enterprise set. */
export type PlanTier = 'free' | 'pro' | 'team' | 'enterprise';

export const PlanTierEnum = {
  Free: 'free',
  Pro: 'pro',
  Team: 'team',
  Enterprise: 'enterprise',
} as const satisfies Record<string, PlanTier>;

/**
 * Organization — the canonical tenant/billing entity. `orgId` matches
 * TenantContext.orgId. Timestamps are ISO strings.
 */
export type Organization = {
  orgId: string;
  name: string;
  /** URL-friendly unique identifier. */
  slug: string;
  /** User id of the owner. */
  ownerId: string;
  plan: PlanTier;
  createdAt: string;
  updatedAt: string;
  /** Soft-delete marker. */
  deletedAt?: string;
};

/**
 * Membership — a user's binding to an org with a canonical RBAC role and an
 * optional assigned seat. The role is the ONE role model (packages/agent-os/rbac).
 */
export type Membership = {
  orgId: string;
  userId: string;
  role: Role;
  seatId?: string;
  joinedAt: string;
  invitedBy?: string;
};

export type SeatStatus = 'active' | 'reserved' | 'revoked';

/** Seat — a billable license slot in an org, optionally assigned to a user. */
export type Seat = {
  seatId: string;
  orgId: string;
  userId?: string;
  status: SeatStatus;
  assignedAt?: string;
  revokedAt?: string;
};

/** Permissions a membership grants, derived from its canonical RBAC role. */
export function membershipPermissions(membership: Membership): Set<Permission> {
  return permissionsForRoles([membership.role]);
}

export function isSeatActive(seat: Seat): boolean {
  return seat.status === 'active';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent-os && node --test --import tsx src/domain/organization.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add barrel export**

In `packages/agent-os/src/domain/index.ts`, add:

```typescript
export * from './organization';
```

- [ ] **Step 6: Commit**

```bash
git add packages/agent-os/src/domain/organization.ts packages/agent-os/src/domain/organization.test.ts packages/agent-os/src/domain/index.ts
git commit -m "feat(agent-os): canonical Organization/Membership/Seat contracts + unified PlanTier

Membership.role reuses the canonical RBAC Role; membershipPermissions composes
with permissionsForRoles. PlanTier = free/pro/team/enterprise (spec D5)."
```

---

### Task 2: Cross-package identity contract test

**Files:**
- Create: `tests/contracts/agent-os/identity.contract.test.ts`

**Interfaces:**
- Consumes the public barrel: `import { PlanTierEnum, membershipPermissions, isSeatActive, RoleEnum, type Membership, type Organization } from '@recoder/agent-os'`.

- [ ] **Step 1: Write the contract test**

Create `tests/contracts/agent-os/identity.contract.test.ts`:

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PlanTierEnum,
  RoleEnum,
  isSeatActive,
  membershipPermissions,
  type Membership,
  type Organization,
} from '@recoder/agent-os';

test('contract: identity contracts are exported from the package entrypoint', () => {
  const org: Organization = {
    orgId: 'org-1', name: 'Acme', slug: 'acme', ownerId: 'u1',
    plan: PlanTierEnum.Enterprise, createdAt: '2026-07-11T00:00:00.000Z', updatedAt: '2026-07-11T00:00:00.000Z',
  };
  assert.equal(org.plan, 'enterprise');
  assert.equal(typeof membershipPermissions, 'function');
  assert.equal(typeof isSeatActive, 'function');
});

test('contract: an owner membership composes with the RBAC model to grant billing.manage', () => {
  const owner: Membership = { orgId: 'org-1', userId: 'u1', role: RoleEnum.Owner, joinedAt: '2026-07-11T00:00:00.000Z' };
  assert.equal(membershipPermissions(owner).has('billing.manage'), true);
});
```

- [ ] **Step 2: Build the package so the entrypoint resolves**

Run: `cd packages/agent-os && npm run build`
Expected: `tsup` emits `dist/` with no errors.

- [ ] **Step 3: Run the full contract suite**

Run (repo root): `pnpm test:contracts:agent-os`
Expected: PASS, including the 2 new identity-contract tests (16 total: 14 prior + 2 new).

- [ ] **Step 4: Type-check the package**

Run: `cd packages/agent-os && npm run check-types`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add tests/contracts/agent-os/identity.contract.test.ts
git commit -m "test(contracts): agent-os identity contracts export + RBAC composition gate"
```

---

## Self-Review

- **Spec coverage:** Task 1 ⇒ canonical Organization/Membership/Seat + unified PlanTier with Membership.role bound to the one RBAC model (spec D5); Task 2 ⇒ contract-test gate proving the public export surface + RBAC composition. License/SsoConfig/ScimResource contracts and making `docker-backend/src/enterprise/organization.ts` compile as an adapter are deferred to P0c-2 (keeps this plan one additive, shippable unit).
- **Placeholder scan:** none — real code + exact commands.
- **Type consistency:** `PlanTier`/`PlanTierEnum`, `Membership.role: Role`, `membershipPermissions → Set<Permission>` consistent across resolver, tests, and contract test; `Seat.status` union matches `SeatStatus`.
- **No collision:** agent-os has no existing `Organization` type (the existing one is in `docker-backend/src/enterprise/organization.ts`, a different package) — additive is safe.

## Follow-on (deferred)

- **P0c-2:** add `License`, `SsoConfig`, `ScimResource` canonical contracts; make `docker-backend/src/enterprise/organization.ts` (`Organization`, `OrganizationMember`, `OrganizationRole`, `subscriptionTier`) compile as an adapter over the agent-os canonical model — one adapter per PR, behind existing tests.
