import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClaimCoordinator, recoveryWindowFor } from '../../../src/dispatch/claim-coordinator';
import { makeClaim } from '../../fixtures/dispatch';

const coordinator = new ClaimCoordinator();
const RECOVERY_MS = 90_000;

test('buildClaim sets lease = now + leaseMs and status claimed', () => {
  const claim = coordinator.buildClaim({
    claimId: 'c1',
    taskId: 't1',
    spaceId: 's1',
    agentId: 'a',
    fenceToken: 5,
    idempotencyKey: 'k',
    now: '2026-06-27T00:00:00.000Z',
    leaseMs: 60_000,
  });
  assert.equal(claim.status, 'claimed');
  assert.equal(claim.leaseUntil, '2026-06-27T00:01:00.000Z');
  assert.equal(claim.fenceToken, 5);
});

test('a fresh claim inside the recovery window blocks a new claim', () => {
  const claim = makeClaim({ claimedAt: '2026-06-27T00:00:00.000Z' });
  // 30s after claim — inside the 90s window
  assert.equal(coordinator.blocksNewClaim(claim, '2026-06-27T00:00:30.000Z', RECOVERY_MS), true);
});

test('a claim past the recovery window blocks only while the lease is live', () => {
  const claim = makeClaim({
    claimedAt: '2026-06-27T00:00:00.000Z',
    leaseUntil: '2026-06-27T00:30:00.000Z',
  });
  // 2 min later: outside window, lease still live → still blocks
  assert.equal(coordinator.blocksNewClaim(claim, '2026-06-27T00:02:00.000Z', RECOVERY_MS), true);
});

test('an expired lease past the window no longer blocks (reclaimable)', () => {
  const claim = makeClaim({
    claimedAt: '2026-06-27T00:00:00.000Z',
    leaseUntil: '2026-06-27T00:30:00.000Z',
  });
  const later = '2026-06-27T01:00:00.000Z';
  assert.equal(coordinator.blocksNewClaim(claim, later, RECOVERY_MS), false);
  assert.equal(coordinator.isReclaimable(claim, later, RECOVERY_MS), true);
});

test('released or lost claims never block', () => {
  const released = makeClaim({ status: 'released' });
  const lost = makeClaim({ status: 'lost' });
  assert.equal(coordinator.blocksNewClaim(released, '2026-06-27T00:00:01.000Z', RECOVERY_MS), false);
  assert.equal(coordinator.blocksNewClaim(lost, '2026-06-27T00:00:01.000Z', RECOVERY_MS), false);
});

test('recoveryWindowFor computes recoverableUntil = claimedAt + windowMs', () => {
  const w = recoveryWindowFor(
    { claimId: 'c', taskId: 't', agentId: 'a', claimedAt: '2026-06-27T00:00:00.000Z' },
    RECOVERY_MS,
  );
  assert.equal(w.recoverableUntil, '2026-06-27T00:01:30.000Z');
});
