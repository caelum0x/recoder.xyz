/**
 * Local-merge delivery in `mergeWorkspace` (the common desktop/no-remote case)
 * honors the `strategy` truthfully — real git, no GitHub remote:
 *
 *   (a) default (squash): Apply lands as exactly ONE squashed commit on the base
 *       branch — single parent, combined content present, branch named in the
 *       message (docs/DESIGN-REFERENCE.md §6 "Apply = single squashed commit");
 *   (b) 'merge': the explicit two-parent merge commit stays available;
 *   (c) a CONFLICTED squash rejects truthfully AND leaves the main tree CLEAN
 *       on base — no staged half-merge, no MERGE_HEAD, no dirty files;
 *   (d) squashing an already-merged branch is a truthful no-op success — no
 *       empty commit, no throw.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import { mergeWorkspace, type PublishOpsDeps } from './workspace-publish.ops.js';

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Logger;

function git(cwd: string, args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.email=t@t.dev', '-c', 'user.name=T', '-c', 'commit.gpgsign=false', ...args],
    { cwd, stdio: 'pipe' },
  ).toString();
}

function makeWs(over: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws-publish',
    spaceId: 's',
    projectId: 'p',
    taskId: 'task-1',
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: 'work',
    baseRef: 'main',
    state: 'awaiting_review',
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    metadata: {},
    ...over,
  } as Workspace;
}

/** In-memory workspace store: getWorkspace/advanceWorkspace with no state-machine. */
function makeDeps(initial: Workspace): PublishOpsDeps {
  let ws = initial;
  return {
    getWorkspace: async () => ws,
    advanceWorkspace: async (_id, to, patch, metadata) => {
      ws = {
        ...ws,
        ...patch,
        state: to,
        metadata: { ...ws.metadata, ...(metadata ?? {}) },
      } as Workspace;
      return ws;
    },
    logger: noopLogger,
  };
}

describe('mergeWorkspace — local merge path (real git, no remote)', () => {
  let root: string;
  let repo: string;
  let wt: string;
  let ws: Workspace;
  let deps: PublishOpsDeps;

  const commitCount = (ref: string): number =>
    Number(git(repo, ['rev-list', '--count', ref]).trim());
  const parentsOf = (ref: string): string[] =>
    git(repo, ['log', '-1', '--pretty=%P', ref]).trim().split(/\s+/).filter(Boolean);

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'recoder-publish-'));
    repo = path.join(root, 'repo');
    wt = path.join(root, 'wt');
    mkdirSync(repo);
    git(repo, ['init']);
    git(repo, ['checkout', '-b', 'main']);
    writeFileSync(path.join(repo, 'base.txt'), 'base\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'base']);
    // Linked worktree on the agent branch, with two committed agent changes.
    git(repo, ['worktree', 'add', '-b', 'work', wt]);
    writeFileSync(path.join(wt, 'feature-a.txt'), 'agent-a\n');
    git(wt, ['add', '-A']);
    git(wt, ['commit', '-m', 'agent a']);
    writeFileSync(path.join(wt, 'feature-b.txt'), 'agent-b\n');
    git(wt, ['add', '-A']);
    git(wt, ['commit', '-m', 'agent b']);
    ws = makeWs({ worktreePath: wt });
    deps = makeDeps(ws);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('(a) default strategy lands as ONE squashed commit (single parent) on base', async () => {
    const before = commitCount('main');

    const view = await mergeWorkspace(deps, ws.workspaceId);

    expect(view.merged).toBe(true);
    expect(view.mergeMode).toBe('local');
    // Exactly one NEW commit on base, with a single parent — not a merge commit.
    expect(commitCount('main')).toBe(before + 1);
    expect(parentsOf('main')).toHaveLength(1);
    expect(git(repo, ['log', '-1', '--pretty=%s', 'main'])).toContain('work');
    // The combined agent content landed in the user's folder.
    expect(readFileSync(path.join(repo, 'feature-a.txt'), 'utf8')).toBe('agent-a\n');
    expect(readFileSync(path.join(repo, 'feature-b.txt'), 'utf8')).toBe('agent-b\n');
    expect(git(repo, ['status', '--porcelain']).trim()).toBe('');
  });

  it("(b) strategy 'merge' still produces an explicit two-parent merge commit", async () => {
    const before = commitCount('main');

    const view = await mergeWorkspace(deps, ws.workspaceId, { strategy: 'merge' });

    expect(view.merged).toBe(true);
    expect(parentsOf('main')).toHaveLength(2);
    // A --no-ff merge commit adds one commit on top of both histories.
    expect(commitCount('main')).toBe(before + 2 + 1);
    expect(readFileSync(path.join(repo, 'feature-a.txt'), 'utf8')).toBe('agent-a\n');
  });

  it('(c) a conflicted squash rejects AND leaves the main tree clean on base', async () => {
    // Conflicting add/add: the same file lands with different content on both sides.
    writeFileSync(path.join(repo, 'conflict.txt'), 'main-version\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'main conflict side']);
    writeFileSync(path.join(wt, 'conflict.txt'), 'agent-version\n');
    git(wt, ['add', '-A']);
    git(wt, ['commit', '-m', 'agent conflict side']);
    const before = commitCount('main');

    await expect(mergeWorkspace(deps, ws.workspaceId, { strategy: 'squash' })).rejects.toThrow(
      /merge failed/,
    );

    // Invariant: the main tree is CLEAN on base — never a half-merged folder.
    expect(git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']).trim()).toBe('main');
    expect(git(repo, ['status', '--porcelain']).trim()).toBe('');
    expect(git(repo, ['diff', '--cached', '--name-only']).trim()).toBe('');
    expect(existsSync(path.join(repo, '.git', 'MERGE_HEAD'))).toBe(false);
    expect(commitCount('main')).toBe(before);
    expect(readFileSync(path.join(repo, 'conflict.txt'), 'utf8')).toBe('main-version\n');
  });

  it('(d) squashing an already-merged branch is a truthful no-op — no empty commit', async () => {
    git(repo, ['merge', 'work']); // fast-forward: base already contains the branch
    const before = commitCount('main');
    const headBefore = git(repo, ['rev-parse', 'HEAD']).trim();

    const view = await mergeWorkspace(deps, ws.workspaceId);

    expect(view.merged).toBe(true);
    expect(view.mergeMode).toBe('local');
    expect(commitCount('main')).toBe(before);
    expect(git(repo, ['rev-parse', 'HEAD']).trim()).toBe(headBefore);
    expect(git(repo, ['status', '--porcelain']).trim()).toBe('');
  });
});
