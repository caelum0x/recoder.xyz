/**
 * Workspace merge preflight via the git `merge-tree` + `rev-list` seam.
 *
 * Proves:
 *  - happy path: a clean trial merge + divergence is projected truthfully;
 *  - conflict: `merge-tree` exit 1 with a tree-oid + paths + info block yields the
 *    conflicted paths only (the info block after the blank line is excluded);
 *  - degrade: a git too old for the preflight flags ⇒ `available:false, verdict
 *    'unknown'` — asserted NOT 'clean' (never a fabricated pass);
 *  - degrade: no worktree / no branch ⇒ `available:false` with a truthful reason,
 *    before any exec;
 *  - divergence degrades INDEPENDENTLY: a `rev-list` fault zeroes ahead/behind
 *    without disturbing the (clean) conflict verdict;
 *  - the parse helpers are worst-truthful and never fabricate.
 */
import { describe, it, expect } from 'vitest';
import { ExecError } from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import {
  MergeabilityService,
  parseMergeTreeConflicts,
  parseDivergence,
  isOldGitMergeTree,
  type MergeabilityExec,
} from './services/mergeability.service.js';
import { makeLogger } from './__fixtures__/harness.js';

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws_1',
    branch: 'feat/x',
    worktreePath: '/tmp/wt/ws_1',
    baseRef: 'main',
    ...overrides,
  } as unknown as Workspace;
}

interface ExecBehavior {
  /** `false` ⇒ `which('git')` resolves undefined (git not installed). */
  git?: boolean;
  /** stdout on a clean trial merge, or an ExecError to throw. */
  mergeTree?: string | ExecError;
  /** stdout of `rev-list --left-right --count`, or an ExecError to throw. */
  revList?: string | ExecError;
}

function makeService(behavior: ExecBehavior) {
  const exec: MergeabilityExec = {
    which: async bin => (bin === 'git' && behavior.git !== false ? '/usr/bin/git' : undefined),
    execFile: async (bin, args) => {
      if (args.includes('merge-tree')) {
        if (behavior.mergeTree instanceof ExecError) throw behavior.mergeTree;
        return { stdout: behavior.mergeTree ?? 'treeoid\n', stderr: '', code: 0 };
      }
      if (args.includes('rev-list')) {
        if (behavior.revList instanceof ExecError) throw behavior.revList;
        return { stdout: behavior.revList ?? '0\t0', stderr: '', code: 0 };
      }
      throw new Error(`unexpected exec: ${bin} ${args.join(' ')}`);
    },
  };
  return new MergeabilityService({ logger: makeLogger(), exec });
}

describe('parseMergeTreeConflicts', () => {
  it('drops the tree-oid, keeps paths until the first blank line, dedupes', () => {
    const stdout =
      'treeoid\nsrc/foo.ts\nsrc/bar.ts\nsrc/foo.ts\n\nCONFLICT (content): Merge conflict in src/foo.ts\n';
    expect(parseMergeTreeConflicts(stdout)).toEqual(['src/foo.ts', 'src/bar.ts']);
  });

  it('is empty when only the tree-oid is present', () => {
    expect(parseMergeTreeConflicts('treeoid\n')).toEqual([]);
  });
});

describe('parseDivergence', () => {
  it('reads left=behind, right=ahead', () => {
    expect(parseDivergence('5\t2')).toEqual({ behind: 5, ahead: 2 });
  });

  it('degrades unparseable counts to 0', () => {
    expect(parseDivergence('')).toEqual({ behind: 0, ahead: 0 });
    expect(parseDivergence('nope')).toEqual({ behind: 0, ahead: 0 });
  });
});

describe('isOldGitMergeTree', () => {
  it('matches an unsupported --write-tree / --name-only option', () => {
    const err = new ExecError('git', ['merge-tree'], {
      code: 129,
      stdout: '',
      stderr: 'error: unknown option `write-tree\x27',
      message: 'command failed: git (code 129)',
    });
    expect(isOldGitMergeTree(err)).toBe(true);
  });

  it('never matches a real conflict (code 1, tree on stdout, empty stderr)', () => {
    const err = new ExecError('git', ['merge-tree'], {
      code: 1,
      stdout: 'treeoid\nsrc/foo.ts\n',
      stderr: '',
      message: 'command failed: git (code 1)',
    });
    expect(isOldGitMergeTree(err)).toBe(false);
  });
});

describe('MergeabilityService.probe', () => {
  it('(a) projects a clean merge + divergence truthfully (happy path)', async () => {
    const service = makeService({ git: true, mergeTree: 'treeoid\n', revList: '0\t3' });
    const view = await service.probe(makeWorkspace());
    expect(view).toEqual({
      available: true,
      verdict: 'clean',
      conflicts: [],
      ahead: 3,
      behind: 0,
      base: 'main',
      branch: 'feat/x',
    });
  });

  it('(b) reports conflicts from merge-tree exit 1, excluding the info block', async () => {
    const conflict = new ExecError('git', ['merge-tree'], {
      code: 1,
      stdout: 'treeoid\nsrc/foo.ts\nsrc/bar.ts\n\nCONFLICT (content): Merge conflict in src/foo.ts\n',
      stderr: '',
      message: 'command failed: git (code 1)',
    });
    const service = makeService({ git: true, mergeTree: conflict, revList: '2\t1' });
    const view = await service.probe(makeWorkspace());
    expect(view).toEqual({
      available: true,
      verdict: 'conflicting',
      conflicts: ['src/foo.ts', 'src/bar.ts'],
      ahead: 1,
      behind: 2,
      base: 'main',
      branch: 'feat/x',
    });
  });

  it('(c) a git too old for the preflight is unavailable, NEVER a fabricated clean', async () => {
    const oldGit = new ExecError('git', ['merge-tree'], {
      code: 129,
      stdout: '',
      stderr: 'error: unknown option `write-tree\x27',
      message: 'command failed: git (code 129)',
    });
    const service = makeService({ git: true, mergeTree: oldGit, revList: '0\t0' });
    const view = await service.probe(makeWorkspace());
    expect(view.available).toBe(false);
    expect(view.verdict).toBe('unknown');
    expect(view.verdict).not.toBe('clean');
    expect(view.reason).toContain('git too old');
  });

  it('(d) degrades before any exec when the workspace has no worktree / no branch', async () => {
    const service = makeService({ git: true, mergeTree: 'treeoid\n' });
    const noWorktree = await service.probe(makeWorkspace({ worktreePath: undefined }));
    expect(noWorktree.available).toBe(false);
    expect(noWorktree.reason).toContain('worktree');

    const noBranch = await service.probe(makeWorkspace({ branch: undefined }));
    expect(noBranch.available).toBe(false);
    expect(noBranch.reason).toContain('branch');
    expect(noBranch.branch).toBe('');
  });

  it('(e) divergence degrades independently: a clean merge with a rev-list fault zeroes ahead/behind', async () => {
    const revListErr = new ExecError('git', ['rev-list'], {
      code: 128,
      stdout: '',
      stderr: "fatal: ambiguous argument 'main...feat/x'",
      message: 'command failed: git (code 128)',
    });
    const service = makeService({ git: true, mergeTree: 'treeoid\n', revList: revListErr });
    const view = await service.probe(makeWorkspace());
    expect(view.verdict).toBe('clean');
    expect(view.available).toBe(true);
    expect(view.ahead).toBe(0);
    expect(view.behind).toBe(0);
  });

  it('(f) maps rev-list left/right to behind/ahead', async () => {
    const service = makeService({ git: true, mergeTree: 'treeoid\n', revList: '5\t2' });
    const view = await service.probe(makeWorkspace());
    expect(view.behind).toBe(5);
    expect(view.ahead).toBe(2);
  });

  it('degrades to unavailable when git is not installed', async () => {
    const service = makeService({ git: false });
    const view = await service.probe(makeWorkspace());
    expect(view).toEqual({
      available: false,
      verdict: 'unknown',
      conflicts: [],
      ahead: 0,
      behind: 0,
      base: 'main',
      branch: 'feat/x',
      reason: 'git CLI not found',
    });
  });
});
