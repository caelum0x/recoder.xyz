import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskIntentEnum } from '../../../packages/a2a-sdk/src/index';
import { compileForEval, createEvalAgent } from './harness';

test('Claude and Codex receive the same task contract with runtime-specific prompts', () => {
  const claudeBundle = compileForEval({
    agent: createEvalAgent('claude_code', 'claude'),
    prompt: 'Add regression test for signup crash',
    intent: TaskIntentEnum.TestGeneration,
    verify: ['pnpm -C docker-backend exec vitest run signup.test.ts'],
  });
  const codexBundle = compileForEval({
    agent: createEvalAgent('codex', 'codex'),
    prompt: 'Add regression test for signup crash',
    intent: TaskIntentEnum.TestGeneration,
    verify: ['pnpm -C docker-backend exec vitest run signup.test.ts'],
  });

  assert.deepEqual(claudeBundle.acceptance_criteria, codexBundle.acceptance_criteria);
  assert.deepEqual(claudeBundle.verification_commands, codexBundle.verification_commands);
  assert.notEqual(claudeBundle.agent_specific_prompt, codexBundle.agent_specific_prompt);
  assert.ok(claudeBundle.agent_specific_prompt.includes('Claude'));
  assert.ok(codexBundle.agent_specific_prompt.includes('Codex'));
});
