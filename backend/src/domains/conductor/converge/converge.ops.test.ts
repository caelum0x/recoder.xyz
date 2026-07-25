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
import { SYNTHESIZE_SELECTION } from './converge-plan.service.js';

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
      selections: {
        path: string;
        mode: 'pick' | 'synthesize';
        sourceWorkspaceId?: string;
        contributors?: string[];
        contested: boolean;
      }[];
    };
    expect(conv.fromTaskGroup).toBe('grp-1');
    expect(conv.fileCount).toBe(4);
    const shared = conv.selections.find((s) => s.path === 'shared.ts');
    expect(shared).toEqual({ path: 'shared.ts', mode: 'pick', sourceWorkspaceId: 'ws-a', contested: true });
    const aFile = conv.selections.find((s) => s.path === 'a.ts');
    expect(aFile).toEqual({ path: 'a.ts', mode: 'pick', sourceWorkspaceId: 'ws-a', contested: false });
  });
});

/**
 * Intra-file 3-way SYNTHESIS — two (or more) agents editing the SAME file are
 * line-level merged against base, not whole-file-picked.
 *
 * Proves (real git): non-overlapping edits to one file → CLEAN synthesize (both
 * edits present, no markers, committed); overlapping edits to the same lines →
 * `synthesize-conflict` → the compose aborts (nothing registered, worktree cleaned)
 * so the caller re-picks; a mixed pick+synthesize plan composes; and the N-way fold
 * (sorted by workspaceId) cleanly folds 3 non-overlapping siblings.
 */
describe('composeConvergence (intra-file 3-way synthesize, real git)', () => {
  let root: string;
  let repo: string;
  const BASE_LINES = ['l1', 'l2', 'l3', 'l4', 'l5', ''];

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'recoder-synth-'));
    repo = path.join(root, 'repo');
    mkdirSync(repo, { recursive: true });
    git(repo, ['init', '-b', 'main']);
    writeFileSync(path.join(repo, 'shared.ts'), BASE_LINES.join('\n'));
    writeFileSync(path.join(repo, 'keep.ts'), 'keep\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'base']);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** Add a sibling worktree off main and apply a line mutation to shared.ts. */
  function addSibling(id: string, mutate: (lines: string[]) => void, extra?: Record<string, string>): string {
    const wt = path.join(root, id);
    git(repo, ['worktree', 'add', '-b', `agent-${id}`, wt, 'main']);
    const lines = [...BASE_LINES];
    mutate(lines);
    writeFileSync(path.join(wt, 'shared.ts'), lines.join('\n'));
    for (const [rel, content] of Object.entries(extra ?? {})) writeFileSync(path.join(wt, rel), content);
    return wt;
  }

  function deps(
    siblings: readonly { id: string; wt: string; changed: readonly string[] }[],
    registered: { ws?: Workspace },
  ): ConvergeOpsDeps {
    const workspaces: Record<string, Workspace> = Object.fromEntries(
      siblings.map((s) => [s.id, makeWs({ workspaceId: s.id, worktreePath: s.wt, branch: `agent-${s.id}` })]),
    );
    return {
      compare: async () => ({
        count: siblings.length,
        siblings: siblings.map((s) => ({ workspaceId: s.id, agent: 'a', changedFiles: s.changed })),
      }),
      getWorkspace: async (id) => workspaces[id] ?? null,
      registerWorkspace: async (ws) => {
        registered.ws = ws;
        return ws;
      },
      logger: noopLogger,
      newId: () => 'synth000',
    };
  }

  it('cleanly synthesizes non-overlapping edits to the same file (both edits, no markers)', async () => {
    const wtA = addSibling('ws-a', (L) => (L[0] = 'l1-from-A'));
    const wtB = addSibling('ws-b', (L) => (L[4] = 'l5-from-B'));
    const registered: { ws?: Workspace } = {};

    const result = await composeConvergence(
      deps(
        [
          { id: 'ws-a', wt: wtA, changed: ['shared.ts'] },
          { id: 'ws-b', wt: wtB, changed: ['shared.ts'] },
        ],
        registered,
      ),
      { taskGroup: 'g', selection: { 'shared.ts': SYNTHESIZE_SELECTION }, createdBy: 'u' },
    );

    const wt = result.workspace.worktreePath!;
    const content = readFileSync(path.join(wt, 'shared.ts'), 'utf8');
    expect(content).toContain('l1-from-A');
    expect(content).toContain('l5-from-B');
    expect(content).not.toContain('<<<<<<<');
    // Committed clean (no lingering worktree changes).
    expect(execFileSync('git', ['-C', wt, 'status', '--porcelain'], { encoding: 'utf8' }).trim()).toBe('');

    const sel = (
      (registered.ws!.metadata as Record<string, unknown>).convergence as {
        selections: { path: string; mode: string; contributors?: string[]; sourceWorkspaceId?: string }[];
      }
    ).selections.find((s) => s.path === 'shared.ts')!;
    expect(sel.mode).toBe('synthesize');
    expect(sel.contributors).toEqual(['ws-a', 'ws-b']);
    expect(sel.sourceWorkspaceId).toBeUndefined();
  });

  it('flips overlapping same-line edits to synthesize-conflict and aborts (nothing written)', async () => {
    const wtA = addSibling('ws-a', (L) => (L[2] = 'l3-from-A'));
    const wtB = addSibling('ws-b', (L) => (L[2] = 'l3-from-B'));
    const registered: { ws?: Workspace } = {};

    await expect(
      composeConvergence(
        deps(
          [
            { id: 'ws-a', wt: wtA, changed: ['shared.ts'] },
            { id: 'ws-b', wt: wtB, changed: ['shared.ts'] },
          ],
          registered,
        ),
        { taskGroup: 'g', selection: { 'shared.ts': SYNTHESIZE_SELECTION }, createdBy: 'u' },
      ),
    ).rejects.toMatchObject({
      name: 'UnresolvedConvergenceError',
      plan: { complete: false },
    });

    // Nothing registered, and the partial convergence worktree was cleaned up.
    expect(registered.ws).toBeUndefined();
    expect(existsSync(path.join(root, 'repo-converge-synth000'))).toBe(false);
  });

  it('carries the synthesize-conflict reason on the thrown plan', async () => {
    const wtA = addSibling('ws-a', (L) => (L[2] = 'x'));
    const wtB = addSibling('ws-b', (L) => (L[2] = 'y'));
    const registered: { ws?: Workspace } = {};
    try {
      await composeConvergence(
        deps(
          [
            { id: 'ws-a', wt: wtA, changed: ['shared.ts'] },
            { id: 'ws-b', wt: wtB, changed: ['shared.ts'] },
          ],
          registered,
        ),
        { taskGroup: 'g', selection: { 'shared.ts': SYNTHESIZE_SELECTION }, createdBy: 'u' },
      );
      throw new Error('expected a synthesize conflict');
    } catch (err) {
      expect(err).toBeInstanceOf(UnresolvedConvergenceError);
      const plan = (err as UnresolvedConvergenceError).plan;
      const u = plan.unresolved.find((x) => x.path === 'shared.ts');
      expect(u?.reason).toBe('synthesize-conflict');
      expect(u?.candidates).toEqual(['ws-a', 'ws-b']);
    }
  });

  it('composes a MIXED plan: one synthesize + one pick', async () => {
    const wtA = addSibling('ws-a', (L) => (L[0] = 'l1-A'), { 'a.ts': 'only-in-a\n' });
    const wtB = addSibling('ws-b', (L) => (L[4] = 'l5-B'));
    const registered: { ws?: Workspace } = {};

    const result = await composeConvergence(
      deps(
        [
          { id: 'ws-a', wt: wtA, changed: ['shared.ts', 'a.ts'] },
          { id: 'ws-b', wt: wtB, changed: ['shared.ts'] },
        ],
        registered,
      ),
      { taskGroup: 'g', selection: { 'shared.ts': SYNTHESIZE_SELECTION }, createdBy: 'u' },
    );

    const wt = result.workspace.worktreePath!;
    const shared = readFileSync(path.join(wt, 'shared.ts'), 'utf8');
    expect(shared).toContain('l1-A');
    expect(shared).toContain('l5-B');
    expect(readFileSync(path.join(wt, 'a.ts'), 'utf8')).toBe('only-in-a\n'); // non-contested pick
  });

  it('N-way fold (sorted by workspaceId) cleanly merges 3 non-overlapping siblings', async () => {
    const wtA = addSibling('ws-a', (L) => (L[0] = 'l1-A'));
    const wtB = addSibling('ws-b', (L) => (L[2] = 'l3-B'));
    const wtC = addSibling('ws-c', (L) => (L[4] = 'l5-C'));
    const registered: { ws?: Workspace } = {};

    const result = await composeConvergence(
      deps(
        [
          { id: 'ws-a', wt: wtA, changed: ['shared.ts'] },
          { id: 'ws-b', wt: wtB, changed: ['shared.ts'] },
          { id: 'ws-c', wt: wtC, changed: ['shared.ts'] },
        ],
        registered,
      ),
      { taskGroup: 'g', selection: { 'shared.ts': SYNTHESIZE_SELECTION }, createdBy: 'u' },
    );

    const content = readFileSync(path.join(result.workspace.worktreePath!, 'shared.ts'), 'utf8');
    expect(content).toContain('l1-A');
    expect(content).toContain('l3-B');
    expect(content).toContain('l5-C');
    expect(content).not.toContain('<<<<<<<');

    const sel = (
      (registered.ws!.metadata as Record<string, unknown>).convergence as {
        selections: { path: string; contributors?: string[] }[];
      }
    ).selections.find((s) => s.path === 'shared.ts')!;
    expect(sel.contributors).toEqual(['ws-a', 'ws-b', 'ws-c']); // deterministic sorted fold order
  });
});
