import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDispatch } from '../../../src/dispatch/dispatch-planner';
import { DependencyBlockedError } from '../../../src/errors/dependency-blocked-error';
import { ClaimConflictError } from '../../../src/errors/claim-conflict-error';
import type { DependencyEdge, TaskNode } from '../../../src/domain';
import { makeAgent, makeTask, makeClaim } from '../../fixtures/dispatch';

const NOW = '2026-06-27T00:00:00.000Z';

function baseInput() {
  return {
    routing: { task: makeTask(), agents: [makeAgent({ agentId: 'a' })] },
    dependencyEdges: [] as DependencyEdge[],
    upstreamStates: [] as TaskNode[],
    maxConcurrency: 3,
    claimId: 'claim-1',
    fenceToken: 1,
    idempotencyKey: 'idem-1',
    now: NOW,
    leaseMs: 1_800_000,
    recoveryWindowMs: 90_000,
  };
}

test('happy path: dependency-met, unclaimed → claim + lock reservation + effects', () => {
  const decision = planDispatch(baseInput());
  assert.equal(decision.route.selectedAgentId, 'a');
  assert.equal(decision.claim.agentId, 'a');
  assert.ok(decision.locks.length >= 1);
  assert.equal(decision.locks[0].kind, 'exclusive');
  // CommitClaim + NotifyAgent effects
  assert.ok(decision.effects.some((e) => e.type === 'CommitClaim'));
  assert.ok(decision.effects.some((e) => e.type === 'NotifyAgent'));
});

test('throws DependencyBlockedError when an upstream is not terminal', () => {
  const input = {
    ...baseInput(),
    dependencyEdges: [{ taskId: 'task-1', dependsOnTaskId: 'up', kind: 'blocks' }] as DependencyEdge[],
    upstreamStates: [{ taskId: 'up', spaceId: 'space-1', state: 'running' }] as TaskNode[],
  };
  assert.throws(() => planDispatch(input), DependencyBlockedError);
});

test('throws ClaimConflictError when the task already has a live claim', () => {
  const input = {
    ...baseInput(),
    existingClaim: makeClaim({ agentId: 'agent-z', claimId: 'c-z', claimedAt: NOW }),
  };
  assert.throws(() => planDispatch(input), ClaimConflictError);
});

test('blocked route returns a decision with no claim/locks, no effects', () => {
  const input = {
    ...baseInput(),
    routing: {
      task: makeTask({ intent: 'visual' }),
      agents: [makeAgent({ supportedIntents: ['feature'] })],
    },
  };
  const decision = planDispatch(input);
  assert.equal(decision.route.blocked, true);
  assert.deepEqual(decision.locks, []);
  assert.deepEqual(decision.effects, []);
});

test('dry-run computes the decision but emits no commit effects', () => {
  const decision = planDispatch({ ...baseInput(), dryRun: true });
  assert.equal(decision.route.selectedAgentId, 'a');
  assert.deepEqual(decision.effects, []);
});
