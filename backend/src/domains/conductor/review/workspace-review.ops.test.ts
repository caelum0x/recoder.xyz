/**
 * `workspaceDiff` base alignment (bd recoder-i5bg) — the diff the user REVIEWS
 * must be computed against the SAME base a hunk/file-discard reverse-applies
 * against (`resolveReviewBaseResolved`), so a confirmed hunk ordinal can never
 * anchor to a different diff.
 *
 * Proves (real git, real linked worktree): for a workspace whose `baseRef` is
 * unset OR the detached `HEAD` sentinel, `workspaceDiff` resolves the repo's REAL
 * integration base (`trunk`) — exactly what `resolveReviewBaseResolved` (the
 * discard resolver) returns — instead of the old `HEAD`, which for an
 * all-committed agent branch would have shown an EMPTY diff. For a workspace with
 * a concrete `baseRef` the ref is passed through untouched (no re-resolution).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type { ConductorSubstrate } from '../ports/index.js';
import {
  workspaceDiff,
  resolveReviewBaseResolved,
  type ReviewOpsDeps,
} from './workspace-review.ops.js';

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
    workspaceId: 'ws-review',
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

/**
 * A substrate stub whose `diff` runs REAL git against whatever base the op hands
 * it, and records that base — so the test can assert BOTH the ref chosen and the
 * resulting patch. Everything else is unused by `workspaceDiff`.
 */
function recordingSubstrate(capturedBases: string[]): ConductorSubstrate {
  return {
    async diff(handle: { worktreePath?: string }, base: string) {
      capturedBases.push(base);
      const wt = handle.worktreePath as string;
      const patch = git(wt, ['diff', base]);
      const names = git(wt, ['diff', '--name-only', base]).split('\n').filter(Boolean);
      const stat = git(wt, ['diff', '--stat', base]);
      return { stat, patch, untracked: [], changedFiles: names.length };
    },
  } as unknown as ConductorSubstrate;
}

describe('workspaceDiff base alignment (real git)', () => {
  let root: string;
  let repo: string;
  let wt: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'recoder-review-'));
    repo = path.join(root, 'repo');
    mkdirSync(repo);
    git(repo, ['init']);
    // A NON-'main' default branch, so a correct resolve is distinguishable from
    // the literal-'main' last resort of the sync resolveReviewBase.
    git(repo, ['checkout', '-b', 'trunk']);
    writeFileSync(path.join(repo, 'mod.txt'), 'base-mod\n');
    writeFileSync(path.join(repo, 'del.txt'), 'base-del\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'base']);
    git(repo, ['tag', 'v0', 'trunk']); // a concrete ref for the pass-through case
    // The agent branch lives in a REAL linked worktree off trunk; its edits are
    // COMMITTED (the continue/publish flow commits agent work) — so `git diff
    // HEAD` in the worktree is EMPTY while `git diff trunk` shows the real work.
    wt = path.join(root, 'wt');
    git(repo, ['worktree', 'add', wt, '-b', 'work']);
    writeFileSync(path.join(wt, 'mod.txt'), 'agent-mod\n');
    writeFileSync(path.join(wt, 'added.txt'), 'agent-new\n');
    rmSync(path.join(wt, 'del.txt'));
    git(wt, ['add', '-A']);
    git(wt, ['commit', '-m', 'agent']);
  });

  afterEach(() => {
    // Detach the linked worktree before removing the tree git tracks it in.
    try {
      git(repo, ['worktree', 'remove', '--force', wt]);
    } catch {
      /* best-effort cleanup */
    }
    rmSync(root, { recursive: true, force: true });
  });

  for (const [label, baseRef] of [
    ['unset', undefined],
    ["detached 'HEAD'", 'HEAD'],
  ] as const) {
    it(`resolves the repo default (trunk) — not HEAD — for a ${label} baseRef, matching the discard resolver`, async () => {
      const captured: string[] = [];
      const ws = makeWs({ worktreePath: wt, baseRef });
      const d: ReviewOpsDeps = {
        getWorkspace: async () => ws,
        advanceWorkspace: async () => ws,
        getSubstrate: () => recordingSubstrate(captured),
        logger: noopLogger,
      } as unknown as ReviewOpsDeps;

      // The base the DISCARD edges reverse-apply against for this same workspace.
      const discardBase = await resolveReviewBaseResolved(d, ws);
      expect(discardBase).toBe('trunk');

      const view = await workspaceDiff(d, ws.workspaceId);

      // The diff was computed against the discard base — one shared base.
      expect(captured).toEqual(['trunk']);
      expect(view.baseRef).toBe('trunk');
      expect(view.baseRef).toBe(discardBase);

      // The rendered patch is the real agent work (the OLD `HEAD` base would have
      // been an EMPTY diff for this all-committed branch), and its hunks match
      // exactly what a discard of `mod.txt` would reverse-apply (`git diff trunk`).
      expect(view.changedFiles).toBeGreaterThan(0);
      expect(view.patch).toContain('agent-mod');
      const discardHunk = git(wt, ['diff', discardBase, '--', 'mod.txt']);
      expect(view.patch).toContain(discardHunk.split('\n').find((l) => l.startsWith('@@')) as string);

      // Sanity: the old behavior really would have differed (empty diff vs HEAD).
      expect(git(wt, ['diff', 'HEAD']).trim()).toBe('');
    });
  }

  it('passes a concrete baseRef through unchanged (no re-resolution)', async () => {
    const captured: string[] = [];
    const ws = makeWs({ worktreePath: wt, baseRef: 'v0' });
    const d: ReviewOpsDeps = {
      getWorkspace: async () => ws,
      advanceWorkspace: async () => ws,
      getSubstrate: () => recordingSubstrate(captured),
      logger: noopLogger,
    } as unknown as ReviewOpsDeps;

    const view = await workspaceDiff(d, ws.workspaceId);

    // The concrete ref is used verbatim — NOT re-resolved to the default branch.
    expect(captured).toEqual(['v0']);
    expect(view.baseRef).toBe('v0');
    expect(await resolveReviewBaseResolved(d, ws)).toBe('v0');
  });

  it('advances a running workspace to awaiting_review with the changed-file count', async () => {
    const captured: string[] = [];
    const ws = makeWs({ worktreePath: wt, baseRef: undefined, state: 'running' });
    const advances: { to: string; metadata?: Record<string, unknown> }[] = [];
    const d: ReviewOpsDeps = {
      getWorkspace: async () => ws,
      advanceWorkspace: async (_id: string, to: string, _patch: unknown, metadata?: Record<string, unknown>) => {
        advances.push({ to, metadata });
        return ws;
      },
      getSubstrate: () => recordingSubstrate(captured),
      logger: noopLogger,
    } as unknown as ReviewOpsDeps;

    const view = await workspaceDiff(d, ws.workspaceId);

    expect(captured).toEqual(['trunk']);
    expect(advances).toHaveLength(1);
    expect(advances[0].to).toBe('awaiting_review');
    expect(advances[0].metadata).toEqual({ changedFiles: view.changedFiles });
  });
});
