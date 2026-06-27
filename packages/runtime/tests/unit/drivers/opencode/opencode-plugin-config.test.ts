import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  resolveOpenCodeConfig,
} from '../../../../src/drivers/opencode/opencode-plugin-config';
import {
  viewOpenCodeTool,
  viewOpenCodeTools,
} from '../../../../src/drivers/opencode/opencode-tools-bridge';

const open = { allowShell: true, allowNetwork: true };

test('resolveOpenCodeConfig passes through model/agent/variant + dedupes lists', () => {
  const cfg = resolveOpenCodeConfig(
    {
      model: 'anthropic/x',
      agent: 'build',
      variant: 'high',
      disabledTools: ['foo', 'foo'],
      disabledMcps: ['m1'],
      mcpEnvAllowlist: ['A', 'A', 'B'],
    },
    open,
  );
  assert.equal(cfg.model, 'anthropic/x');
  assert.equal(cfg.agent, 'build');
  assert.equal(cfg.variant, 'high');
  assert.deepEqual(cfg.disabledTools, ['foo']);
  assert.deepEqual(cfg.disabledMcps, ['m1']);
  assert.deepEqual(cfg.mcpEnvAllowlist, ['A', 'B']);
});

test('policy.allowShell:false additively denies shell-bearing tools', () => {
  const cfg = resolveOpenCodeConfig(undefined, { allowShell: false, allowNetwork: true });
  assert.equal(cfg.disabledTools.includes('bash'), true);
  assert.equal(cfg.disabledTools.includes('task'), true);
  assert.equal(cfg.disabledTools.includes('webfetch'), false);
});

test('policy.allowNetwork:false additively denies network tools', () => {
  const cfg = resolveOpenCodeConfig(undefined, { allowShell: true, allowNetwork: false });
  assert.equal(cfg.disabledTools.includes('webfetch'), true);
  assert.equal(cfg.disabledTools.includes('bash'), false);
});

test('a driver can never re-enable a policy-denied tool', () => {
  // Even if overrides do NOT list bash, policy denies it; result still denies bash.
  const cfg = resolveOpenCodeConfig({ disabledTools: [] }, { allowShell: false, allowNetwork: true });
  assert.equal(cfg.disabledTools.includes('bash'), true);
});

test('viewOpenCodeTool flags denied tools truthfully', () => {
  const denied = viewOpenCodeTool('bash', ['bash']);
  assert.equal(denied.allowed, false);
  assert.match(denied.deniedReason ?? '', /deny-list/);

  const allowed = viewOpenCodeTool('read', ['bash']);
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.deniedReason, undefined);
  assert.deepEqual(allowed.modes, ['read']);
});

test('viewOpenCodeTools classifies a batch', () => {
  const views = viewOpenCodeTools(['read', 'bash'], ['bash']);
  assert.equal(views.length, 2);
  assert.equal(views[1]?.allowed, false);
});
