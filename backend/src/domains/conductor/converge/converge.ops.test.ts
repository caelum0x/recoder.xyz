/**
 * Convergence compose (product step 2 → 3) — materialize a plan into a NEW
 * convergence worktree/branch via real host git.
 *
 * Proves (real git): a whole-file pick copies each winning sibling's version into a
 * fresh worktree off base — a non-contested file from its sole author, a contested
 * file from the SELECTED sibling, a base-only file untouched, and a winning-source
 * DELETION reflected as a removal — then commits a reviewable branch and registers
 * a workspace stamped with the per-file convergence provenance (→ evidence).
 *
 * Proves (degrade, no git): <2 candidates / no changed files / a source with no
 * worktree all throw {@link EmptyConvergenceError}; an unresolved contested path
 * throws {@link UnresolvedConvergenceError} BEFORE any git runs.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import {
  composeConvergence,
  EmptyConvergenceError,
  UnresolvedConvergenceError,
  type ConvergeOpsDeps,
} from './converge.ops.js';

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Logger;

function git(cwd: string, args: string[]): void {
  execFileSync('git', ['-c', 'user.email=t@t.dev', '-c', 'user.name=T', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    stdio: 'pipe',
  });
}

function makeWs(over: Partial<Workspace> & { workspaceId: string; worktreePath?: string }): Workspace {
  return {
    spaceId: 's',
    projectId: 'p',
    taskId: 'task-1',
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: `b-${over.workspaceId}`,
    baseRef: 'main',
    state: 'awaiting_review',
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    metadata: {},
    ...over,
  } as Workspace;
}

describe('composeConvergence (degrade / validation, no git)', () => {
  function fakeDeps(
    siblings: readonly { workspaceId: string; agent: string; changedFiles?: readonly string[] }[],
    workspaces: Record<string, Workspace | null> = {},
  ): ConvergeOpsDeps {
    return {
      compare: async () => ({ count: siblings.length, siblings }),
      getWorkspace: async (id) => workspaces[id] ?? null,
      registerWorkspace: async (ws) => ws,
      logger: noopLogger,
    };
  }

  it('throws EmptyConvergenceError when the group has <2 candidates', async () => {
    const deps = fakeDeps([{ workspaceId: 'ws-a', agent: 'claude_code', changedFiles: ['a.ts'] }]);
    await expect(composeConvergence(deps, { taskGroup: 'g', selection: {}, createdBy: 'u' })).rejects.toBeInstanceOf(
      EmptyConvergenceError,
    );
  });

  it('throws EmptyConvergenceError when there are no changed files', async () => {
    const deps = fakeDeps([
      { workspaceId: 'ws-a', agent: 'claude_code', changedFiles: [] },
      { workspaceId: 'ws-b', agent: 'codex', changedFiles: [] },
    ]);
    await expect(composeConvergence(deps, { taskGroup: 'g', selection: {}, createdBy: 'u' })).rejects.toBeInstanceOf(
      EmptyConvergenceError,
    );
  });

  it('throws UnresolvedConvergenceError for a contested path with no selection (before any git)', async () => {
    const deps = fakeDeps([
      { workspaceId: 'ws-a', agent: 'claude_code', changedFiles: ['shared.ts'] },
      { workspaceId: 'ws-b', agent: 'codex', changedFiles: ['shared.ts'] },
    ]);
    await expect(composeConvergence(deps, { taskGroup: 'g', selection: {}, createdBy: 'u' })).rejects.toBeInstanceOf(
      UnresolvedConvergenceError,
    );
  });

  it('throws EmptyConvergenceError when a winning source has no worktree', async () => {
    const deps = fakeDeps(
      [
        { workspaceId: 'ws-a', agent: 'claude_code', changedFiles: ['a.ts'] },
        { workspaceId: 'ws-b', agent: 'codex', changedFiles: ['b.ts'] },
      ],
      { 'ws-a': makeWs({ workspaceId: 'ws-a' }), 'ws-b': makeWs({ workspaceId: 'ws-b' }) }, // no worktreePath
    );
    await expect(composeConvergence(deps, { taskGroup: 'g', selection: {}, createdBy: 'u' })).rejects.toBeInstanceOf(
      EmptyConvergenceError,
    );
  });
});

describe('composeConvergence (real git materialize)', () => {
  let root: string;
  let repo: string;
  let wtA: string;
  let wtB: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'recoder-converge-'));
    repo = path.join(root, 'repo');
    mkdirSync(repo, { recursive: true });
    git(repo, ['init', '-b', 'main']);
    writeFileSync(path.join(repo, 'keep.ts'), 'base-keep\n');
    writeFileSync(path.join(repo, 'shared.ts'), 'base-shared\n');
    writeFileSync(path.join(repo, 'del.ts'), 'base-del\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'base']);

    // Two sibling worktrees off main; agents EDIT (uncommitted, on disk).
    wtA = path.join(root, 'wt-a');
    wtB = path.join(root, 'wt-b');
    git(repo, ['worktree', 'add', '-b', 'agent-a', wtA, 'main']);
    git(repo, ['worktree', 'add', '-b', 'agent-b', wtB, 'main']);

    // ws-a: adds a.ts, edits shared.ts.
    writeFileSync(path.join(wtA, 'a.ts'), 'from-a\n');
    writeFileSync(path.join(wtA, 'shared.ts'), 'shared-by-a\n');
    // ws-b: adds b.ts, edits shared.ts differently, DELETES del.ts.
    writeFileSync(path.join(wtB, 'b.ts'), 'from-b\n');
    writeFileSync(path.join(wtB, 'shared.ts'), 'shared-by-b\n');
    rmSync(path.join(wtB, 'del.ts'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function realDeps(registered: { ws?: Workspace }): ConvergeOpsDeps {
    const workspaces: Record<string, Workspace> = {
      'ws-a': makeWs({ workspaceId: 'ws-a', worktreePath: wtA, branch: 'agent-a' }),
      'ws-b': makeWs({ workspaceId: 'ws-b', worktreePath: wtB, branch: 'agent-b' }),
    };
    return {
      compare: async () => ({
        count: 2,
        siblings: [
          { workspaceId: 'ws-a', agent: 'claude_code', changedFiles: ['a.ts', 'shared.ts'] },
          { workspaceId: 'ws-b', agent: 'codex', changedFiles: ['b.ts', 'shared.ts', 'del.ts'] },
        ],
      }),
      getWorkspace: async (id) => workspaces[id] ?? null,
      registerWorkspace: async (ws) => {
        registered.ws = ws;
        return ws;
      },
      logger: noopLogger,
      // Deterministic id so the branch/worktree path is predictable in-test.
      newId: () => 'deadbeefcafef00d',
    };
  }

  it('materializes the winning file versions into a committed convergence worktree', async () => {
    const registered: { ws?: Workspace } = {};
    const result = await composeConvergence(realDeps(registered), {
      taskGroup: 'grp-1',
      selection: { 'shared.ts': 'ws-b' }, // choose B's shared.ts
      createdBy: 'user-1',
    });

    expect(result.fileCount).toBe(4); // a.ts, b.ts, shared.ts, del.ts
    expect(result.base).toBe('main');
    const wt = result.workspace.worktreePath!;
    expect(existsSync(wt)).toBe(true);

    // Non-contested files from their sole authors.
    expect(readFileSync(path.join(wt, 'a.ts'), 'utf8')).toBe('from-a\n');
    expect(readFileSync(path.join(wt, 'b.ts'), 'utf8')).toBe('from-b\n');
    // Contested shared.ts came from the SELECTED sibling (B).
    expect(readFileSync(path.join(wt, 'shared.ts'), 'utf8')).toBe('shared-by-b\n');
    // Base-only file untouched.
    expect(readFileSync(path.join(wt, 'keep.ts'), 'utf8')).toBe('base-keep\n');
    // A winning-source deletion is reflected as a removal.
    expect(existsSync(path.join(wt, 'del.ts'))).toBe(false);

    // The convergence was committed onto its branch (clean worktree, 2 commits).
    const status = execFileSync('git', ['-C', wt, 'status', '--porcelain'], { encoding: 'utf8' });
    expect(status.trim()).toBe('');
    const log = execFileSync('git', ['-C', wt, 'log', '--oneline'], { encoding: 'utf8' });
    expect(log.split('\n').filter(Boolean).length).toBe(2); // base + converge commit
  });

  it('registers a reviewable workspace stamped with per-file convergence provenance', async () => {
    const registered: { ws?: Workspace } = {};
    await composeConvergence(realDeps(registered), {
      taskGroup: 'grp-1',
      selection: { 'shared.ts': 'ws-a' },
      createdBy: 'user-1',
    });

    const ws = registered.ws!;
    expect(ws.state).toBe('awaiting_review');
    expect(ws.workspaceId.startsWith('ws_')).toBe(true);
    expect(ws.sessionName).toBeUndefined();
    expect(ws.runId).toBeUndefined();
    // NOT re-listed as a sibling of the source group (own singleton).
    expect((ws.metadata as Record<string, unknown>).taskGroup).toBeUndefined();
    expect((ws.metadata as Record<string, unknown>).convergedFromTaskGroup).toBe('grp-1');

    const conv = (ws.metadata as Record<string, unknown>).convergence as {
      fromTaskGroup: string;
      sourceCount: number;
      fileCount: number;
      selections: { path: string; sourceWorkspaceId: string; contested: boolean }[];
    };
    expect(conv.fromTaskGroup).toBe('grp-1');
    expect(conv.fileCount).toBe(4);
    const shared = conv.selections.find((s) => s.path === 'shared.ts');
    expect(shared).toEqual({ path: 'shared.ts', sourceWorkspaceId: 'ws-a', contested: true });
    const aFile = conv.selections.find((s) => s.path === 'a.ts');
    expect(aFile).toEqual({ path: 'a.ts', sourceWorkspaceId: 'ws-a', contested: false });
  });
});
