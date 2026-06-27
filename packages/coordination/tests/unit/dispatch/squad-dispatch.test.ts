import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSquadDispatch, selectMember } from '../../../src/dispatch/squad-dispatch';
import type { Squad } from '../../../src/domain';

function makeSquad(overrides: Partial<Squad> = {}): Squad {
  return {
    id: 'sq-1',
    name: 'Squad One',
    ownerId: 'owner',
    members: [
      { id: 'leader-1', kind: 'agent', role: 'leader', addedAt: '2026-06-27T00:00:00.000Z' },
      { id: 'member-1', kind: 'agent', role: 'member', addedAt: '2026-06-27T00:00:00.000Z' },
    ],
    leaderId: 'leader-1',
    activity: [],
    createdAt: '2026-06-27T00:00:00.000Z',
    updatedAt: '2026-06-27T00:00:00.000Z',
    ...overrides,
  };
}

const NOW = '2026-06-27T00:00:00.000Z';

test('a squad with a leader requires leader review on first consideration', () => {
  const assignment = resolveSquadDispatch({
    squad: makeSquad(),
    taskId: 't1',
    spaceId: 's1',
    hasPriorNoActionEval: false,
    now: NOW,
  });
  assert.equal(assignment.status, 'pending_leader_review');
  assert.equal(assignment.leaderId, 'leader-1');
});

test('a prior no-action evaluation yields no_action (do not re-engage)', () => {
  const assignment = resolveSquadDispatch({
    squad: makeSquad(),
    taskId: 't1',
    spaceId: 's1',
    hasPriorNoActionEval: true,
    now: NOW,
  });
  assert.equal(assignment.status, 'no_action');
});

test('a leaderless squad assigns a member directly', () => {
  const assignment = resolveSquadDispatch({
    squad: makeSquad({ leaderId: undefined }),
    taskId: 't1',
    spaceId: 's1',
    hasPriorNoActionEval: false,
    now: NOW,
  });
  assert.equal(assignment.status, 'assigned');
  assert.equal(assignment.memberId, 'member-1');
});

test('selectMember prefers a project-scoped member', () => {
  const squad = makeSquad({
    leaderId: undefined,
    members: [
      { id: 'm-x', kind: 'agent', role: 'member', addedAt: NOW },
      { id: 'm-y', kind: 'agent', role: 'member', projectId: 'proj-1', addedAt: NOW },
    ],
  });
  assert.equal(selectMember(squad, 'proj-1')?.id, 'm-y');
});

test('selectMember excludes the leader when no project scope matches', () => {
  const squad = makeSquad();
  assert.equal(selectMember(squad)?.id, 'member-1');
});

test('a squad with no engageable member is rejected', () => {
  const assignment = resolveSquadDispatch({
    squad: makeSquad({ leaderId: undefined, members: [] }),
    taskId: 't1',
    spaceId: 's1',
    hasPriorNoActionEval: false,
    now: NOW,
  });
  assert.equal(assignment.status, 'rejected');
});
