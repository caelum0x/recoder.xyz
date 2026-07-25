/**
 * The shared repo default-branch resolver — the single truth the launch path
 * persists a concrete baseRef from and the read/merge edges degrade back to,
 * instead of a hardcoded `main`.
 *
 * Proves:
 *  - the MAIN worktree's `branch refs/heads/<name>` wins (correct from a linked
 *    worktree too, since git lists the main tree first);
 *  - falls back to `origin/HEAD` (stripped of `origin/`) when there is no branch
 *    line, then to the checked-out branch via `rev-parse`;
 *  - returns `undefined` (never a fabricated `main`) when git can't answer / the
 *    tree is detached — the caller keeps its own last resort explicit.
 */
import { describe, it, expect } from 'vitest';
import type { ExecResult } from '@recoder/substrate';
import { resolveRepoDefaultBranch, type GitExecFn } from './git-default-branch.js';

/** Scripted exec keyed on the git subcommand; unmatched entries throw (not-a-repo). */
function makeExec(script: Record<string, string | Error>): GitExecFn {
  return (async (_bin, args) => {
    const key = args.find((a) => ['list', 'symbolic-ref', 'rev-parse'].includes(a)) ?? args.join(' ');
    const value = script[key];
    if (value == null) throw new Error(`unscripted: ${args.join(' ')}`);
    if (value instanceof Error) throw value;
    return { stdout: value, stderr: '', code: 0 } as ExecResult;
  }) as GitExecFn;
}

describe('resolveRepoDefaultBranch', () => {
  it('returns the main worktree branch from `worktree list --porcelain`', async () => {
    const exec = makeExec({
      list:
        'worktree /repo\nHEAD abc\nbranch refs/heads/develop\n\n' +
        'worktree /repo/wt\nHEAD def\nbranch refs/heads/recoder/ws_1\n',
    });
    expect(await resolveRepoDefaultBranch(exec, '/repo/wt')).toBe('develop');
  });

  it('falls back to origin/HEAD (stripped) when there is no branch line', async () => {
    const exec = makeExec({
      list: 'worktree /repo\nHEAD abc\ndetached\n',
      'symbolic-ref': 'origin/master',
    });
    expect(await resolveRepoDefaultBranch(exec, '/repo')).toBe('master');
  });

  it('falls back to the checked-out branch via rev-parse', async () => {
    const exec = makeExec({
      list: new Error('not a git repository'),
      'symbolic-ref': new Error('no origin/HEAD'),
      'rev-parse': 'trunk',
    });
    expect(await resolveRepoDefaultBranch(exec, '/repo')).toBe('trunk');
  });

  it('returns undefined when git cannot answer (never a fabricated main)', async () => {
    const exec = makeExec({
      list: new Error('no git'),
      'symbolic-ref': new Error('no origin/HEAD'),
      'rev-parse': new Error('no git'),
    });
    expect(await resolveRepoDefaultBranch(exec, '/repo')).toBeUndefined();
  });

  it('returns undefined for a detached main tree (rev-parse prints HEAD)', async () => {
    const exec = makeExec({
      list: 'worktree /repo\nHEAD abc\ndetached\n',
      'symbolic-ref': new Error('no origin/HEAD'),
      'rev-parse': 'HEAD',
    });
    expect(await resolveRepoDefaultBranch(exec, '/repo')).toBeUndefined();
  });
});
