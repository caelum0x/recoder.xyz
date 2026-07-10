import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOCAL_TENANT,
  SYSTEM_PRINCIPAL,
  isLocalTenant,
  withResidency,
  type TenantContext,
} from './tenant-context';

test('LOCAL_TENANT is the embedded single-tenant sentinel', () => {
  assert.equal(LOCAL_TENANT.tenantId, 'local');
  assert.equal(LOCAL_TENANT.orgId, 'local');
  assert.equal(isLocalTenant(LOCAL_TENANT), true);
});

test('SYSTEM_PRINCIPAL is the internal actor', () => {
  assert.equal(SYSTEM_PRINCIPAL.kind, 'system');
  assert.equal(SYSTEM_PRINCIPAL.principalId, 'system');
});

test('a hosted tenant context is not the local sentinel', () => {
  const ctx: TenantContext = { tenantId: 't1', orgId: 'org-1' };
  assert.equal(isLocalTenant(ctx), false);
});

test('withResidency returns a new context, never mutates', () => {
  const ctx: TenantContext = { tenantId: 't1', orgId: 'org-1' };
  const pinned = withResidency(ctx, 'eu-central-1');
  assert.equal(pinned.residencyRegion, 'eu-central-1');
  assert.equal(ctx.residencyRegion, undefined);
});
