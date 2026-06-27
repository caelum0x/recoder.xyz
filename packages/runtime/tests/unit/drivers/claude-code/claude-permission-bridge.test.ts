import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClaudePermissionFlags } from '../../../../src/drivers/claude-code/claude-permission-bridge';

const base = { allowShell: true, allowNetwork: true, approvalMode: 'manual' as const };

test('manual approval maps to default permission mode', () => {
  const flags = buildClaudePermissionFlags({ policy: base });
  assert.equal(flags.permissionMode, 'default');
});

test('auto approval maps to acceptEdits, never bypassPermissions', () => {
  const flags = buildClaudePermissionFlags({ policy: { ...base, approvalMode: 'auto' } });
  assert.equal(flags.permissionMode, 'acceptEdits');
  assert.notEqual(flags.permissionMode, 'bypassPermissions');
});

test('disallowing shell adds Bash to disallowedTools', () => {
  const flags = buildClaudePermissionFlags({ policy: { ...base, allowShell: false } });
  assert.ok(flags.disallowedTools.includes('Bash'));
});

test('disallowing network adds WebFetch/WebSearch to disallowedTools', () => {
  const flags = buildClaudePermissionFlags({ policy: { ...base, allowNetwork: false } });
  assert.ok(flags.disallowedTools.includes('WebFetch'));
  assert.ok(flags.disallowedTools.includes('WebSearch'));
});

test('a fully-permitted policy disallows nothing', () => {
  const flags = buildClaudePermissionFlags({ policy: base });
  assert.equal(flags.disallowedTools.length, 0);
});

test('forbiddenActions tool tokens flow into disallowedTools', () => {
  const flags = buildClaudePermissionFlags({
    policy: base,
    forbiddenActions: ['tool:NotebookEdit', 'no_force_push', 'disallow:WebSearch'],
  });
  assert.ok(flags.disallowedTools.includes('NotebookEdit'));
  assert.ok(flags.disallowedTools.includes('WebSearch'));
});
