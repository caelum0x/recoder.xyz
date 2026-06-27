import { test } from 'node:test';
import assert from 'node:assert/strict';
import { permissionReasons } from '../../../src/dispatch/permission-filter';
import { makeTask } from '../../fixtures/dispatch';

const ALLOW_ALL = { allowGitWrite: true, allowNetwork: true, allowShell: true };

test('write-expecting task blocked when git write disallowed', () => {
  const reasons = permissionReasons(makeTask({ intent: 'feature' }), {
    ...ALLOW_ALL,
    allowGitWrite: false,
  });
  assert.deepEqual(reasons, ['git write is not allowed by agent policy']);
});

test('code_review task does not require git write', () => {
  const reasons = permissionReasons(makeTask({ intent: 'code_review' }), {
    ...ALLOW_ALL,
    allowGitWrite: false,
  });
  assert.deepEqual(reasons, []);
});

test('no_git_write branch policy does not require git write', () => {
  const reasons = permissionReasons(
    makeTask({ intent: 'feature', branchPolicy: 'no_git_write' }),
    { ...ALLOW_ALL, allowGitWrite: false },
  );
  assert.deepEqual(reasons, []);
});

test('requiresNetwork metadata blocked when network disallowed', () => {
  const reasons = permissionReasons(
    makeTask({ metadata: { requiresNetwork: true } }),
    { ...ALLOW_ALL, allowNetwork: false },
  );
  assert.ok(reasons.includes('network is not allowed by agent policy'));
});

test('requiresShell metadata blocked when shell disallowed', () => {
  const reasons = permissionReasons(
    makeTask({ metadata: { requiresShell: true } }),
    { ...ALLOW_ALL, allowShell: false },
  );
  assert.ok(reasons.includes('shell is not allowed by agent policy'));
});
