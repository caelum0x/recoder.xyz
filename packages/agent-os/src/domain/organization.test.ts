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
