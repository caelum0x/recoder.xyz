import assert from 'node:assert/strict';
import test from 'node:test';
import { makeAuditEnvelope, withAudit } from './audit-envelope';
import { LOCAL_TENANT, SYSTEM_PRINCIPAL } from './tenant-context';

test('makeAuditEnvelope captures actor, tenant, action and target', () => {
  const env = makeAuditEnvelope({
    tenant: LOCAL_TENANT,
    principal: SYSTEM_PRINCIPAL,
    action: 'workspace.transition',
    targetId: 'ws-1',
    now: '2026-07-11T00:00:00.000Z',
    outcome: 'allowed',
  });
  assert.equal(env.action, 'workspace.transition');
  assert.equal(env.targetId, 'ws-1');
  assert.equal(env.orgId, 'local');
  assert.equal(env.principalId, 'system');
  assert.equal(env.outcome, 'allowed');
  assert.equal(env.recordedAt, '2026-07-11T00:00:00.000Z');
});

test('withAudit pairs a new state with its envelope', () => {
  const env = makeAuditEnvelope({
    tenant: LOCAL_TENANT, principal: SYSTEM_PRINCIPAL,
    action: 'x', targetId: 't', now: '2026-07-11T00:00:00.000Z', outcome: 'allowed',
  });
  const result = withAudit({ id: 't', state: 'ready' }, env);
  assert.deepEqual(result.next, { id: 't', state: 'ready' });
  assert.equal(result.audit, env);
});
