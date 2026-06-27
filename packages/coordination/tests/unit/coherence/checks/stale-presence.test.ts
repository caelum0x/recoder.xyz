import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkStalePresence } from '../../../../src/coherence/checks/stale-presence';
import { minutesAgo, presence, snapshot } from '../fixtures';

test('flags a busy agent whose heartbeat is older than the timeout (heal: mark offline)', () => {
  // heartbeat timeout is 5min; lastSeen 10min ago → stale.
  const findings = checkStalePresence(
    snapshot({ presence: [presence({ lastSeen: minutesAgo(10) })] }),
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].driftKind, 'stale_presence');
  assert.equal(findings[0].disposition, 'heal');
  assert.equal(findings[0].agentId, 'agent_1');
});

test('does not flag a fresh heartbeat', () => {
  const findings = checkStalePresence(
    snapshot({ presence: [presence({ lastSeen: minutesAgo(1) })] }),
  );
  assert.deepEqual(findings, []);
});

test('skips already-offline agents (no churn)', () => {
  const findings = checkStalePresence(
    snapshot({ presence: [presence({ status: 'offline', lastSeen: minutesAgo(60) })] }),
  );
  assert.deepEqual(findings, []);
});
