import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildOpenCodeRunArgs } from '../../../../src/drivers/opencode/opencode-args';

const basePolicy = { allowNetwork: true, approvalMode: 'manual' as const };

test('builds a deterministic non-interactive json run', () => {
  const args = buildOpenCodeRunArgs({ policy: basePolicy });
  assert.deepEqual(args, ['run', '--format', 'json']);
});

test('layers model / agent / variant flags in order', () => {
  const args = buildOpenCodeRunArgs({
    model: 'anthropic/claude-opus',
    agent: 'build',
    variant: 'high',
    policy: basePolicy,
  });
  assert.deepEqual(args, [
    'run',
    '--format',
    'json',
    '--model',
    'anthropic/claude-opus',
    '--agent',
    'build',
    '--variant',
    'high',
  ]);
});

test('adds --dangerously-skip-permissions ONLY in auto approval mode', () => {
  const auto = buildOpenCodeRunArgs({ policy: { allowNetwork: true, approvalMode: 'auto' } });
  assert.equal(auto.includes('--dangerously-skip-permissions'), true);

  const manual = buildOpenCodeRunArgs({ policy: { allowNetwork: true, approvalMode: 'manual' } });
  assert.equal(manual.includes('--dangerously-skip-permissions'), false);

  const policyMode = buildOpenCodeRunArgs({ policy: { allowNetwork: true, approvalMode: 'policy' } });
  assert.equal(policyMode.includes('--dangerously-skip-permissions'), false);
});

test('session continuation flags', () => {
  const cont = buildOpenCodeRunArgs({ continueSession: true, policy: basePolicy });
  assert.equal(cont.includes('--continue'), true);

  const sess = buildOpenCodeRunArgs({ sessionId: 'ses_abc', policy: basePolicy });
  assert.deepEqual(sess.slice(-2), ['--session', 'ses_abc']);
});
