import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkDuplicateClaim } from '../../../../src/coherence/checks/duplicate-claim';
import { claim, snapshot } from '../fixtures';

test('keeps the highest-fence claim and signals every loser', () => {
  const findings = checkDuplicateClaim(
    snapshot({
      claims: [
        claim({ claimId: 'claim_a', agentId: 'agent_a', fenceToken: 2 }),
        claim({ claimId: 'claim_b', agentId: 'agent_b', fenceToken: 5 }),
        claim({ claimId: 'claim_c', agentId: 'agent_c', fenceToken: 3 }),
      ],
    }),
  );
  // 3 claims → 2 losers (b is the winner with fence 5).
  assert.equal(findings.length, 2);
  const loserIds = findings.map((f) => f.claimId).sort();
  assert.deepEqual(loserIds, ['claim_a', 'claim_c']);
  for (const finding of findings) {
    assert.equal(finding.driftKind, 'duplicate_claim');
    assert.equal(finding.disposition, 'escalate');
    assert.match(finding.evidence, /winner claim_b/);
  }
});

test('no finding when only one live claim exists', () => {
  const findings = checkDuplicateClaim(snapshot({ claims: [claim()] }));
  assert.deepEqual(findings, []);
});

test('released claims do not count toward duplicates', () => {
  const findings = checkDuplicateClaim(
    snapshot({
      claims: [
        claim({ claimId: 'claim_a', fenceToken: 1 }),
        claim({ claimId: 'claim_b', fenceToken: 2, status: 'released' }),
      ],
    }),
  );
  assert.deepEqual(findings, []);
});
