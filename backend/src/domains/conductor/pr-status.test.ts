/**
 * Workspace PR status via the `gh` CLI seam.
 *
 * Proves:
 *  - happy path: `gh pr view <branch> --json …` is projected into a truthful
 *    view (number/state/draft/mergeable/url + a checks rollup);
 *  - degrade: no `gh` on PATH ⇒ `available:false` (never a fabricated "no PR");
 *  - degrade: gh reporting no PR for the branch ⇒ `available:true, hasPr:false`;
 *  - degrade: no worktree ⇒ `available:false` with a truthful reason;
 *  - the parse + checks-rollup helpers are worst-wins and never fabricate a pass.
 */
import { describe, it, expect } from 'vitest';
import { ExecError } from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import {
  PrStatusService,
  parseGhPrView,
  summarizeChecks,
  type PrStatusExec,
} from './services/pr-status.service.js';
import { makeLogger } from './__fixtures__/harness.js';

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws_1',
    branch: 'feat/x',
    worktreePath: '/tmp/wt/ws_1',
    ...overrides,
  } as unknown as Workspace;
}

interface ExecBehavior {
  gh?: boolean;
  view?: string | ExecError;
}

function makeService(behavior: ExecBehavior) {
  const exec: PrStatusExec = {
    which: async bin =>
      bin === 'gh' && behavior.gh ? '/usr/local/bin/gh' : undefined,
    execFile: async (bin, args) => {
      if (bin.endsWith('gh') && args[0] === 'pr' && args[1] === 'view') {
        if (behavior.view instanceof ExecError) throw behavior.view;
        return { stdout: behavior.view ?? '', stderr: '', code: 0 };
      }
      throw new Error(`unexpected exec: ${bin} ${args.join(' ')}`);
    },
  };
  return new PrStatusService({ logger: makeLogger(), exec });
}

const GH_PR_JSON = JSON.stringify({
  number: 42,
  state: 'OPEN',
  isDraft: false,
  mergeable: 'MERGEABLE',
  url: 'https://github.com/acme/repo/pull/42',
  statusCheckRollup: [
    { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' },
    { __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: '' },
  ],
});

describe('summarizeChecks', () => {
  it('is worst-wins (a failure makes the rollup failing)', () => {
    const summary = summarizeChecks([
      { status: 'COMPLETED', conclusion: 'SUCCESS' },
      { status: 'COMPLETED', conclusion: 'FAILURE' },
    ]);
    expect(summary).toEqual({
      total: 2,
      passed: 1,
      failed: 1,
      pending: 0,
      rollup: 'failing',
    });
  });

  it('an in-progress check with no failures is pending', () => {
    const summary = summarizeChecks([
      { status: 'COMPLETED', conclusion: 'SUCCESS' },
      { status: 'IN_PROGRESS', conclusion: '' },
    ]);
    expect(summary.rollup).toBe('pending');
    expect(summary.pending).toBe(1);
  });

  it('empty / non-array rollups are none', () => {
    expect(summarizeChecks([]).rollup).toBe('none');
    expect(summarizeChecks(undefined).rollup).toBe('none');
  });

  it('handles StatusContext entries (state field)', () => {
    const summary = summarizeChecks([
      { state: 'SUCCESS' },
      { state: 'FAILURE' },
    ]);
    expect(summary).toEqual({
      total: 2,
      passed: 1,
      failed: 1,
      pending: 0,
      rollup: 'failing',
    });
  });
});

describe('parseGhPrView', () => {
  it('projects the gh JSON into the view fields', () => {
    expect(parseGhPrView(GH_PR_JSON)).toEqual({
      number: 42,
      state: 'open',
      draft: false,
      mergeable: 'mergeable',
      url: 'https://github.com/acme/repo/pull/42',
      checks: { total: 3, passed: 1, failed: 1, pending: 1, rollup: 'failing' },
    });
  });

  it('returns null for unparseable / non-PR output', () => {
    expect(parseGhPrView('not json')).toBeNull();
    expect(parseGhPrView('{}')).toBeNull();
    expect(parseGhPrView('[]')).toBeNull();
  });
});

describe('PrStatusService.status', () => {
  it('projects an open PR truthfully (happy path)', async () => {
    const service = makeService({ gh: true, view: GH_PR_JSON });
    const view = await service.status(makeWorkspace());
    expect(view).toEqual({
      available: true,
      hasPr: true,
      number: 42,
      state: 'open',
      draft: false,
      mergeable: 'mergeable',
      url: 'https://github.com/acme/repo/pull/42',
      checks: { total: 3, passed: 1, failed: 1, pending: 1, rollup: 'failing' },
    });
  });

  it('degrades to unavailable when gh is not installed', async () => {
    const service = makeService({ gh: false });
    const view = await service.status(makeWorkspace());
    expect(view).toEqual({
      available: false,
      hasPr: false,
      reason: 'gh CLI not found',
    });
  });

  it('reports no PR when gh finds none for the branch', async () => {
    const noPr = new ExecError('gh', ['pr', 'view'], {
      code: 1,
      stdout: '',
      stderr: 'no pull requests found for branch "feat/x"',
      message: 'command failed: gh (code 1)',
    });
    const service = makeService({ gh: true, view: noPr });
    const view = await service.status(makeWorkspace());
    expect(view).toEqual({
      available: true,
      hasPr: false,
      reason: 'no pull request for branch',
    });
  });

  it('a gh auth/network error is unavailable (not a fabricated "no PR")', async () => {
    const authErr = new ExecError('gh', ['pr', 'view'], {
      code: 1,
      stdout: '',
      stderr: 'gh: authentication required',
      message: 'command failed: gh (code 1)',
    });
    const service = makeService({ gh: true, view: authErr });
    const view = await service.status(makeWorkspace());
    expect(view.available).toBe(false);
    expect(view.hasPr).toBe(false);
    expect(view.reason).toContain('authentication required');
  });

  it('degrades when the workspace has no worktree', async () => {
    const service = makeService({ gh: true, view: GH_PR_JSON });
    const view = await service.status(
      makeWorkspace({ worktreePath: undefined })
    );
    expect(view).toEqual({
      available: false,
      hasPr: false,
      reason: 'workspace has no worktree',
    });
  });
});
