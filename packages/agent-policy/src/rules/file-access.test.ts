import { describe, expect, it } from 'vitest';
import { evaluateFileAccess } from './file-access.js';
import type { PolicyInput } from '../engine.js';

function makeInput(opts: {
  action?: 'file.read' | 'file.write';
  path: string;
  defaultFileEffect: 'allow' | 'deny';
  pathRules?: Array<{ glob: string; effect: 'allow' | 'deny'; requiresApproval?: boolean }>;
  targetPaths?: string[];
  forbiddenPaths?: string[];
}): PolicyInput {
  return {
    actor: {
      agentId: 'agent_test',
      permissions: {
        pathRules: opts.pathRules ?? [],
        defaultFileEffect: opts.defaultFileEffect,
        allowSecretsAccess: false,
      },
    },
    action: opts.action ?? 'file.read',
    target: { path: opts.path },
    task: { taskId: 't1', targetPaths: opts.targetPaths ?? [], forbiddenPaths: opts.forbiddenPaths ?? [] },
    now: '2026-07-31T00:00:00.000Z',
  } as unknown as PolicyInput;
}

describe('evaluateFileAccess — deny-by-default is enforced (recoder-u2zj)', () => {
  it('DENIES an unlisted path under defaultFileEffect:deny (the bypass)', () => {
    const r = evaluateFileAccess(makeInput({
      path: '/etc/passwd', defaultFileEffect: 'deny', pathRules: [{ glob: 'src/**', effect: 'allow' }],
    }));
    expect(r?.effect).toBe('deny');
  });

  it('ALLOWS a path matched by an explicit allow rule under deny-default', () => {
    const r = evaluateFileAccess(makeInput({
      path: 'src/app.ts', defaultFileEffect: 'deny', pathRules: [{ glob: 'src/**', effect: 'allow' }],
    }));
    expect(r).toBeNull(); // falls through to the engine's allow
  });

  it("ALLOWS a path within the task's targetPaths under deny-default (in-scope read)", () => {
    const r = evaluateFileAccess(makeInput({
      path: 'src/x.ts', defaultFileEffect: 'deny', pathRules: [], targetPaths: ['src/**'],
    }));
    expect(r).toBeNull();
  });

  it('does NOT change behavior under defaultFileEffect:allow (unmatched path falls through)', () => {
    const r = evaluateFileAccess(makeInput({ path: '/etc/hosts', defaultFileEffect: 'allow' }));
    expect(r).toBeNull();
  });

  it('a forbidden path is still denied regardless of default', () => {
    const r = evaluateFileAccess(makeInput({
      path: 'secrets/x', defaultFileEffect: 'allow', forbiddenPaths: ['secrets/**'],
    }));
    expect(r?.effect).toBe('deny');
  });
});
