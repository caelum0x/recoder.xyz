import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCodexArgs,
  sandboxModeFromPolicy,
  approvalPolicyFromPolicy,
} from '../../../../src/drivers/codex/codex-args';
import type { RuntimePolicy } from '@recoder/agent-runtimes';

const basePolicy: RuntimePolicy = {
  requireSignedEnvelope: false,
  enforceWorkLocks: false,
  allowNetwork: true,
  allowShell: true,
  approvalMode: 'auto',
};

test('builds exec --json with model and cwd', () => {
  const args = buildCodexArgs({
    prompt: 'do the thing',
    policy: basePolicy,
    cwd: '/work',
    model: 'gpt-5.4',
  });
  assert.deepEqual(args.slice(0, 2), ['exec', '--json']);
  assert.ok(args.includes('--model'));
  assert.equal(args[args.indexOf('--model') + 1], 'gpt-5.4');
  assert.ok(args.includes('--cd'));
  assert.equal(args[args.indexOf('--cd') + 1], '/work');
  // Prompt is the final positional argument.
  assert.equal(args[args.length - 1], 'do the thing');
});

test('no-shell policy maps to read-only sandbox (fail-safe)', () => {
  const policy: RuntimePolicy = { ...basePolicy, allowShell: false };
  assert.equal(sandboxModeFromPolicy(policy), 'read-only');
  const args = buildCodexArgs({ prompt: 'p', policy });
  assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
});

test('shell-allowed policy maps to workspace-write sandbox', () => {
  assert.equal(sandboxModeFromPolicy(basePolicy), 'workspace-write');
});

test('network-denied policy asserts sandbox network_access=false', () => {
  const policy: RuntimePolicy = { ...basePolicy, allowNetwork: false };
  const args = buildCodexArgs({ prompt: 'p', policy });
  assert.ok(args.includes('sandbox_workspace_write.network_access=false'));
});

test('network-allowed policy does NOT inject a network override', () => {
  const args = buildCodexArgs({ prompt: 'p', policy: basePolicy });
  assert.ok(!args.includes('sandbox_workspace_write.network_access=false'));
});

test('approvalMode maps to codex approval policy', () => {
  assert.equal(approvalPolicyFromPolicy({ ...basePolicy, approvalMode: 'manual' }), 'on-request');
  assert.equal(approvalPolicyFromPolicy({ ...basePolicy, approvalMode: 'policy' }), 'on-failure');
  assert.equal(approvalPolicyFromPolicy({ ...basePolicy, approvalMode: 'auto' }), 'never');
});

test('passes a manual approval policy through to -c approval_policy', () => {
  const args = buildCodexArgs({ prompt: 'p', policy: { ...basePolicy, approvalMode: 'manual' } });
  assert.ok(args.includes('approval_policy="on-request"'));
});
