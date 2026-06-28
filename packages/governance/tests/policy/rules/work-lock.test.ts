import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyInput } from '@recoder/agent-policy';
import { evaluateWorkLock } from '../../../src/policy/rules/work-lock';
import { makeAgent, makeTask, makeLock } from '../../fixtures';

describe('work-lock rule', () => {
  it('denies a write outside the held lock envelope', () => {
    const input: PolicyInput = {
      actor: makeAgent(),
      task: makeTask(),
      action: 'file.write',
      target: { path: 'docs/readme.md' },
      workLocks: [makeLock({ pathGlob: 'src/**' })],
    };
    const d = evaluateWorkLock(input);
    assert.ok(d);
    assert.equal(d?.effect, 'deny');
  });

  it('allows a write inside the held lock envelope', () => {
    const input: PolicyInput = {
      actor: makeAgent(),
      task: makeTask(),
      action: 'file.write',
      target: { path: 'src/components/x.ts' },
      workLocks: [makeLock({ pathGlob: 'src/**' })],
    };
    assert.equal(evaluateWorkLock(input), null);
  });

  it('defers (returns null) when the agent holds NO lock for the task', () => {
    const input: PolicyInput = {
      actor: makeAgent(),
      task: makeTask(),
      action: 'file.write',
      target: { path: 'docs/readme.md' },
      workLocks: [],
    };
    // Defers so the upstream writeLockRequired -> needs_approval rule fires.
    assert.equal(evaluateWorkLock(input), null);
  });

  it('ignores expired locks (treated as no lock -> defers)', () => {
    const input: PolicyInput = {
      actor: makeAgent(),
      task: makeTask(),
      action: 'file.write',
      target: { path: 'docs/x.md' },
      workLocks: [makeLock({ pathGlob: 'src/**', expiresAt: '2000-01-01T00:00:00.000Z' })],
      now: '2026-01-01T00:00:00.000Z',
    };
    assert.equal(evaluateWorkLock(input), null);
  });

  it('ignores locks owned by a different agent', () => {
    const input: PolicyInput = {
      actor: makeAgent({ agentId: 'agent-1' }),
      task: makeTask(),
      action: 'file.write',
      target: { path: 'docs/x.md' },
      workLocks: [makeLock({ pathGlob: 'docs/**', ownerAgentId: 'agent-2' })],
    };
    // The other agent's lock doesn't count, so this defers (no owned lock).
    assert.equal(evaluateWorkLock(input), null);
  });

  it('does not apply to reads', () => {
    const input: PolicyInput = {
      actor: makeAgent(),
      task: makeTask(),
      action: 'file.read',
      target: { path: 'docs/x.md' },
      workLocks: [makeLock({ pathGlob: 'src/**' })],
    };
    assert.equal(evaluateWorkLock(input), null);
  });

  it('denies when none of multiple owned locks cover the path', () => {
    const input: PolicyInput = {
      actor: makeAgent(),
      task: makeTask(),
      action: 'file.write',
      target: { path: 'infra/deploy.yml' },
      workLocks: [makeLock({ pathGlob: 'src/**' }), makeLock({ lockId: 'l2', pathGlob: 'docs/**' })],
    };
    const d = evaluateWorkLock(input);
    assert.equal(d?.effect, 'deny');
  });
});
