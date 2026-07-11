import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTenantContext } from './resolve-tenant-context';
import { LOCAL_TENANT } from './tenant-context';

test('embedded mode with no claims resolves to LOCAL_TENANT', () => {
  assert.deepEqual(resolveTenantContext({ mode: 'embedded' }), LOCAL_TENANT);
});

test('self-host mode with valid claims resolves the tenant', () => {
  const ctx = resolveTenantContext({ mode: 'self_host', orgId: 'org-9', tenantId: 't-9' });
  assert.equal(ctx.orgId, 'org-9');
  assert.equal(ctx.tenantId, 't-9');
});

test('self-host mode WITHOUT an orgId throws (never silently falls back to local)', () => {
  assert.throws(() => resolveTenantContext({ mode: 'self_host' }), /orgId is required/);
});
