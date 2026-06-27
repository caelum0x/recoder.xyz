import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLeaderGate, leaderIsMember } from '../../../src/dispatch/squad-leader-policy';
import type { Squad } from '../../../src/domain';

const NOW = '2026-06-27T00:00:00.000Z';

function squad(leaderId?: string): Squad {
  return {
    id: 'sq',
    name: 'S',
    ownerId: 'o',
    leaderId,
    members: leaderId
      ? [{ id: leaderId, kind: 'agent', role: 'leader', addedAt: NOW }]
      : [],
    activity: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

test('no leader → no review required', () => {
  assert.deepEqual(evaluateLeaderGate(squad(), false), { kind: 'no_review_required' });
});

test('leader + no prior eval → requires leader review', () => {
  const verdict = evaluateLeaderGate(squad('L'), false);
  assert.equal(verdict.kind, 'requires_leader_review');
  assert.equal(verdict.kind === 'requires_leader_review' && verdict.leaderId, 'L');
});

test('leader + prior no-action eval → no_action', () => {
  const verdict = evaluateLeaderGate(squad('L'), true);
  assert.equal(verdict.kind, 'no_action');
});

test('leaderIsMember reflects membership', () => {
  assert.equal(leaderIsMember(squad('L')), true);
  assert.equal(leaderIsMember(squad()), false);
});
