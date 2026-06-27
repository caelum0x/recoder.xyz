import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../../../src/dispatch/routing-service';
import { makeAgent, makeTask, makeSpace } from '../../fixtures/dispatch';

test('selects the single eligible agent and is not blocked', () => {
  const decision = route({
    task: makeTask(),
    agents: [makeAgent({ agentId: 'a' })],
  });
  assert.equal(decision.blocked, false);
  assert.equal(decision.selectedAgentId, 'a');
  assert.equal(decision.candidates[0].eligible, true);
});

test('requested assignee wins the +50 boost and is ranked first', () => {
  const decision = route({
    task: makeTask(),
    agents: [makeAgent({ agentId: 'a' }), makeAgent({ agentId: 'b' })],
    requestedAssigneeAgentId: 'b',
  });
  assert.equal(decision.selectedAgentId, 'b');
  // a is ineligible because it is not the requested assignee
  const a = decision.candidates.find((c) => c.agentId === 'a');
  assert.equal(a?.eligible, false);
});

test('unsupported intent disqualifies the agent', () => {
  const decision = route({
    task: makeTask({ intent: 'visual' }),
    agents: [makeAgent({ supportedIntents: ['feature'] })],
  });
  assert.equal(decision.blocked, true);
  assert.equal(decision.selectedAgentId, undefined);
  assert.ok(decision.candidates[0].reasons.some((r) => r.includes('unsupported intent')));
});

test('git-write task is blocked when agent lacks allowGitWrite', () => {
  const decision = route({
    task: makeTask({ branchPolicy: 'feature_branch', intent: 'feature' }),
    agents: [
      makeAgent({ permissions: { allowGitWrite: false, allowNetwork: true, allowShell: true } }),
    ],
  });
  assert.equal(decision.blocked, true);
  assert.ok(decision.candidates[0].reasons.some((r) => r.includes('git write')));
});

test('space forbidden-path finding blocks the route for all candidates', () => {
  const decision = route({
    task: makeTask({ targetPaths: ['infra/secrets.ts'] }),
    agents: [makeAgent()],
    space: makeSpace({ forbiddenPaths: ['infra/**'] }),
  });
  assert.equal(decision.blocked, true);
  assert.ok(decision.policyFindings.length > 0);
  assert.equal(decision.candidates[0].eligible, false);
});

test('offline presence excludes an otherwise-healthy agent', () => {
  const decision = route(
    { task: makeTask(), agents: [makeAgent({ agentId: 'a', health: 'healthy' })] },
    { presenceByAgentId: { a: 'offline' } },
  );
  assert.equal(decision.blocked, true);
  assert.ok(decision.candidates[0].reasons.some((r) => r.includes('offline')));
});

test('space mismatch disqualifies candidates', () => {
  const decision = route({
    task: makeTask({ spaceId: 'space-1' }),
    agents: [makeAgent()],
    space: makeSpace({ spaceId: 'space-other' }),
  });
  assert.equal(decision.blocked, true);
  assert.ok(decision.candidates[0].reasons.some((r) => r.includes('space mismatch')));
});
