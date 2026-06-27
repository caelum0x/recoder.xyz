import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkRunWithoutClaim } from '../../../../src/coherence/checks/run-without-claim';
import { claim, run, snapshot } from '../fixtures';

test('escalates a live run with no backing claim', () => {
  const findings = checkRunWithoutClaim(snapshot({ runs: [run({ alive: true })], claims: [] }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].driftKind, 'run_without_claim');
  assert.equal(findings[0].disposition, 'escalate');
  assert.equal(findings[0].severity, 'high');
  assert.match(findings[0].evidence, /no fence token/);
});

test('does not escalate when a live claim backs the run', () => {
  const findings = checkRunWithoutClaim(
    snapshot({ runs: [run({ alive: true })], claims: [claim()] }),
  );
  assert.deepEqual(findings, []);
});

test('ignores dead runs', () => {
  const findings = checkRunWithoutClaim(
    snapshot({ runs: [run({ alive: false })], claims: [] }),
  );
  assert.deepEqual(findings, []);
});
