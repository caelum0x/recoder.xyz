/**
 * Checkpoints & restore — the git-snapshot capability.
 *
 * Two layers, both truthful:
 *  - SERVICE (git seams): create → list → restore drives real git verbs against a
 *    faithful in-memory `git` fake (rev-parse / status / stash create / tag /
 *    reset / checkout), proving the snapshot is captured non-destructively and the
 *    restore reproduces it after taking an automatic safety snapshot; branch
 *    builds the new-workspace create input from the checkpoint (base = the tag).
 *  - COMPOSER (gate + audit + degrade): a denied gate BLOCKS the write (no git,
 *    no record) and is never faked; a missing worktree refuses truthfully; a
 *    branch through the composer creates a REAL new workspace and seals the audit.
 */
import { describe, it, expect } from 'vitest';
import type { ExecOptions, ExecResult } from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import {
  branchFromCheckpoint,
  createCheckpoint,
  listCheckpoints,
  restoreCheckpoint,
  type CheckpointOpsDeps,
} from './services/checkpoint.service.js';
import { createInMemoryCheckpointStore } from './adapters/checkpoint-store.adapter.js';
import type { CheckpointRecord } from './ports/checkpoint-store.port.js';
import {
  composeConductor,
  FakeSubstrate,
  makeGate,
  makeLogger,
  makePrincipal,
} from './__fixtures__/harness.js';

/**
 * A faithful in-memory `git` for one worktree. It records every issued command
 * and models exactly the verbs the checkpoint service uses — enough to prove the
 * snapshot/restore semantics without a real repo, and never fabricates output.
 */
class FakeGit {
  readonly calls: string[][] = [];
  head: string;
  dirty: boolean;
  readonly tags = new Map<string, string>();
  #stash = 0;

  constructor(opts: { head?: string; dirty?: boolean } = {}) {
    this.head = opts.head ?? 'HEAD_0';
    this.dirty = opts.dirty ?? false;
  }

  readonly exec = async (
    _bin: string,
    args: readonly string[],
    _options?: ExecOptions,
  ): Promise<ExecResult> => {
    // args are ['-C', cwd, <sub>, ...rest]
    const [, , sub, ...rest] = args;
    this.calls.push([sub, ...rest]);
    const out = (stdout: string): ExecResult => ({ stdout, stderr: '', code: 0 });
    switch (sub) {
      case 'rev-parse':
        return out(this.head);
      case 'status':
        return out(this.dirty ? ' M src/file.ts\n' : '');
      case 'stash':
        // 'stash create <msg>' → a commit sha capturing the dirty tree, or empty.
        return out(this.dirty ? `STASH_${++this.#stash}` : '');
      case 'tag': {
        const [name, sha] = rest;
        this.tags.set(name, sha);
        return out('');
      }
      case 'reset':
        // ['--hard', sha]
        this.head = rest[1];
        this.dirty = false;
        return out('');
      case 'checkout':
        // ['<sha>', '--', '.'] — re-applies captured edits as working changes
        this.dirty = true;
        return out('');
      default:
        return out('');
    }
  };
}

const WORKSPACE: Workspace = {
  workspaceId: 'ws_1',
  spaceId: 'space_1',
  projectId: 'project_1',
  taskId: 'task_1',
  runId: 'run_1',
  runtimeId: 'claude_code',
  substrate: 'tmux_worktree',
  branch: 'agent/ws_1',
  baseRef: 'main',
  worktreePath: '/tmp/wt/ws_1',
  sessionName: 'sess_1',
  state: 'running',
  createdBy: 'user_test',
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
  metadata: {},
} as unknown as Workspace;

function svcDeps(git: FakeGit, workspace: Workspace | null = WORKSPACE): CheckpointOpsDeps {
  let seq = 0;
  return {
    getWorkspace: async () => workspace,
    store: createInMemoryCheckpointStore(),
    logger: makeLogger(),
    exec: git.exec,
    newId: () => `cp_${++seq}`,
    now: () => '2026-07-19T00:00:00.000Z',
  };
}

describe('checkpoint service (git seams)', () => {
  it('create → list → restore reproduces a DIRTY snapshot non-destructively', async () => {
    const git = new FakeGit({ head: 'HEAD_A', dirty: true });
    const deps = svcDeps(git);

    const record = await createCheckpoint(deps, 'ws_1', { label: 'wip', createdBy: 'user_test' });

    // Dirty ⇒ a stash-create snapshot distinct from HEAD, tagged, nothing mutated.
    expect(record.kind).toBe('stash');
    expect(record.headSha).toBe('HEAD_A');
    expect(record.snapshotSha).toBe('STASH_1');
    expect(record.dirty).toBe(true);
    expect(record.ref).toBe('recoder-checkpoint/cp_1');
    expect(git.tags.get('recoder-checkpoint/cp_1')).toBe('STASH_1');
    // The working tree was NOT reset/checked-out during capture.
    expect(git.calls.some((c) => c[0] === 'reset' || c[0] === 'checkout')).toBe(false);

    const listed = await listCheckpoints(deps, 'ws_1');
    expect(listed).toHaveLength(1);
    expect(listed[0].checkpointId).toBe('cp_1');

    const restore = await restoreCheckpoint(deps, 'ws_1', 'cp_1');
    expect(restore.restoredTo).toBe('STASH_1');
    // A pre-restore safety snapshot was tagged BEFORE the reset (never lose work).
    expect(restore.safetyRef).toMatch(/^recoder-checkpoint-pre-restore\//);
    expect(git.tags.get(restore.safetyRef!)).toBeDefined();
    // The restore reset to the committed base then re-applied the captured edits.
    expect(git.calls).toContainEqual(['reset', '--hard', 'HEAD_A']);
    expect(git.calls).toContainEqual(['checkout', 'STASH_1', '--', '.']);
  });

  it('captures a CLEAN worktree as a commit checkpoint (no stash, no re-apply)', async () => {
    const git = new FakeGit({ head: 'HEAD_B', dirty: false });
    const deps = svcDeps(git);

    const record = await createCheckpoint(deps, 'ws_1', { createdBy: 'user_test' });
    expect(record.kind).toBe('commit');
    expect(record.dirty).toBe(false);
    expect(record.snapshotSha).toBe('HEAD_B');
    expect(git.tags.get(record.ref)).toBe('HEAD_B');

    await restoreCheckpoint(deps, 'ws_1', record.checkpointId);
    // Clean checkpoint ⇒ reset only, no working-tree checkout re-apply.
    expect(git.calls).toContainEqual(['reset', '--hard', 'HEAD_B']);
    expect(git.calls.some((c) => c[0] === 'checkout')).toBe(false);
  });

  it('refuses truthfully when the workspace has no worktree', async () => {
    const git = new FakeGit();
    const noWorktree = { ...WORKSPACE, worktreePath: undefined } as unknown as Workspace;
    const deps = svcDeps(git, noWorktree);
    await expect(createCheckpoint(deps, 'ws_1', { createdBy: 'user_test' })).rejects.toThrow(
      /no worktree/,
    );
  });

  it('branch builds a new-workspace create input from the checkpoint tag', async () => {
    const store = createInMemoryCheckpointStore();
    const record: CheckpointRecord = {
      checkpointId: 'cp_9',
      workspaceId: 'ws_1',
      spaceId: 'space_1',
      projectId: 'project_1',
      taskId: 'task_1',
      kind: 'stash',
      ref: 'recoder-checkpoint/cp_9',
      headSha: 'HEAD_A',
      snapshotSha: 'STASH_1',
      dirty: true,
      branch: 'agent/ws_1',
      baseRef: 'main',
      repoPath: '/tmp/wt/ws_1',
      runtimeId: 'claude_code',
      substrate: 'tmux_worktree',
      metadata: {},
      createdBy: 'user_test',
      createdAt: '2026-07-19T00:00:00.000Z',
    };
    await store.save(record);

    let captured: Record<string, unknown> | null = null;
    const deps = {
      getWorkspace: async () => WORKSPACE,
      store,
      logger: makeLogger(),
      createWorkspace: async (input: Record<string, unknown>) => {
        captured = input;
        return { ...WORKSPACE, workspaceId: 'ws_new' } as unknown as Workspace;
      },
    } as unknown as Parameters<typeof branchFromCheckpoint>[0];

    const result = await branchFromCheckpoint(deps, 'ws_1', 'cp_9', {
      prompt: 'continue here',
      createdBy: 'user_test',
    });

    expect(result.workspace.workspaceId).toBe('ws_new');
    expect(captured).toBeTruthy();
    // The new worktree branches from the checkpoint tag (its tree = the snapshot).
    expect(captured!.baseRef).toBe('recoder-checkpoint/cp_9');
    expect(captured!.repoPath).toBe('/tmp/wt/ws_1');
    expect(captured!.prompt).toBe('continue here');
    expect((captured!.metadata as Record<string, unknown>).branchedFromCheckpoint).toBe('cp_9');
  });

  it('branch refuses a checkpoint that belongs to a different workspace', async () => {
    const store = createInMemoryCheckpointStore();
    await store.save({
      checkpointId: 'cp_x',
      workspaceId: 'ws_OTHER',
      spaceId: 'space_1',
      projectId: 'project_1',
      taskId: 'task_1',
      kind: 'commit',
      ref: 'recoder-checkpoint/cp_x',
      headSha: 'H',
      snapshotSha: 'H',
      dirty: false,
      branch: 'b',
      baseRef: 'main',
      repoPath: '/tmp/wt/other',
      runtimeId: 'claude_code',
      substrate: 'tmux_worktree',
      metadata: {},
      createdBy: 'user_test',
      createdAt: '2026-07-19T00:00:00.000Z',
    });
    const deps = {
      getWorkspace: async () => WORKSPACE,
      store,
      logger: makeLogger(),
      createWorkspace: async () => WORKSPACE,
    } as unknown as Parameters<typeof branchFromCheckpoint>[0];
    await expect(
      branchFromCheckpoint(deps, 'ws_1', 'cp_x', { createdBy: 'user_test' }),
    ).rejects.toThrow(/does not belong/);
  });
});

describe('checkpoint composer (gate + audit + degrade)', () => {
  it('blocks a checkpoint when the gate denies (never fabricates a snapshot)', async () => {
    const gate = makeGate('deny');
    const { module } = composeConductor({ substrates: [new FakeSubstrate()], gate });

    const result = await module.checkpointWorkspace('ws_missing', { label: 'x' }, makePrincipal());

    expect(result.ok).toBe(false);
    expect(result.verdict.effect).toBe('deny');
    expect(gate.decisions).toContain('workspace.checkpoint');
    // Denied before the write ⇒ no audit sealed.
    expect(gate.audits).toHaveLength(0);
    expect(await module.listWorkspaceCheckpoints('ws_missing')).toHaveLength(0);
  });

  it('degrades truthfully when the target workspace has no worktree (allowed gate)', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    // No such workspace ⇒ the op throws "not found"; the composer returns a
    // truthful ok:false with the reason, never a faked success.
    const result = await module.checkpointWorkspace('ws_absent', {}, makePrincipal());
    expect(result.ok).toBe(false);
    expect(result.verdict.effect).toBe('allow');
    expect(result.reason).toMatch(/not found/);
  });

  it('branch through the composer creates a REAL new workspace + seals the audit', async () => {
    const store = createInMemoryCheckpointStore();
    await store.save({
      checkpointId: 'cp_b',
      workspaceId: 'ws_src',
      spaceId: 'space_1',
      projectId: 'project_1',
      taskId: 'task_1',
      kind: 'commit',
      ref: 'recoder-checkpoint/cp_b',
      headSha: 'H1',
      snapshotSha: 'H1',
      dirty: false,
      branch: 'agent/ws_src',
      baseRef: 'main',
      repoPath: '/tmp/fake-repo',
      runtimeId: 'claude_code',
      substrate: 'tmux_worktree',
      metadata: {},
      createdBy: 'user_test',
      createdAt: '2026-07-19T00:00:00.000Z',
    });
    const gate = makeGate('allow');
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      gate,
      checkpointStore: store,
    });

    const before = await module.listWorkspaces();
    const result = await module.branchFromCheckpoint(
      'ws_src',
      'cp_b',
      { prompt: 'go' },
      makePrincipal('user_bob'),
    );

    expect(result.ok).toBe(true);
    expect(result.value?.workspace.workspaceId).toBeTruthy();
    const after = await module.listWorkspaces();
    expect(after.length).toBe(before.length + 1);
    expect(gate.decisions).toContain('workspace.branch');
    const audit = gate.audits.find((a) => a.action === 'workspace.branch');
    expect(audit?.actorId).toBe('user_bob');
    expect(audit?.effect).toBe('allow');
  });

  it('blocks a restore when the gate denies', async () => {
    const gate = makeGate('deny');
    const { module } = composeConductor({ substrates: [new FakeSubstrate()], gate });
    const result = await module.restoreCheckpoint('ws_1', 'cp_1', makePrincipal());
    expect(result.ok).toBe(false);
    expect(result.verdict.effect).toBe('deny');
    expect(gate.decisions).toContain('workspace.restore');
    expect(gate.audits).toHaveLength(0);
  });
});
