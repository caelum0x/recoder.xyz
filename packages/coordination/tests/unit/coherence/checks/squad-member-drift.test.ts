import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkSquadMemberDrift } from '../../../../src/coherence/checks/squad-member-drift';
import { claim, snapshot, squadMember } from '../fixtures';

test('escalates when the squad believes a member busy but it holds no claim', () => {
  const findings = checkSquadMemberDrift(
    snapshot({ squadMembers: [squadMember()], claims: [] }),
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].driftKind, 'squad_member_drift');
  assert.equal(findings[0].disposition, 'escalate');
  assert.equal(findings[0].squadId, 'squad_1');
  assert.equal(findings[0].agentId, 'agent_1');
});

test('no drift when the member actually holds the believed task claim', () => {
  const findings = checkSquadMemberDrift(
    snapshot({
      squadMembers: [squadMember({ believedTaskId: 'task_1' })],
      claims: [claim({ agentId: 'agent_1', taskId: 'task_1' })],
    }),
  );
  assert.deepEqual(findings, []);
});

test('drift when the member is busy on a DIFFERENT task than believed', () => {
  const findings = checkSquadMemberDrift(
    snapshot({
      squadMembers: [squadMember({ believedTaskId: 'task_1' })],
      claims: [claim({ agentId: 'agent_1', taskId: 'task_other' })],
    }),
  );
  assert.equal(findings.length, 1);
});

test('no drift when the squad believes the member is idle', () => {
  const findings = checkSquadMemberDrift(
    snapshot({ squadMembers: [squadMember({ believedBusy: false })], claims: [] }),
  );
  assert.deepEqual(findings, []);
});
