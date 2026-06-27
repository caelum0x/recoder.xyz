import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkOrphanHandoff } from '../../../../src/coherence/checks/orphan-handoff';
import { handoff, presence, snapshot } from '../fixtures';

test('escalates a handoff whose target agent is absent from presence', () => {
  const findings = checkOrphanHandoff(snapshot({ handoffs: [handoff()], presence: [] }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].driftKind, 'orphan_handoff');
  assert.equal(findings[0].disposition, 'escalate');
  assert.match(findings[0].evidence, /not present/);
});

test('escalates a handoff whose target is offline', () => {
  const findings = checkOrphanHandoff(
    snapshot({
      handoffs: [handoff()],
      presence: [presence({ agentId: 'agent_2', status: 'offline' })],
    }),
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0].evidence, /offline agent/);
});

test('does not escalate when the target is online', () => {
  const findings = checkOrphanHandoff(
    snapshot({
      handoffs: [handoff()],
      presence: [presence({ agentId: 'agent_2', status: 'online' })],
    }),
  );
  assert.deepEqual(findings, []);
});

test('ignores terminal handoffs', () => {
  const findings = checkOrphanHandoff(
    snapshot({ handoffs: [handoff({ status: 'completed' })], presence: [] }),
  );
  assert.deepEqual(findings, []);
});
