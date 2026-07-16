/**
 * Publish ops (pr/merge) — unit tests over a scripted exec (no real git/gh).
 *
 * Proves: the LOCAL merge fallback engages when there is no GitHub remote
 * (checkout base + real merge in the main working tree); pending agent edits
 * are committed onto the branch BEFORE the merge so the delivery isn't
 * "Already up to date"; a failed merge aborts the in-progress merge, returns
 * the workspace to awaiting_review with the truthful error (re-mergeable),
 * and never reports merged; the GitHub path drives `gh pr merge`.
 */
import { describe, it, expect } from 'vitest';
import type { Workspace, WorkspaceState } from '@recoder/agent-os';
import { mergeWorkspace, createWorkspacePr, type PublishOpsDeps } from './review/workspace-publish.ops.js';
import { makeLogger } from './__fixtures__/harness.js';

interface Call {
  cwd: string;
  bin: string;
  args: string[];
}

/** Scripted exec: match on "bin arg0 arg1…" prefix; unmatched commands succeed empty. */
function makeExec(script: Record<string, { stdout?: string; fail?: string }>) {
  const calls: Call[] = [];
  const exec = (async (bin: string, args: readonly string[], options?: { cwd?: string }) => {
    calls.push({ cwd: options?.cwd ?? '', bin, args: [...args] });
    const line = `${bin} ${args.join(' ')}`;
    const hit = Object.entries(script).find(([prefix]) => line.startsWith(prefix));
    if (hit?.[1].fail) throw new Error(hit[1].fail);
    return { stdout: hit?.[1].stdout ?? '', stderr: '', code: 0 };
  }) as PublishOpsDeps['exec'];
  return { exec, calls };
}

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws_1',
    spaceId: 's',
    projectId: 'p',
    taskId: 't',
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: 'recoder/ws_1',
    baseRef: 'main',
    worktreePath: '/tmp/wt/ws_1',
    state: 'awaiting_review',
    createdBy: 'user_test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Workspace;
}

function makeDeps(
  exec: PublishOpsDeps['exec'],
  workspace: Workspace,
): { deps: PublishOpsDeps; transitions: Array<{ to: WorkspaceState; metadata?: Record<string, unknown> }> } {
  const transitions: Array<{ to: WorkspaceState; metadata?: Record<string, unknown> }> = [];
  let current = workspace;
  const deps: PublishOpsDeps = {
    getWorkspace: async () => current,
    advanceWorkspace: async (_id, to, patch, metadata) => {
      transitions.push({ to, ...(metadata ? { metadata } : {}) });
      current = { ...current, ...patch, state: to } as Workspace;
      return current;
    },
    logger: makeLogger(),
    exec,
  };
  return { deps, transitions };
}

describe('mergeWorkspace — local fallback', () => {
  it('commits pending edits and merges locally when there is no GitHub remote', async () => {
    const { exec, calls } = makeExec({
      'git remote get-url origin': { fail: 'no such remote' },
      'git status --porcelain': { stdout: ' M src/app.ts\n' },
      'git worktree list --porcelain': { stdout: 'worktree /tmp/main-repo\nbranch main\n' },
    });
    const { deps, transitions } = makeDeps(exec, makeWorkspace());

    const result = await mergeWorkspace(deps, 'ws_1', { strategy: 'merge' });
    expect(result.merged).toBe(true);

    const lines = calls.map((c) => `${c.bin} ${c.args.join(' ')}`);
    // Pending edits were committed BEFORE the merge.
    expect(lines.some((l) => l.startsWith('git add -A'))).toBe(true);
    expect(lines.some((l) => l.includes('commit -m agent: recoder/ws_1'))).toBe(true);
    // The local merge ran in the MAIN working tree, on the base branch.
    const checkout = calls.find((c) => c.args.join(' ') === 'checkout main');
    expect(checkout?.cwd).toBe('/tmp/main-repo');
    expect(lines.some((l) => l.includes('merge --no-ff'))).toBe(true);
    // No gh call on the local path.
    expect(calls.some((c) => c.bin === 'gh' && c.args[1] === 'merge')).toBe(false);
    expect(transitions.map((t) => t.to)).toEqual(['merging', 'merged']);
  });

  it('a failed local merge aborts, returns to awaiting_review, and stays re-mergeable', async () => {
    const { exec, calls } = makeExec({
      'git remote get-url origin': { fail: 'no such remote' },
      'git status --porcelain': { stdout: '' },
      'git worktree list --porcelain': { stdout: 'worktree /tmp/main-repo\n' },
      'git merge --no-ff': { fail: 'CONFLICT (content): merge conflict' },
    });
    const { deps, transitions } = makeDeps(exec, makeWorkspace());

    await expect(mergeWorkspace(deps, 'ws_1', {})).rejects.toThrow(/merge failed/);
    // The half-done merge was aborted so the main tree is clean.
    expect(calls.some((c) => c.args.join(' ') === 'merge --abort')).toBe(true);
    // Re-mergeable: back to review with the truthful error on metadata.
    const last = transitions[transitions.length - 1];
    expect(last.to).toBe('awaiting_review');
    expect(String(last.metadata?.mergeError)).toContain('CONFLICT');
  });

  it('uses gh pr merge when origin is GitHub and gh is authenticated', async () => {
    const { exec, calls } = makeExec({
      'git remote get-url origin': { stdout: 'git@github.com:caelum0x/recoder.xyz.git' },
      'gh auth status': { stdout: 'Logged in' },
      'git status --porcelain': { stdout: '' },
    });
    const { deps, transitions } = makeDeps(exec, makeWorkspace());

    const result = await mergeWorkspace(deps, 'ws_1', { strategy: 'squash' });
    expect(result.merged).toBe(true);
    expect(calls.some((c) => c.bin === 'gh' && c.args.join(' ').startsWith('pr merge recoder/ws_1 --squash'))).toBe(true);
    // No local checkout/merge on the GitHub path.
    expect(calls.some((c) => c.bin === 'git' && c.args[0] === 'checkout')).toBe(false);
    expect(transitions.map((t) => t.to)).toEqual(['merging', 'merged']);
  });
});

describe('createWorkspacePr', () => {
  it('commits pending edits, pushes the branch, and opens the PR', async () => {
    const { exec, calls } = makeExec({
      'git status --porcelain': { stdout: '?? new-file.ts\n' },
      'gh pr create': { stdout: 'https://github.com/caelum0x/recoder.xyz/pull/42' },
    });
    const { deps, transitions } = makeDeps(exec, makeWorkspace());

    const result = await createWorkspacePr(deps, 'ws_1', { title: 'feat: the thing' });
    expect(result.url).toContain('/pull/42');
    expect(result.base).toBe('main');

    const lines = calls.map((c) => `${c.bin} ${c.args.join(' ')}`);
    expect(lines.some((l) => l.startsWith('git add -A'))).toBe(true);
    expect(lines.some((l) => l.startsWith('git push -u origin recoder/ws_1'))).toBe(true);
    expect(lines.some((l) => l.startsWith('gh pr create --head recoder/ws_1 --base main'))).toBe(true);
    // PR url recorded on metadata via the same-state advance.
    expect(transitions.some((t) => (t.metadata?.pr as { url?: string })?.url?.includes('/pull/42'))).toBe(true);
  });

  it('requires a title', async () => {
    const { exec } = makeExec({});
    const { deps } = makeDeps(exec, makeWorkspace());
    await expect(createWorkspacePr(deps, 'ws_1', { title: '  ' })).rejects.toThrow(/title is required/);
  });
});
