import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createSeatService,
  createInMemoryOrgStore,
  createInMemorySeatStore,
  defaultSeatLimit,
  hasSeatHeadroom,
  type Organization,
} from '../../../src/channels/org/index';
import type { BillingPort } from '../../../src/ports/billing-port';
import type { Entitlement, Subject } from '../../../src/domain/entitlement';

function org(overrides: Partial<Organization> = {}): Organization {
  return {
    orgId: 'org_1',
    ownerUserId: 'user_owner',
    name: 'Acme',
    plan: 'enterprise',
    seatLimit: 2,
    createdAt: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

/** A billing port that returns a fixed grant set for the org subject. */
function fauxBilling(grants: Entitlement[], opts: { throwOnResolve?: boolean } = {}): BillingPort {
  return {
    async startCheckout() {
      throw new Error('not used');
    },
    async resolveEntitlements(subject: Subject) {
      if (opts.throwOnResolve) throw new Error('provider down');
      return grants.filter((g) => g.subjectId === subject.subjectId);
    },
    async getQuota(subject) {
      return { subjectId: subject.subjectId, kind: 'cli_request', limit: 0, remaining: 0, resetAt: 'x' };
    },
    async emitUsage() {},
    async validateLicenseKey() {
      return { valid: false };
    },
    async health() {
      return { status: 'ok', checkedAt: 'x' };
    },
  };
}

function makeService(o: Organization, grants: Entitlement[] = [], billingOpts = {}) {
  const orgs = createInMemoryOrgStore();
  const seats = createInMemorySeatStore();
  orgs.put(o);
  const service = createSeatService({ orgs, seats, billing: fauxBilling(grants, billingOpts) });
  return { service, orgs, seats };
}

test('defaultSeatLimit + hasSeatHeadroom encode the per-plan caps', () => {
  assert.equal(defaultSeatLimit('free'), 1);
  assert.equal(defaultSeatLimit('pro'), 5);
  assert.equal(defaultSeatLimit('enterprise'), 50);
  assert.equal(hasSeatHeadroom(2, 1, 1), true);
  assert.equal(hasSeatHeadroom(2, 2, 1), false);
  assert.equal(hasSeatHeadroom(0, 9999, 1), true); // 0 === unmetered
});

test('assignSeat binds a user and is idempotent', async () => {
  const { service } = makeService(org({ seatLimit: 3 }));
  const r1 = await service.assignSeat({ orgId: 'org_1', userId: 'u1', assignedBy: 'user_owner' });
  assert.equal(r1.ok, true);
  if (r1.ok) assert.equal(r1.value.status, 'active');

  // Re-assign the same user → same seat (no duplicate, no count increase).
  const r2 = await service.assignSeat({ orgId: 'org_1', userId: 'u1', assignedBy: 'user_owner' });
  assert.equal(r2.ok, true);
  if (r1.ok && r2.ok) assert.equal(r2.value.seatId, r1.value.seatId);
  assert.equal(service.activeSeatCount('org_1'), 1);
});

test('assignSeat enforces the seat limit (fail safe — never over-assign)', async () => {
  const { service } = makeService(org({ seatLimit: 2 }));
  assert.equal((await service.assignSeat({ orgId: 'org_1', userId: 'u1', assignedBy: 'o' })).ok, true);
  assert.equal((await service.assignSeat({ orgId: 'org_1', userId: 'u2', assignedBy: 'o' })).ok, true);

  const over = await service.assignSeat({ orgId: 'org_1', userId: 'u3', assignedBy: 'o' });
  assert.equal(over.ok, false);
  if (!over.ok) {
    assert.equal(over.error.code, 'entitlement_denied');
    assert.match(over.error.message, /seat limit reached/);
  }
  assert.equal(service.activeSeatCount('org_1'), 2);
});

test('revoking a seat frees a slot and denies later org entitlements for that user', async () => {
  const grants: Entitlement[] = [
    { subjectId: 'org_1', kind: 'feature_flag', key: 'priority_release_channel', plan: 'enterprise', granted: true },
  ];
  const { service } = makeService(org({ seatLimit: 1 }), grants);

  await service.assignSeat({ orgId: 'org_1', userId: 'u1', assignedBy: 'o' });
  // Seated user sees org grants.
  assert.equal((await service.orgEntitlements({ orgId: 'org_1', userId: 'u1' })).length, 1);

  // Limit is 1, so a second user is denied...
  assert.equal((await service.assignSeat({ orgId: 'org_1', userId: 'u2', assignedBy: 'o' })).ok, false);

  // ...until u1 is revoked, which frees the slot.
  const rev = await service.revokeSeat({ orgId: 'org_1', userId: 'u1', revokedBy: 'o' });
  assert.equal(rev.ok, true);
  if (rev.ok) assert.equal(rev.value.status, 'revoked');
  assert.equal(service.activeSeatCount('org_1'), 0);

  // A revoked user no longer sees org entitlements (deny by default).
  assert.equal((await service.orgEntitlements({ orgId: 'org_1', userId: 'u1' })).length, 0);

  // The freed slot can be re-assigned.
  assert.equal((await service.assignSeat({ orgId: 'org_1', userId: 'u2', assignedBy: 'o' })).ok, true);
});

test('orgEntitlements requires an active seat; revoked grant resolution fails safe to []', async () => {
  // Even with the billing provider DOWN, a seated user gets [] (deny), not a throw.
  const { service } = makeService(org({ seatLimit: 1 }), [], { throwOnResolve: true });
  await service.assignSeat({ orgId: 'org_1', userId: 'u1', assignedBy: 'o' });
  assert.deepEqual(await service.orgEntitlements({ orgId: 'org_1', userId: 'u1' }), []);

  // A user with no seat always gets [] without even calling billing.
  assert.deepEqual(await service.orgEntitlements({ orgId: 'org_1', userId: 'ghost' }), []);
});

test('unknown org denies assign + revoke', async () => {
  const { service } = makeService(org());
  const a = await service.assignSeat({ orgId: 'nope', userId: 'u1', assignedBy: 'o' });
  assert.equal(a.ok, false);
  if (!a.ok) assert.equal(a.error.code, 'invalid_input');

  const r = await service.revokeSeat({ orgId: 'nope', userId: 'u1', revokedBy: 'o' });
  assert.equal(r.ok, false);
});

test('listSeats returns active by default, all with includeRevoked', async () => {
  const { service } = makeService(org({ seatLimit: 5 }));
  await service.assignSeat({ orgId: 'org_1', userId: 'u1', assignedBy: 'o' });
  await service.assignSeat({ orgId: 'org_1', userId: 'u2', assignedBy: 'o' });
  await service.revokeSeat({ orgId: 'org_1', userId: 'u2', revokedBy: 'o' });

  assert.equal(service.listSeats('org_1').length, 1);
  assert.equal(service.listSeats('org_1', { includeRevoked: true }).length, 2);
});
