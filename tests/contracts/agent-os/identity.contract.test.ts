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
