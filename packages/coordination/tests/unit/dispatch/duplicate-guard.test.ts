import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDuplicate } from '../../../src/dispatch/duplicate-guard';
import { makeClaim } from '../../fixtures/dispatch';

const RECOVERY_MS = 90_000;

test('no existing claim → not a duplicate', () => {
  assert.deepEqual(checkDuplicate(undefined, '2026-06-27T00:00:00.000Z', RECOVERY_MS), {
    duplicate: false,
  });
});

test('a live claim is a duplicate and names the holder', () => {
  const claim = makeClaim({ agentId: 'agent-b', claimId: 'c-99' });
  const verdict = checkDuplicate(claim, '2026-06-27T00:00:30.000Z', RECOVERY_MS);
  assert.deepEqual(verdict, {
    duplicate: true,
    heldByAgentId: 'agent-b',
    existingClaimId: 'c-99',
  });
});

test('a fully-reclaimable (expired, past-window) claim is not a duplicate', () => {
  const claim = makeClaim({
    claimedAt: '2026-06-27T00:00:00.000Z',
    leaseUntil: '2026-06-27T00:30:00.000Z',
  });
  assert.deepEqual(checkDuplicate(claim, '2026-06-27T01:00:00.000Z', RECOVERY_MS), {
    duplicate: false,
  });
});

test('a released claim is not a duplicate (retry can re-dispatch)', () => {
  const claim = makeClaim({ status: 'released' });
  assert.deepEqual(checkDuplicate(claim, '2026-06-27T00:00:01.000Z', RECOVERY_MS), {
    duplicate: false,
  });
});
