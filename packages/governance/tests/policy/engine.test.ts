import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyInput } from '@recoder/agent-policy';
import { evaluateGovernancePolicy, makeEvaluatePolicy } from '../../src/policy/engine';
import { makeAgent, makeTask, makeLock } from '../fixtures';

describe('fused governance policy chain', () => {
  it('hard-denies a forbidden-path write BEFORE any approval downgrade', () => {
    const input: PolicyInput = {
      actor: makeAgent({ permissions: { ...makeAgent().permissions, writeLockRequired: false, defaultFileEffect: 'allow' } }),
      task: makeTask(),
      action: 'file.write',
      target: { path: 'src/auth/login.ts' },
    };
    const d = evaluateGovernancePolicy(input);
    // forbidden-path is a hard deny, never needs_approval.
    assert.equal(d.effect, 'deny');
  });

  it('denies a write outside the held work-lock envelope', () => {
    const input: PolicyInput = {
      actor: makeAgent(),
      task: makeTask(),
      action: 'file.write',
      target: { path: 'infra/deploy.yml' },
      workLocks: [makeLock({ pathGlob: 'src/**' })],
    };
    const d = evaluateGovernancePolicy(input);
    assert.equal(d.effect, 'deny');
  });

  it('memory.write is denied (secret-access upstream rule wins first)', () => {
    const input: PolicyInput = {
      actor: makeAgent(),
      task: makeTask(),
      action: 'memory.write',
      target: {},
    };
    const d = evaluateGovernancePolicy(input);
    assert.equal(d.effect, 'deny');
  });

  it('branch.push needs approval when git write is not allowed', () => {
    const input: PolicyInput = {
      actor: makeAgent(),
      task: makeTask(),
      action: 'branch.push',
      target: {},
    };
    const d = evaluateGovernancePolicy(input);
    assert.equal(d.effect, 'needs_approval');
  });

  it('a dangerous shell command needs approval', () => {
    const input: PolicyInput = {
      actor: makeAgent({ permissions: { ...makeAgent().permissions, allowShell: true } }),
      task: makeTask(),
      action: 'command.run',
      target: { command: 'rm -rf /' },
    };
    const d = evaluateGovernancePolicy(input);
    assert.equal(d.effect, 'needs_approval');
  });

  it('a write inside the lock envelope on an ordinary path is allowed', () => {
    const input: PolicyInput = {
      actor: makeAgent({ permissions: { ...makeAgent().permissions, defaultFileEffect: 'allow' } }),
      task: makeTask(),
      action: 'file.write',
      target: { path: 'src/components/x.ts' },
      workLocks: [makeLock({ pathGlob: 'src/**' })],
    };
    const d = evaluateGovernancePolicy(input);
    assert.equal(d.effect, 'allow');
  });

  it('forbidden-path beats work-lock (auth write inside lock is still denied)', () => {
    const input: PolicyInput = {
      actor: makeAgent({ permissions: { ...makeAgent().permissions, defaultFileEffect: 'allow' } }),
      task: makeTask(),
      action: 'file.write',
      target: { path: 'src/auth/x.ts' },
      workLocks: [makeLock({ pathGlob: 'src/**' })],
    };
    const d = evaluateGovernancePolicy(input);
    assert.equal(d.effect, 'deny');
    assert.match(d.reason, /forbidden|auth/i);
  });

  it('config-extended forbidden globs are honored by the chain', () => {
    const evaluate = makeEvaluatePolicy({ forbiddenPath: { extraGlobs: ['**/infra/**'] } });
    const input: PolicyInput = {
      actor: makeAgent({ permissions: { ...makeAgent().permissions, defaultFileEffect: 'allow' } }),
      task: makeTask(),
      action: 'file.write',
      target: { path: 'infra/deploy.yml' },
      workLocks: [makeLock({ pathGlob: '**' })],
    };
    const d = evaluate(input);
    assert.equal(d.effect, 'deny');
  });
});
