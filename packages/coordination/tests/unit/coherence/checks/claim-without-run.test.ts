import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkClaimWithoutRun } from '../../../../src/coherence/checks/claim-without-run';
import { claim, minutesAgo, run, snapshot } from '../fixtures';

test('does NOT flag a claim still inside the recovery window (multica guard)', () => {
  // claimed 30s ago, window is 90s → still protected.
  const findings = checkClaimWithoutRun(
    snapshot({ claims: [claim({ claimedAt: minutesAgo(0.5), runId: undefined })], runs: [] }),
  );
  assert.deepEqual(findings, [], 'in-flight start must not be reclaimed within recovery window');
});

test('flags a claim with no live run once the recovery window elapses', () => {
  const findings = checkClaimWithoutRun(
    snapshot({ claims: [claim({ claimedAt: minutesAgo(5), runId: undefined })], runs: [] }),
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].driftKind, 'claim_without_run');
  assert.equal(findings[0].disposition, 'escalate');
  assert.equal(findings[0].claimId, 'claim_1');
});

test('does not flag a claim that has a live run', () => {
  const findings = checkClaimWithoutRun(
    snapshot({ claims: [claim({ claimedAt: minutesAgo(5) })], runs: [run({ alive: true })] }),
  );
  assert.deepEqual(findings, []);
});

test('ignores released/lost claims', () => {
  const findings = checkClaimWithoutRun(
    snapshot({ claims: [claim({ status: 'released', claimedAt: minutesAgo(5) })], runs: [] }),
  );
  assert.deepEqual(findings, []);
});
