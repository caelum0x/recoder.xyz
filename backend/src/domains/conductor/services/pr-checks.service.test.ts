/**
 * Workspace per-check PR rollup via the `gh` CLI seam (`GET …/checks`).
 *
 * Proves:
 *  - happy path: `gh pr view --json statusCheckRollup,mergeable,reviewDecision`
 *    (run in the worktree, NO branch arg — gh resolves the PR itself) is
 *    projected into `{ available:true, mergeable, reviewDecision, checks[] }`,
 *    handling both CheckRun and StatusContext rollup entries;
 *  - truthful degrades (NEVER fabricated): no worktree / no gh on PATH /
 *    gh unauthenticated / no PR for the branch / a non-GitHub origin remote —
 *    each an `available:false` with a real reason;
 *  - unparseable gh output is a truthful `available:false`, never a guess.
 */
import { describe, it, expect } from 'vitest';
import { ExecError } from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import {
  combineWorkspaceChecks,
  PrChecksService,
  parseGhChecks,
  type PrChecksExec,
} from './pr-checks.service.js';
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
  gh?: boolean;
  remoteUrl?: string | 'fail';
  view?: string | ExecError;
}

function makeService(behavior: Behavior) {
  const calls: { bin: string; args: readonly string[]; cwd?: string }[] = [];
  const exec: PrChecksExec = {
    which: async (bin) =>
      bin === 'gh' && behavior.gh ? '/usr/local/bin/gh' : undefined,
    execFile: async (bin, args, options) => {
      calls.push({ bin, args, ...(options.cwd ? { cwd: options.cwd } : {}) });
      if (bin === 'git' && args[0] === 'remote') {
        if (behavior.remoteUrl === 'fail' || behavior.remoteUrl === undefined) {
          throw new ExecError('git', args, { code: 2, stdout: '', stderr: 'error: No such remote' });
        }
        return { stdout: `${behavior.remoteUrl}\n`, stderr: '', code: 0 };
      }
      if (bin.endsWith('gh') && args[0] === 'pr' && args[1] === 'view') {
        if (behavior.view instanceof ExecError) throw behavior.view;
        return { stdout: behavior.view ?? '', stderr: '', code: 0 };
      }
      throw new Error(`unexpected exec: ${bin} ${args.join(' ')}`);
    },
  };
  const service = new PrChecksService({ logger: makeLogger(), exec });
  return { service, calls };
}

const GH_CHECKS_JSON = JSON.stringify({
  mergeable: 'MERGEABLE',
  reviewDecision: 'APPROVED',
  statusCheckRollup: [
    { __typename: 'CheckRun', name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { __typename: 'CheckRun', name: 'test', status: 'IN_PROGRESS', conclusion: '' },
    { __typename: 'StatusContext', context: 'ci/legacy', state: 'FAILURE' },
  ],
});

describe('parseGhChecks', () => {
  it('projects CheckRun and StatusContext entries into rows', () => {
    expect(parseGhChecks(GH_CHECKS_JSON)).toEqual({
      mergeable: 'MERGEABLE',
      reviewDecision: 'APPROVED',
      checks: [
        { name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'test', status: 'IN_PROGRESS', conclusion: '' },
        { name: 'ci/legacy', status: 'COMPLETED', conclusion: 'FAILURE' },
      ],
    });
  });

  it('is null on non-JSON / non-object output (never a fabricated PR)', () => {
    expect(parseGhChecks('not json')).toBeNull();
    expect(parseGhChecks('[]')).toBeNull();
  });

  it('an empty rollup is an empty checks list', () => {
    expect(parseGhChecks('{}')).toEqual({ checks: [] });
  });
});

describe('combineWorkspaceChecks', () => {
  it('shows Recoder-owned rows even when the branch has no GitHub PR', () => {
    expect(combineWorkspaceChecks(
      { available: false, reason: 'no pull request for the current branch' },
      [
        { name: 'typecheck', status: 'pass', detail: 'Found 0 errors' },
        { name: 'tests', status: 'fail', detail: '2 tests failed', autofix: { prompt: 'Fix tests.' } },
      ],
    )).toEqual({
      available: true,
      checks: [
        { name: 'typecheck', status: 'COMPLETED', conclusion: 'SUCCESS', source: 'recoder', detail: 'Found 0 errors' },
        { name: 'tests', status: 'COMPLETED', conclusion: 'FAILURE', source: 'recoder', detail: '2 tests failed', autofix: { prompt: 'Fix tests.' } },
      ],
      githubAvailable: false,
      githubReason: 'no pull request for the current branch',
      localRan: true,
    });
  });

  it('retains GitHub rows and labels both evidence sources', () => {
    expect(combineWorkspaceChecks(
      { available: true, mergeable: 'MERGEABLE', checks: [{ name: 'CI', status: 'COMPLETED', conclusion: 'SUCCESS' }] },
      [{ name: 'lint', status: 'error', detail: 'spawn eslint ENOENT' }],
    )).toMatchObject({
      available: true,
      mergeable: 'MERGEABLE',
      githubAvailable: true,
      localRan: true,
      checks: [
        { name: 'CI', source: 'github', conclusion: 'SUCCESS' },
        { name: 'lint', source: 'recoder', conclusion: 'ERROR', detail: 'spawn eslint ENOENT' },
      ],
    });
  });

  it('preserves the GitHub-only view when no local command ran', () => {
    const github = { available: false, reason: 'gh CLI not found' } as const;
    expect(combineWorkspaceChecks(github, [])).toBe(github);
  });
});

describe('PrChecksService', () => {
  it('resolves the PR checks through gh in the worktree (no branch arg)', async () => {
    const { service, calls } = makeService({
      gh: true,
      remoteUrl: 'git@github.com:acme/widget.git',
      view: GH_CHECKS_JSON,
    });
    const view = await service.checks(makeWorkspace());
    expect(view).toEqual({
      available: true,
      mergeable: 'MERGEABLE',
      reviewDecision: 'APPROVED',
      checks: [
        { name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'test', status: 'IN_PROGRESS', conclusion: '' },
        { name: 'ci/legacy', status: 'COMPLETED', conclusion: 'FAILURE' },
      ],
    });
    const ghCall = calls.find((c) => c.bin.endsWith('gh'));
    expect(ghCall?.args).toEqual([
      'pr',
      'view',
      '--json',
      'statusCheckRollup,mergeable,reviewDecision',
    ]);
    expect(ghCall?.cwd).toBe('/tmp/wt/ws_1');
  });

  it('degrades truthfully when the workspace has no worktree', async () => {
    const { service } = makeService({ gh: true });
    const view = await service.checks(makeWorkspace({ worktreePath: undefined } as Partial<Workspace>));
    expect(view).toEqual({ available: false, reason: 'workspace has no worktree' });
  });

  it('degrades truthfully when gh is not installed', async () => {
    const { service, calls } = makeService({});
    const view = await service.checks(makeWorkspace());
    expect(view).toEqual({ available: false, reason: 'gh CLI not found' });
    expect(calls).toEqual([]);
  });

  it('degrades truthfully when the origin remote is not GitHub', async () => {
    const { service, calls } = makeService({
      gh: true,
      remoteUrl: 'https://gitlab.com/acme/widget.git',
    });
    const view = await service.checks(makeWorkspace());
    expect(view).toEqual({
      available: false,
      reason: 'origin remote is not a GitHub repository',
    });
    expect(calls.some((c) => c.bin.endsWith('gh'))).toBe(false);
  });

  it('degrades truthfully when the branch has no PR', async () => {
    const { service } = makeService({
      gh: true,
      remoteUrl: 'https://github.com/acme/widget.git',
      view: new ExecError('gh', [], {
        code: 1,
        stdout: '',
        stderr: 'no pull requests found for branch "feat/x"',
      }),
    });
    const view = await service.checks(makeWorkspace());
    expect(view).toEqual({
      available: false,
      reason: 'no pull request for the current branch',
    });
  });

  it('degrades truthfully when gh is not authenticated', async () => {
    const { service } = makeService({
      gh: true,
      remoteUrl: 'https://github.com/acme/widget.git',
      view: new ExecError('gh', [], {
        code: 4,
        stdout: '',
        stderr: 'To get started with GitHub CLI, please run:  gh auth login',
      }),
    });
    const view = await service.checks(makeWorkspace());
    expect(view).toEqual({
      available: false,
      reason: 'gh is not authenticated (run `gh auth login`)',
    });
  });

  it('a failed remote probe does not block gh (gh error becomes the reason)', async () => {
    const { service } = makeService({
      gh: true,
      remoteUrl: 'fail',
      view: new ExecError('gh', [], {
        code: 1,
        stdout: '',
        stderr: 'could not determine base repo',
      }),
    });
    const view = await service.checks(makeWorkspace());
    expect(view).toEqual({
      available: false,
      reason: 'could not determine base repo',
    });
  });

  it('unparseable gh output is a truthful unavailable', async () => {
    const { service } = makeService({
      gh: true,
      remoteUrl: 'https://github.com/acme/widget.git',
      view: 'garbage',
    });
    const view = await service.checks(makeWorkspace());
    expect(view).toEqual({
      available: false,
      reason: 'could not parse gh pr view output',
    });
  });
});
