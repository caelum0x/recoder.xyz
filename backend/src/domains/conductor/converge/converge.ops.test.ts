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
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import {
  composeConvergence,
  parseConflictRegions,
  probeSynthesizability,
  EmptyConvergenceError,
  UnresolvedConvergenceError,
  MAX_ASSIST_FILE_BYTES,
  MAX_ASSIST_PROMPT_BYTES,
  MAX_CONFLICT_REGIONS,
  MAX_CONFLICT_SIDE_LINES,
  type ConvergeInferenceFn,
  type ConvergeOpsDeps,
} from './converge.ops.js';
import { ASSISTED_SELECTION, SYNTHESIZE_SELECTION } from './converge-plan.service.js';

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

/**
 * LLM-ASSISTED synthesis — a contested file the mechanical 3-way CANNOT merge is
 * escalated (explicit per-file opt-in) to a one-shot inference, whose reply is
 * validated before it is trusted.
 *
 * Proves (real git + fake inference): a VALID reply lands as the file content with
 * `plan.assisted` + provenance recording the model-authored path (incl. the
 * inference id); an INVALID reply (dropped agreed line / conflict markers / a bare
 * `=======` separator / empty), a `routed:false` gateway, an UNWIRED inference dep,
 * a missing function name, and an over-cap payload (per-version / total prompt
 * bytes) all fall back to the exact mechanical `synthesize-conflict` abort WITHOUT
 * calling the model; the call addresses the INJECTED function name; a
 * mechanically-clean assisted file never calls the model; and the plain
 * `synthesize` + `pick` paths never touch inference.
 */
describe('composeConvergence (LLM-assisted synthesize, real git + fake inference)', () => {
  let root: string;
  let repo: string;
  const BASE_LINES = ['l1', 'l2', 'l3', 'l4', 'l5', ''];
  const VALID_MERGE = 'l1\nl2\nl3-merged\nl4\nl5\n';

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'recoder-assist-'));
    repo = path.join(root, 'repo');
    mkdirSync(repo, { recursive: true });
    git(repo, ['init', '-b', 'main']);
    writeFileSync(path.join(repo, 'shared.ts'), BASE_LINES.join('\n'));
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'base']);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** Two siblings whose same-line edits make the mechanical 3-way CONFLICT. */
  function addConflictingSiblings(): { wtA: string; wtB: string } {
    const wtA = path.join(root, 'ws-a');
    const wtB = path.join(root, 'ws-b');
    git(repo, ['worktree', 'add', '-b', 'agent-a', wtA, 'main']);
    git(repo, ['worktree', 'add', '-b', 'agent-b', wtB, 'main']);
    const linesA = [...BASE_LINES];
    const linesB = [...BASE_LINES];
    linesA[2] = 'l3-from-A';
    linesB[2] = 'l3-from-B';
    writeFileSync(path.join(wtA, 'shared.ts'), linesA.join('\n'));
    writeFileSync(path.join(wtB, 'shared.ts'), linesB.join('\n'));
    return { wtA, wtB };
  }

  /** The function name the composition layer injects (the ops never hardcode one). */
  const FUNCTION_NAME = 'recoder_default';

  function deps(
    worktrees: { wtA: string; wtB: string },
    registered: { ws?: Workspace },
    inference?: ConvergeInferenceFn,
    opts?: { readonly changedFile?: string; readonly over?: Partial<ConvergeOpsDeps> },
  ): ConvergeOpsDeps {
    const changed = opts?.changedFile ?? 'shared.ts';
    const workspaces: Record<string, Workspace> = {
      'ws-a': makeWs({ workspaceId: 'ws-a', worktreePath: worktrees.wtA, branch: 'agent-a' }),
      'ws-b': makeWs({ workspaceId: 'ws-b', worktreePath: worktrees.wtB, branch: 'agent-b' }),
    };
    return {
      compare: async () => ({
        count: 2,
        siblings: [
          { workspaceId: 'ws-a', agent: 'claude_code', changedFiles: [changed] },
          { workspaceId: 'ws-b', agent: 'codex', changedFiles: [changed] },
        ],
      }),
      getWorkspace: async (id) => workspaces[id] ?? null,
      registerWorkspace: async (ws) => {
        registered.ws = ws;
        return ws;
      },
      logger: noopLogger,
      newId: () => 'assist00',
      ...(inference ? { inference, inferenceFunctionName: FUNCTION_NAME } : {}),
      ...opts?.over,
    };
  }

  const assistedInput = {
    taskGroup: 'g',
    selection: { 'shared.ts': ASSISTED_SELECTION },
    createdBy: 'u',
  };

  it('a VALID assisted reply resolves the conflict and is recorded on plan + provenance', async () => {
    const calls: Parameters<ConvergeInferenceFn>[0][] = [];
    const inference: ConvergeInferenceFn = async (input) => {
      calls.push(input);
      return { routed: true, inference_id: 'inf-1', content: VALID_MERGE };
    };
    const registered: { ws?: Workspace } = {};

    const result = await composeConvergence(
      deps(addConflictingSiblings(), registered, inference),
      assistedInput,
    );

    // The model's merged content landed, marker-free, and was committed.
    const wt = result.workspace.worktreePath!;
    expect(readFileSync(path.join(wt, 'shared.ts'), 'utf8')).toBe(VALID_MERGE);
    expect(execFileSync('git', ['-C', wt, 'status', '--porcelain'], { encoding: 'utf8' }).trim()).toBe('');

    // Recorded on the returned plan (evidence serializes the plan) + provenance.
    expect(result.plan.assisted).toEqual([{ path: 'shared.ts', inference_id: 'inf-1' }]);
    const conv = (registered.ws!.metadata as Record<string, unknown>).convergence as {
      selections: { path: string; mode: string; contributors?: string[] }[];
      assisted?: { path: string; inference_id?: string }[];
    };
    expect(conv.assisted).toEqual([{ path: 'shared.ts', inference_id: 'inf-1' }]);
    expect(conv.selections.find((s) => s.path === 'shared.ts')).toMatchObject({
      mode: 'assisted',
      contributors: ['ws-a', 'ws-b'],
    });

    // ONE call, addressed at the INJECTED function name (the ops own no name),
    // carrying the full context.
    expect(calls).toHaveLength(1);
    expect(calls[0].function_name).toBe(FUNCTION_NAME);
    const prompt = calls[0].input.messages[0].content as string;
    expect(prompt).toContain('shared.ts');
    expect(prompt).toContain('l3-from-A');
    expect(prompt).toContain('l3-from-B');
    expect(prompt).toContain('VERSION from ws-a');
    expect(prompt).toContain('VERSION from ws-b');
  });

  it('accepts a fence-wrapped reply (models add fences despite instructions)', async () => {
    const inference: ConvergeInferenceFn = async () => ({
      routed: true,
      inference_id: 'inf-2',
      content: '```ts\n' + VALID_MERGE + '```',
    });
    const registered: { ws?: Workspace } = {};
    const result = await composeConvergence(
      deps(addConflictingSiblings(), registered, inference),
      assistedInput,
    );
    expect(readFileSync(path.join(result.workspace.worktreePath!, 'shared.ts'), 'utf8')).toBe(VALID_MERGE);
    expect(result.plan.assisted).toEqual([{ path: 'shared.ts', inference_id: 'inf-2' }]);
  });

  async function expectFallbackToConflict(inference?: ConvergeInferenceFn): Promise<void> {
    const registered: { ws?: Workspace } = {};
    await expect(
      composeConvergence(deps(addConflictingSiblings(), registered, inference), assistedInput),
    ).rejects.toMatchObject({
      name: 'UnresolvedConvergenceError',
      plan: {
        complete: false,
        unresolved: [{ path: 'shared.ts', candidates: ['ws-a', 'ws-b'], reason: 'synthesize-conflict' }],
      },
    });
    // Nothing registered; the partial convergence worktree was cleaned up.
    expect(registered.ws).toBeUndefined();
    expect(existsSync(path.join(root, 'repo-converge-assist00'))).toBe(false);
  }

  it('a reply that DROPS an agreed line fails validation → synthesize-conflict abort', async () => {
    // 'l1' (agreed on by both sides) is missing — the model lost content.
    await expectFallbackToConflict(async () => ({
      routed: true,
      content: 'l2\nl3-merged\nl4\nl5\n',
    }));
  });

  it('a reply CONTAINING conflict markers fails validation → synthesize-conflict abort', async () => {
    await expectFallbackToConflict(async () => ({
      routed: true,
      content: 'l1\nl2\n<<<<<<< a\nl3-from-A\n=======\nl3-from-B\n>>>>>>> b\nl4\nl5\n',
    }));
  });

  it('a reply with a BARE ======= separator line fails validation → synthesize-conflict abort', async () => {
    // No open/close markers and every agreed line kept — only the naked separator
    // (a model echoing half a conflict region) betrays the reply.
    await expectFallbackToConflict(async () => ({
      routed: true,
      content: 'l1\nl2\n=======\nl3-merged\nl4\nl5\n',
    }));
  });

  it('inference wired WITHOUT a function name never calls the model → synthesize-conflict abort', async () => {
    let called = 0;
    const inference: ConvergeInferenceFn = async () => {
      called += 1;
      return { routed: true, content: VALID_MERGE };
    };
    const registered: { ws?: Workspace } = {};
    await expect(
      // `inference` injected via `over` so NO functionName rides along with it.
      composeConvergence(
        deps(addConflictingSiblings(), registered, undefined, { over: { inference } }),
        assistedInput,
      ),
    ).rejects.toMatchObject({ name: 'UnresolvedConvergenceError', plan: { complete: false } });
    expect(called).toBe(0);
    expect(registered.ws).toBeUndefined();
  });

  it('a contributor version over MAX_ASSIST_FILE_BYTES skips assist (no LLM call) → synthesize-conflict abort', async () => {
    const worktrees = addConflictingSiblings();
    // Push ws-b's version past the per-version cap while keeping the same-line conflict.
    const linesB = [...BASE_LINES];
    linesB[2] = 'l3-from-B';
    linesB.push('x'.repeat(MAX_ASSIST_FILE_BYTES));
    writeFileSync(path.join(worktrees.wtB, 'shared.ts'), linesB.join('\n'));

    let called = 0;
    const inference: ConvergeInferenceFn = async () => {
      called += 1;
      return { routed: true, content: VALID_MERGE };
    };
    const registered: { ws?: Workspace } = {};
    await expect(
      composeConvergence(deps(worktrees, registered, inference), assistedInput),
    ).rejects.toMatchObject({
      name: 'UnresolvedConvergenceError',
      plan: { complete: false, unresolved: [{ path: 'shared.ts', reason: 'synthesize-conflict' }] },
    });
    expect(called).toBe(0);
    expect(registered.ws).toBeUndefined();
  });

  it('a prompt over MAX_ASSIST_PROMPT_BYTES skips assist (no LLM call) → synthesize-conflict abort', async () => {
    // A HUGE base with small rewritten versions: every contributor version stays
    // UNDER the per-version cap, so only the TOTAL prompt cap (base + versions
    // + instructions) trips.
    writeFileSync(path.join(repo, 'big.ts'), `${'b'.repeat(MAX_ASSIST_PROMPT_BYTES)}\n`);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'big base']);
    const wtA = path.join(root, 'ws-a');
    const wtB = path.join(root, 'ws-b');
    git(repo, ['worktree', 'add', '-b', 'agent-a', wtA, 'main']);
    git(repo, ['worktree', 'add', '-b', 'agent-b', wtB, 'main']);
    writeFileSync(path.join(wtA, 'big.ts'), 'rewritten-by-A\n');
    writeFileSync(path.join(wtB, 'big.ts'), 'rewritten-by-B\n');

    let called = 0;
    const inference: ConvergeInferenceFn = async () => {
      called += 1;
      return { routed: true, content: VALID_MERGE };
    };
    const registered: { ws?: Workspace } = {};
    await expect(
      composeConvergence(deps({ wtA, wtB }, registered, inference, { changedFile: 'big.ts' }), {
        taskGroup: 'g',
        selection: { 'big.ts': ASSISTED_SELECTION },
        createdBy: 'u',
      }),
    ).rejects.toMatchObject({
      name: 'UnresolvedConvergenceError',
      plan: { complete: false, unresolved: [{ path: 'big.ts', reason: 'synthesize-conflict' }] },
    });
    expect(called).toBe(0);
    expect(registered.ws).toBeUndefined();
  });

  it('an EMPTY reply fails validation → synthesize-conflict abort', async () => {
    await expectFallbackToConflict(async () => ({ routed: true, content: '   \n' }));
  });

  it('routed:false (gateway unavailable) falls back → synthesize-conflict abort', async () => {
    await expectFallbackToConflict(async () => ({ routed: false, reason: 'gateway down' }));
  });

  it('an UNWIRED inference dep falls back → synthesize-conflict abort (mechanical behavior)', async () => {
    await expectFallbackToConflict(undefined);
  });

  it('a mechanically-CLEAN assisted file never calls the model (no assisted record)', async () => {
    // Non-overlapping edits: the 3-way folds clean, so no escalation happens.
    const wtA = path.join(root, 'ws-a');
    const wtB = path.join(root, 'ws-b');
    git(repo, ['worktree', 'add', '-b', 'agent-a', wtA, 'main']);
    git(repo, ['worktree', 'add', '-b', 'agent-b', wtB, 'main']);
    const linesA = [...BASE_LINES];
    const linesB = [...BASE_LINES];
    linesA[0] = 'l1-from-A';
    linesB[4] = 'l5-from-B';
    writeFileSync(path.join(wtA, 'shared.ts'), linesA.join('\n'));
    writeFileSync(path.join(wtB, 'shared.ts'), linesB.join('\n'));

    let called = 0;
    const inference: ConvergeInferenceFn = async () => {
      called += 1;
      return { routed: true, content: VALID_MERGE };
    };
    const registered: { ws?: Workspace } = {};
    const result = await composeConvergence(deps({ wtA, wtB }, registered, inference), assistedInput);

    expect(called).toBe(0);
    expect(result.plan.assisted).toBeUndefined();
    const content = readFileSync(path.join(result.workspace.worktreePath!, 'shared.ts'), 'utf8');
    expect(content).toContain('l1-from-A');
    expect(content).toContain('l5-from-B');
    const conv = (registered.ws!.metadata as Record<string, unknown>).convergence as {
      assisted?: unknown;
    };
    expect(conv.assisted).toBeUndefined();
  });

  it("a plain 'synthesize' conflict NEVER calls inference even when wired (path unchanged)", async () => {
    let called = 0;
    const inference: ConvergeInferenceFn = async () => {
      called += 1;
      return { routed: true, content: VALID_MERGE };
    };
    const registered: { ws?: Workspace } = {};
    await expect(
      composeConvergence(deps(addConflictingSiblings(), registered, inference), {
        taskGroup: 'g',
        selection: { 'shared.ts': SYNTHESIZE_SELECTION },
        createdBy: 'u',
      }),
    ).rejects.toMatchObject({ name: 'UnresolvedConvergenceError' });
    expect(called).toBe(0);
  });

  it("a 'pick' resolution NEVER calls inference even when wired (path unchanged)", async () => {
    let called = 0;
    const inference: ConvergeInferenceFn = async () => {
      called += 1;
      return { routed: true, content: VALID_MERGE };
    };
    const registered: { ws?: Workspace } = {};
    const result = await composeConvergence(deps(addConflictingSiblings(), registered, inference), {
      taskGroup: 'g',
      selection: { 'shared.ts': 'ws-b' },
      createdBy: 'u',
    });
    expect(called).toBe(0);
    expect(result.plan.assisted).toBeUndefined();
    expect(readFileSync(path.join(result.workspace.worktreePath!, 'shared.ts'), 'utf8')).toContain('l3-from-B');
  });
});

/**
 * Dry-run synthesizability PROBE — the read-only preview the plan endpoint attaches
 * on `?probe=1`, so the UI knows which contested files auto-merge before composing.
 *
 * Proves (real git): `synthesizable:true` for a non-overlapping contested file,
 * `false`+`overlap` for an overlapping same-line one, `false`+`delete-modify` when a
 * contributor deleted the path, `false`+`unreadable` for a candidate with no
 * worktree, and — critically — the probe NEVER mutates (no new worktree/branch/dir).
 */
describe('probeSynthesizability (read-only dry-run, real git)', () => {
  let root: string;
  let repo: string;
  const BASE_LINES = ['l1', 'l2', 'l3', 'l4', 'l5', ''];

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'recoder-probe-'));
    repo = path.join(root, 'repo');
    mkdirSync(repo, { recursive: true });
    git(repo, ['init', '-b', 'main']);
    writeFileSync(path.join(repo, 'shared.ts'), BASE_LINES.join('\n'));
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'base']);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function addSibling(id: string, mutate: (lines: string[]) => void, del = false): string {
    const wt = path.join(root, id);
    git(repo, ['worktree', 'add', '-b', `agent-${id}`, wt, 'main']);
    if (del) {
      rmSync(path.join(wt, 'shared.ts'));
    } else {
      const lines = [...BASE_LINES];
      mutate(lines);
      writeFileSync(path.join(wt, 'shared.ts'), lines.join('\n'));
    }
    return wt;
  }

  function deps(siblings: readonly { id: string; wt?: string }[]): ConvergeOpsDeps {
    const workspaces: Record<string, Workspace> = Object.fromEntries(
      siblings.map((s) => [s.id, makeWs({ workspaceId: s.id, worktreePath: s.wt, branch: `agent-${s.id}` })]),
    );
    return {
      compare: async () => ({ count: siblings.length, siblings: [] }),
      getWorkspace: async (id) => workspaces[id] ?? null,
      registerWorkspace: async (ws) => ws,
      logger: noopLogger,
    };
  }

  const contestedShared = [{ path: 'shared.ts', workspaceIds: ['ws-a', 'ws-b'] }];

  it('reports synthesizable:true for a non-overlapping contested file (no regions)', async () => {
    const wtA = addSibling('ws-a', (L) => (L[0] = 'l1-A'));
    const wtB = addSibling('ws-b', (L) => (L[4] = 'l5-B'));
    const out = await probeSynthesizability(deps([{ id: 'ws-a', wt: wtA }, { id: 'ws-b', wt: wtB }]), contestedShared);
    expect(out).toEqual([{ path: 'shared.ts', workspaceIds: ['ws-a', 'ws-b'], synthesizable: true }]);
    expect(out[0].regions).toBeUndefined();
  });

  it('reports synthesizable:false + overlap WITH the conflict regions (WHERE they collided)', async () => {
    const wtA = addSibling('ws-a', (L) => (L[2] = 'l3-A'));
    const wtB = addSibling('ws-b', (L) => (L[2] = 'l3-B'));
    const out = await probeSynthesizability(deps([{ id: 'ws-a', wt: wtA }, { id: 'ws-b', wt: wtB }]), contestedShared);
    expect(out[0]).toMatchObject({
      path: 'shared.ts',
      workspaceIds: ['ws-a', 'ws-b'],
      synthesizable: false,
      reason: 'overlap',
    });
    // The merged-with-markers content is `l1 l2 <<<<<<< l3-A ======= l3-B >>>>>>> l4 l5`
    // — ours is the sorted-first sibling (ws-a), theirs the next (ws-b).
    expect(out[0].regions).toEqual([
      { startLine: 3, endLine: 7, ours: ['l3-A'], theirs: ['l3-B'], truncated: false },
    ]);
  });

  it('reports synthesizable:false + delete-modify when a contributor deleted the path', async () => {
    const wtA = addSibling('ws-a', (L) => (L[0] = 'l1-A'));
    const wtB = addSibling('ws-b', () => {}, /* del */ true);
    const out = await probeSynthesizability(deps([{ id: 'ws-a', wt: wtA }, { id: 'ws-b', wt: wtB }]), contestedShared);
    expect(out[0]).toEqual({ path: 'shared.ts', workspaceIds: ['ws-a', 'ws-b'], synthesizable: false, reason: 'delete-modify' });
  });

  it('reports unreadable when a candidate has no worktree', async () => {
    const wtA = addSibling('ws-a', (L) => (L[0] = 'l1-A'));
    // ws-b resolves to a workspace record WITHOUT a worktreePath.
    const out = await probeSynthesizability(deps([{ id: 'ws-a', wt: wtA }, { id: 'ws-b' }]), contestedShared);
    expect(out[0]).toEqual({ path: 'shared.ts', workspaceIds: ['ws-a', 'ws-b'], synthesizable: false, reason: 'unreadable' });
  });

  it('returns [] for no contested paths', async () => {
    expect(await probeSynthesizability(deps([]), [])).toEqual([]);
  });

  it('NEVER mutates — no new worktree, branch, or directory is created', async () => {
    const wtA = addSibling('ws-a', (L) => (L[0] = 'l1-A'));
    const wtB = addSibling('ws-b', (L) => (L[4] = 'l5-B'));

    const worktreesBefore = execFileSync('git', ['-C', repo, 'worktree', 'list'], { encoding: 'utf8' });
    const branchesBefore = execFileSync('git', ['-C', repo, 'branch', '--list'], { encoding: 'utf8' });
    const dirsBefore = readdirSync(root).sort();

    await probeSynthesizability(deps([{ id: 'ws-a', wt: wtA }, { id: 'ws-b', wt: wtB }]), contestedShared);

    expect(execFileSync('git', ['-C', repo, 'worktree', 'list'], { encoding: 'utf8' })).toBe(worktreesBefore);
    expect(execFileSync('git', ['-C', repo, 'branch', '--list'], { encoding: 'utf8' })).toBe(branchesBefore);
    expect(readdirSync(root).sort()).toEqual(dirsBefore); // no `repo-converge-*`, no leftover
  });
});

/**
 * PURE conflict-region parse of `git merge-file` merged-with-markers output —
 * the "WHERE did the agents collide" surface the probe attaches on `overlap`.
 *
 * Proves: single/multiple regions with 1-indexed marker line positions; a region
 * closing on the file's last line (no trailing newline); marker labels containing
 * spaces; malformed/nested marker input NEVER throws (regions parsed so far are
 * returned, dangling partials discarded); and the payload is BOUNDED — regions per
 * file and lines per side are capped with `truncated:true` (degrade-truthful).
 */
describe('parseConflictRegions (pure marker parse)', () => {
  /** Build one marker region from ours/theirs lines (labels mimic merge-file's paths). */
  function region(ours: readonly string[], theirs: readonly string[], label = 'tmp/ours'): string {
    return [`<<<<<<< ${label}`, ...ours, '=======', ...theirs, `>>>>>>> tmp/theirs`].join('\n');
  }

  it('parses a single region with 1-indexed marker positions', () => {
    const content = ['l1', 'l2', region(['l3-A'], ['l3-B']), 'l4', ''].join('\n');
    expect(parseConflictRegions(content)).toEqual([
      { startLine: 3, endLine: 7, ours: ['l3-A'], theirs: ['l3-B'], truncated: false },
    ]);
  });

  it('parses multiple regions in order', () => {
    const content = ['a', region(['x1'], ['y1']), 'b', region(['x2', 'x2b'], ['y2']), 'c', ''].join('\n');
    expect(parseConflictRegions(content)).toEqual([
      { startLine: 2, endLine: 6, ours: ['x1'], theirs: ['y1'], truncated: false },
      { startLine: 8, endLine: 13, ours: ['x2', 'x2b'], theirs: ['y2'], truncated: false },
    ]);
  });

  it('parses a region whose close marker is the last line (no trailing newline)', () => {
    const content = ['head', '<<<<<<< a', 'x', '=======', 'y', '>>>>>>> b'].join('\n');
    expect(parseConflictRegions(content)).toEqual([
      { startLine: 2, endLine: 6, ours: ['x'], theirs: ['y'], truncated: false },
    ]);
  });

  it('accepts marker labels with spaces (worktree paths, merge-file labels)', () => {
    const content = [
      '<<<<<<< /tmp/recoder 3way abc/ours',
      'mine',
      '=======',
      'theirs',
      '>>>>>>> /tmp/recoder 3way abc/theirs',
      '',
    ].join('\n');
    expect(parseConflictRegions(content)).toEqual([
      { startLine: 1, endLine: 5, ours: ['mine'], theirs: ['theirs'], truncated: false },
    ]);
  });

  it('returns [] for clean content (no markers) and empty content', () => {
    expect(parseConflictRegions('')).toEqual([]);
    expect(parseConflictRegions('l1\nl2\n')).toEqual([]);
    // A bare separator outside any region is plain content, not a marker.
    expect(parseConflictRegions('l1\n=======\nl2\n')).toEqual([]);
  });

  it('malformed input never throws — the regions parsed so far are returned', () => {
    // A dangling open marker with no close: the partial region is discarded.
    expect(parseConflictRegions('<<<<<<< a\nx\n=======\ny\n')).toEqual([]);
    expect(parseConflictRegions('<<<<<<< a\nx\n')).toEqual([]);
    // One complete region followed by a dangling one keeps the complete region.
    const content = [region(['x'], ['y']), '<<<<<<< dangling', 'zzz', ''].join('\n');
    expect(parseConflictRegions(content)).toEqual([
      { startLine: 1, endLine: 5, ours: ['x'], theirs: ['y'], truncated: false },
    ]);
    // A close marker with no open region is plain content.
    expect(parseConflictRegions('>>>>>>> b\n')).toEqual([]);
  });

  it('a nested open marker restarts the region (never throws, never nests)', () => {
    const content = ['<<<<<<< outer', '<<<<<<< inner', 'x', '=======', 'y', '>>>>>>> close', ''].join('\n');
    expect(parseConflictRegions(content)).toEqual([
      { startLine: 2, endLine: 6, ours: ['x'], theirs: ['y'], truncated: false },
    ]);
  });

  it('caps lines per side at MAX_CONFLICT_SIDE_LINES with truncated:true', () => {
    const ours = Array.from({ length: MAX_CONFLICT_SIDE_LINES + 10 }, (_, i) => `o${i}`);
    const parsed = parseConflictRegions(region(ours, ['t']) + '\n');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].truncated).toBe(true);
    expect(parsed[0].ours).toHaveLength(MAX_CONFLICT_SIDE_LINES);
    expect(parsed[0].ours[0]).toBe('o0');
    expect(parsed[0].theirs).toEqual(['t']);
  });

  it('caps regions per file at MAX_CONFLICT_REGIONS, marking the last kept region truncated', () => {
    const many = Array.from({ length: MAX_CONFLICT_REGIONS + 5 }, (_, i) => region([`x${i}`], [`y${i}`])).join('\n');
    const parsed = parseConflictRegions(many + '\n');
    expect(parsed).toHaveLength(MAX_CONFLICT_REGIONS);
    expect(parsed[0].truncated).toBe(false);
    expect(parsed[parsed.length - 1].truncated).toBe(true); // signals "more regions existed"
    // Exactly at the cap: nothing is cut, nothing marked truncated.
    const exact = Array.from({ length: MAX_CONFLICT_REGIONS }, (_, i) => region([`x${i}`], [`y${i}`])).join('\n');
    const parsedExact = parseConflictRegions(exact + '\n');
    expect(parsedExact).toHaveLength(MAX_CONFLICT_REGIONS);
    expect(parsedExact.every((r) => !r.truncated)).toBe(true);
  });
});
