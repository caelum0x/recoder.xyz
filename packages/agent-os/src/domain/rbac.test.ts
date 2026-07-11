import assert from 'node:assert/strict';
import test from 'node:test';
import { principalCan, permissionsForRoles, ROLE_PERMISSIONS, RoleEnum } from './rbac';
import type { Principal } from './tenant-context';

function principal(scopes: string[]): Principal {
  return { principalId: 'u1', kind: 'user', orgId: 'org-1', scopes };
}

test('owner has every permission an admin has (superset)', () => {
  const owner = permissionsForRoles([RoleEnum.Owner]);
  for (const p of ROLE_PERMISSIONS[RoleEnum.Admin]) assert.equal(owner.has(p), true);
});

test('viewer cannot approve — deny by default', () => {
  const viewer = permissionsForRoles([RoleEnum.Viewer]);
  assert.equal(viewer.has('approval.decide'), false);
});

test('principalCan reads scopes directly (backend-decided)', () => {
  assert.equal(principalCan(principal(['approval.decide']), 'approval.decide'), true);
  assert.equal(principalCan(principal([]), 'approval.decide'), false);
});

test('an unknown permission is always denied', () => {
  const admin = permissionsForRoles([RoleEnum.Admin]);
  assert.equal(admin.has('nonexistent.permission' as never), false);
});
