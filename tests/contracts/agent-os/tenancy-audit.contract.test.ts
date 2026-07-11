import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOCAL_TENANT,
  SYSTEM_PRINCIPAL,
  makeAuditEnvelope,
  permissionsForRoles,
  principalCan,
  resolveTenantContext,
  RoleEnum,
} from '@recoder/agent-os';

test('contract: enterprise core contracts are exported from the package entrypoint', () => {
  assert.equal(LOCAL_TENANT.orgId, 'local');
  assert.equal(SYSTEM_PRINCIPAL.kind, 'system');
  assert.equal(typeof resolveTenantContext, 'function');
  assert.equal(typeof principalCan, 'function');
});

test('contract: EMBEDDED resolution needs no org/SSO/DB and yields the local tenant', () => {
  assert.deepEqual(resolveTenantContext({ mode: 'embedded' }), LOCAL_TENANT);
});

test('contract: an owner role grants billing.manage; a viewer does not', () => {
  assert.equal(permissionsForRoles([RoleEnum.Owner]).has('billing.manage'), true);
  assert.equal(permissionsForRoles([RoleEnum.Viewer]).has('billing.manage'), false);
});

test('contract: an audit envelope is produced deterministically from tenant+principal', () => {
  const env = makeAuditEnvelope({
    tenant: LOCAL_TENANT, principal: SYSTEM_PRINCIPAL,
    action: 'run.start', targetId: 'r1', outcome: 'allowed', now: '2026-07-11T00:00:00.000Z',
  });
  assert.equal(env.orgId, 'local');
  assert.equal(env.recordedAt, '2026-07-11T00:00:00.000Z');
});
