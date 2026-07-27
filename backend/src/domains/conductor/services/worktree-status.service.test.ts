/**
 * Workspace worktree open-work probe (`git status --porcelain`).
 *
 * Proves:
 *  - clean worktree ⇒ `{ available:true, dirty:false, changedCount:0 }`;
 *  - uncommitted work ⇒ `{ available:true, dirty:true, changedCount:N }`,
 *    counting staged, unstaged, AND untracked porcelain lines;
 *  - truthful degrades (NEVER a fabricated clean): no worktree / no git on PATH /
 *    a git fault — each an `available:false` with a real reason and dirty:false;
 *  - the porcelain-line counter is trailing-newline robust.
 */
import { describe, it, expect } from 'vitest';
import { ExecError } from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import {
  WorktreeStatusService,
  countPorcelainEntries,
  type WorktreeStatusExec,
} from './worktree-status.service.js';
import { makeLogger } from '../__fixtures__/harness.js';

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws_1',
    branch: 'feat/x',
    worktreePath: '/tmp/wt/ws_1',
    ...overrides,
  } as unknown as Workspace;
}

interface Behavior {
  git?: boolean;
  status?: string | ExecError;
}

function makeService(behavior: Behavior) {
  const calls: { bin: string; args: readonly string[] }[] = [];
  const exec: WorktreeStatusExec = {
    which: async (bin) => (bin === 'git' && behavior.git ? '/usr/bin/git' : undefined),
    execFile: async (bin, args) => {
      calls.push({ bin, args });
      if (bin.endsWith('git') && args.includes('status')) {
        if (behavior.status instanceof ExecError) throw behavior.status;
        return { stdout: behavior.status ?? '', stderr: '', code: 0 };
      }
      throw new Error(`unexpected exec: ${bin} ${args.join(' ')}`);
    },
  };
  return { service: new WorktreeStatusService({ logger: makeLogger(), exec }), calls };
}

describe('countPorcelainEntries', () => {
  it('counts one entry per non-empty line, trailing-newline robust', () => {
    expect(countPorcelainEntries('')).toBe(0);
    expect(countPorcelainEntries('\n')).toBe(0);
    expect(countPorcelainEntries(' M src/a.ts\n')).toBe(1);
    expect(countPorcelainEntries('A  src/a.ts\n?? src/b.ts\n M src/c.ts\n')).toBe(3);
    expect(countPorcelainEntries('A  src/a.ts\n?? src/b.ts')).toBe(2);
  });
});

describe('WorktreeStatusService.probe', () => {
  it('reports a clean worktree', async () => {
    const { service, calls } = makeService({ git: true, status: '' });
    const view = await service.probe(makeWorkspace());
    expect(view).toEqual({ available: true, dirty: false, changedCount: 0 });
    expect(calls[0]).toEqual({ bin: '/usr/bin/git', args: ['-C', '/tmp/wt/ws_1', 'status', '--porcelain'] });
  });

  it('reports uncommitted work as dirty with a change count', async () => {
    const { service } = makeService({ git: true, status: ' M src/a.ts\n?? src/b.ts\nA  src/c.ts\n' });
    const view = await service.probe(makeWorkspace());
    expect(view).toEqual({ available: true, dirty: true, changedCount: 3 });
  });

  it('degrades truthfully when the workspace has no worktree', async () => {
    const { service, calls } = makeService({ git: true, status: '' });
    const view = await service.probe(makeWorkspace({ worktreePath: undefined } as Partial<Workspace>));
    expect(view).toEqual({ available: false, dirty: false, changedCount: 0, reason: 'workspace has no worktree' });
    expect(calls).toHaveLength(0);
  });

  it('degrades truthfully when git is not on PATH', async () => {
    const { service } = makeService({ git: false });
    const view = await service.probe(makeWorkspace());
    expect(view).toEqual({ available: false, dirty: false, changedCount: 0, reason: 'git CLI not found' });
  });

  it('degrades truthfully (never a fake clean) on a git fault', async () => {
    const err = new ExecError('git', ['status'], { code: 128, stdout: '', stderr: 'fatal: not a git repository' });
    const { service } = makeService({ git: true, status: err });
    const view = await service.probe(makeWorkspace());
    expect(view.available).toBe(false);
    expect(view.dirty).toBe(false);
    expect(view.changedCount).toBe(0);
    expect(view.reason).toContain('not a git repository');
  });
});
