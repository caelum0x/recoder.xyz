import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentOsEvalHarness } from './harness';

test('forbidden paths and direct memory writes are blocked by hook policy', () => {
  const harness = new AgentOsEvalHarness();

  const secretPathDecision = harness.enforce({
    action: 'file.write',
    target: { path: '.env.production', content: 'RECODER_API_TOKEN=sk-testsecret0000000000000000' },
    policy: { forbiddenPaths: ['.env*'] },
    workLock: { held: true },
  });
  assert.equal(secretPathDecision.decision, 'block');
  assert.match(secretPathDecision.reason, /forbidden/i);

  const memoryDecision = harness.enforce({
    action: 'memory.write',
    target: { content: 'Persist this automatically' },
  });
  assert.equal(memoryDecision.decision, 'block');
  assert.match(memoryDecision.reason, /memory candidate/i);
});
