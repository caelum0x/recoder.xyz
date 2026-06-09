import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentOsEvalHarness } from './harness';

test('Claude Code and Codex connect and register capabilities', () => {
  const harness = new AgentOsEvalHarness();
  const claude = harness.connectAgent('claude_code', 'claude-code');
  const codex = harness.connectAgent('codex', 'codex');

  assert.equal(harness.agents.size, 2);
  assert.equal(claude.vendor_surface, 'claude_code');
  assert.equal(codex.vendor_surface, 'codex');
  assert.ok(claude.capabilities.some((capability) => capability.capability_id === 'implementation'));
  assert.ok(codex.capabilities.some((capability) => capability.capability_id === 'verification'));
});
