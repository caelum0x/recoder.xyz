import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePiModel } from '../../../../src/drivers/pi/pi-model-resolver';
import { buildPiArgs, resolvePiPrompt } from '../../../../src/drivers/pi/pi-session-host';
import type { RuntimeTaskInput, RuntimePolicy } from '@recoder/agent-runtimes';

function makeInput(overrides: Partial<RuntimeTaskInput['task']['metadata']> = {}, prompt = 'Do the work'): RuntimeTaskInput {
  return {
    policy: makePolicy(),
    task: {
      taskId: 't1',
      title: 'demo',
      intent: 'feature_delivery',
      goal: 'goal fallback',
      spaceId: 's1',
      targetPaths: [],
      forbiddenPaths: [],
      acceptanceCriteria: [],
      verification: { commands: [] },
      approvalRequired: [],
      artifactRequired: [],
      metadata: overrides as Record<string, unknown>,
    },
    bundle: {
      bundleId: 'b1',
      agentId: 'a1',
      taskId: 't1',
      renderedPrompt: prompt,
      sourceRefs: [],
    } as unknown as RuntimeTaskInput['bundle'],
  };
}

function makePolicy(overrides: Partial<RuntimePolicy> = {}): RuntimePolicy {
  return {
    requireSignedEnvelope: false,
    enforceWorkLocks: false,
    allowNetwork: true,
    allowShell: true,
    approvalMode: 'policy',
    ...overrides,
  };
}

test('resolvePiModel reads pinned provider/model from task runtime metadata', () => {
  const input = makeInput({ runtime: { pi: { provider: 'anthropic', model: 'claude-x' } } });
  const sel = resolvePiModel(input, {});
  assert.equal(sel.provider, 'anthropic');
  assert.equal(sel.model, 'claude-x');
});

test('resolvePiModel falls back to PI_PROVIDER/PI_MODEL env', () => {
  const input = makeInput({});
  const sel = resolvePiModel(input, { PI_PROVIDER: 'openai', PI_MODEL: 'gpt-x' });
  assert.equal(sel.provider, 'openai');
  assert.equal(sel.model, 'gpt-x');
});

test('resolvePiModel surfaces a BYOK key only when provider+model are pinned', () => {
  const pinned = makeInput({ runtime: { pi: { provider: 'anthropic', model: 'claude-x' } } });
  assert.equal(resolvePiModel(pinned, { ANTHROPIC_API_KEY: 'sk-test' }).apiKey, 'sk-test');

  const unpinned = makeInput({});
  assert.equal(resolvePiModel(unpinned, { ANTHROPIC_API_KEY: 'sk-test' }).apiKey, undefined);
});

test('buildPiArgs (json) puts the prompt behind -p and sets --mode json --no-extensions', () => {
  const input = makeInput({ runtime: { pi: { provider: 'anthropic', model: 'claude-x' } } });
  const { args, prompt } = buildPiArgs('json', input, {});
  assert.equal(prompt, 'Do the work');
  assert.deepEqual(args, [
    '--mode',
    'json',
    '--no-extensions',
    '--provider',
    'anthropic',
    '--model',
    'claude-x',
    '-p',
    'Do the work',
  ]);
});

test('buildPiArgs (rpc) omits the -p positional (prompt is streamed over RPC)', () => {
  const input = makeInput({});
  const { args } = buildPiArgs('rpc', input, {});
  assert.deepEqual(args, ['--mode', 'rpc', '--no-extensions']);
});

test('resolvePiPrompt falls back to the task goal when the rendered prompt is empty', () => {
  const input = makeInput({}, '   ');
  assert.equal(resolvePiPrompt(input), 'goal fallback');
});
