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
import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
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
import { createGitCheckpointStore } from './adapters/git-checkpoint-store.adapter.js';
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
  /** The env overlay each call in `calls` was issued with (index-aligned). */
  readonly envs: (Record<string, string> | undefined)[] = [];
  head: string;
  dirty: boolean;
  /** Paths a `diff --diff-filter=D <head> <snapshot>` reports as deleted. */
  deletedPaths: string[] = [];
  readonly tags = new Map<string, { sha: string; message: string }>();
  #tree = 0;
  #commit = 0;

  constructor(opts: { head?: string; dirty?: boolean } = {}) {
    this.head = opts.head ?? 'HEAD_0';
    this.dirty = opts.dirty ?? false;
  }

  readonly exec = async (
    _bin: string,
    args: readonly string[],
    options?: ExecOptions,
  ): Promise<ExecResult> => {
    // args are ['-C', cwd, <sub>, ...rest]
    const [, , sub, ...rest] = args;
    this.calls.push([sub, ...rest]);
    this.envs.push(options?.env);
    const out = (stdout: string): ExecResult => ({ stdout, stderr: '', code: 0 });
    switch (sub) {
      case 'rev-parse':
        return out(this.head);
      case 'status':
        return out(this.dirty ? ' M src/file.ts\n' : '');
      case 'add':
        // 'add -A' — stages the whole worktree (incl. untracked) into the temp
        // index named by GIT_INDEX_FILE; no output.
        return out('');
      case 'write-tree':
        // Freezes the temp index into a tree object.
        return out(`TREE_${++this.#tree}`);
      case 'commit-tree':
        // Wraps the tree in a real commit (the dirty snapshot sha).
        return out(`COMMIT_${++this.#commit}`);
      case 'tag': {
        // 'tag -l <glob> --format=%(contents:subject)' — one line per matching
        // tag: the annotated message's first line ("" for lightweight tags).
        if (rest[0] === '-l') {
          const prefix = rest[1].replace(/\*.*$/, '');
          const lines = [...this.tags.entries()]
            .filter(([name]) => name.startsWith(prefix))
            .map(([, tag]) => tag.message.split('\n')[0]);
          return out(lines.join('\n'));
        }
        // 'tag -a -m <msg> <name> <sha>' (annotated) or 'tag <name> <sha>'.
        if (rest[0] === '-a') {
          const [, , message, name, sha] = rest;
          this.tags.set(name, { sha, message });
          return out('');
        }
        const [name, sha] = rest;
        this.tags.set(name, { sha, message: '' });
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
      case 'diff':
        // ['--name-only', '--diff-filter=D', <head>, <snapshot>] — the paths
        // deleted between the two trees (empty unless the scenario configures them).
        if (rest.includes('--diff-filter=D')) return out(this.deletedPaths.join('\n'));
        return out('');
      case 'rm':
        // ['--force', '--', ...paths] — models the working-tree removal (recorded).
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

    // Dirty ⇒ a temp-index tree snapshot distinct from HEAD, tagged, nothing mutated.
    expect(record.kind).toBe('tree');
    expect(record.headSha).toBe('HEAD_A');
    expect(record.snapshotSha).toBe('COMMIT_1');
    expect(record.dirty).toBe(true);
    expect(record.ref).toBe('recoder-checkpoint/cp_1');
    expect(git.tags.get('recoder-checkpoint/cp_1')?.sha).toBe('COMMIT_1');
    // The working tree was NOT reset/checked-out during capture.
    expect(git.calls.some((c) => c[0] === 'reset' || c[0] === 'checkout')).toBe(false);

    const listed = await listCheckpoints(deps, 'ws_1');
    expect(listed).toHaveLength(1);
    expect(listed[0].checkpointId).toBe('cp_1');

    const restore = await restoreCheckpoint(deps, 'ws_1', 'cp_1');
    expect(restore.restoredTo).toBe('COMMIT_1');
    // A pre-restore safety snapshot was tagged BEFORE the reset (never lose work).
    expect(restore.safetyRef).toMatch(/^recoder-checkpoint-pre-restore\//);
    expect(git.tags.get(restore.safetyRef!)).toBeDefined();
    // The restore reset to the committed base then re-applied the captured edits.
    expect(git.calls).toContainEqual(['reset', '--hard', 'HEAD_A']);
    expect(git.calls).toContainEqual(['checkout', 'COMMIT_1', '--', '.']);
  });

  it('captures UNTRACKED work via a temp-index tree (GIT_INDEX_FILE), never a stash (recoder-itjb)', async () => {
    const git = new FakeGit({ head: 'HEAD_A', dirty: true });
    const deps = svcDeps(git);

    const record = await createCheckpoint(deps, 'ws_1', { createdBy: 'user_test' });

    // The dirty snapshot is a temp-index tree/commit, NOT a `git stash create`
    // (which cannot include untracked files and silently drops them).
    expect(record.kind).toBe('tree');
    expect(record.snapshotSha).toBe('COMMIT_1');
    expect(git.calls.some((c) => c[0] === 'stash')).toBe(false);

    // `git add -A` and `git write-tree` ran against the SAME throwaway index,
    // pointed there by GIT_INDEX_FILE — so the user's real index is untouched.
    const addIdx = git.calls.findIndex((c) => c[0] === 'add' && c[1] === '-A');
    const writeIdx = git.calls.findIndex((c) => c[0] === 'write-tree');
    expect(addIdx).toBeGreaterThanOrEqual(0);
    expect(writeIdx).toBeGreaterThan(addIdx);
    const tempIndex = git.envs[addIdx]?.GIT_INDEX_FILE;
    expect(tempIndex).toBeTruthy();
    // The temp index is OUTSIDE the worktree (so its .lock is never captured).
    expect(tempIndex!.startsWith(WORKSPACE.worktreePath!)).toBe(false);
    expect(git.envs[writeIdx]?.GIT_INDEX_FILE).toBe(tempIndex);

    // The snapshot is wrapped in a real commit parented on HEAD (branch-able),
    // still on the temp index — never the user's stash/worktree/index.
    const commit = git.calls.find((c) => c[0] === 'commit-tree');
    expect(commit).toBeTruthy();
    expect(commit).toContain('-p');
    expect(commit).toContain('HEAD_A');
    const commitIdx = git.calls.findIndex((c) => c[0] === 'commit-tree');
    expect(git.envs[commitIdx]?.GIT_INDEX_FILE).toBe(tempIndex);
    // Capture never resets/checks-out the real worktree.
    expect(git.calls.some((c) => c[0] === 'reset' || c[0] === 'checkout')).toBe(false);
  });

  it('restore REPRODUCES file deletions captured in the snapshot (recoder-36lk)', async () => {
    const git = new FakeGit({ head: 'HEAD_A', dirty: true });
    const deps = svcDeps(git);
    const record = await createCheckpoint(deps, 'ws_1', { label: 'wip', createdBy: 'user_test' });
    // The snapshot removed src/gone.ts relative to the committed base.
    git.deletedPaths = ['src/gone.ts'];

    await restoreCheckpoint(deps, 'ws_1', record.checkpointId);

    // `checkout <snap> -- .` re-applies tracked files but never removes deletions;
    // restore must also remove the file the checkpoint deleted, else the restored
    // tree keeps a stale file the snapshot did not have.
    const rm = git.calls.find((c) => c[0] === 'rm');
    expect(rm).toBeTruthy();
    expect(rm).toContain('src/gone.ts');
  });

  it('captures a CLEAN worktree as a commit checkpoint (no stash, no re-apply)', async () => {
    const git = new FakeGit({ head: 'HEAD_B', dirty: false });
    const deps = svcDeps(git);

    const record = await createCheckpoint(deps, 'ws_1', { createdBy: 'user_test' });
    expect(record.kind).toBe('commit');
    expect(record.dirty).toBe(false);
    expect(record.snapshotSha).toBe('HEAD_B');
    expect(git.tags.get(record.ref)?.sha).toBe('HEAD_B');

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

describe('git checkpoint store (durable across a backend restart)', () => {
  function gitStoreDeps(git: FakeGit, store: ReturnType<typeof createGitCheckpointStore>) {
    let seq = 0;
    return {
      getWorkspace: async () => WORKSPACE,
      store,
      logger: makeLogger(),
      exec: git.exec,
      newId: () => `cp_${++seq}`,
      now: () => '2026-07-19T00:00:00.000Z',
    } satisfies CheckpointOpsDeps;
  }

  it('rebuilds the checkpoint list from annotated tags after a "restart" and restores through it', async () => {
    const git = new FakeGit({ head: 'HEAD_A', dirty: true });
    const storeA = createGitCheckpointStore({
      getWorkspace: async () => WORKSPACE,
      logger: makeLogger(),
      exec: git.exec,
    });
    const record = await createCheckpoint(gitStoreDeps(git, storeA), 'ws_1', {
      label: 'before refactor',
      createdBy: 'user_test',
    });

    // "Restart": a FRESH store over the SAME repo — the in-process cache is gone,
    // but the annotated tag metadata is not.
    const storeB = createGitCheckpointStore({
      getWorkspace: async () => WORKSPACE,
      logger: makeLogger(),
      exec: git.exec,
    });
    expect(storeB.isDurable()).toBe(true);
    const listed = await storeB.listForWorkspace('ws_1');
    expect(listed).toHaveLength(1);
    expect(listed[0].checkpointId).toBe(record.checkpointId);
    expect(listed[0].label).toBe('before refactor');
    expect(listed[0].snapshotSha).toBe('COMMIT_1');
    expect(listed[0].kind).toBe('tree');
    expect(listed[0].headSha).toBe('HEAD_A');
    expect(listed[0].dirty).toBe(true);

    // Restore through the rebuilt store (get() misses; the workspace-scoped list
    // fallback in the service finds the rehydrated record).
    const restore = await restoreCheckpoint(gitStoreDeps(git, storeB), 'ws_1', record.checkpointId);
    expect(restore.restoredTo).toBe('COMMIT_1');
    expect(git.calls).toContainEqual(['reset', '--hard', 'HEAD_A']);
  });

  it('skips lightweight/foreign tags truthfully instead of fabricating records', async () => {
    const git = new FakeGit({ head: 'HEAD_C', dirty: false });
    // A legacy LIGHTWEIGHT checkpoint tag (no record message) + a foreign-workspace record.
    git.tags.set('recoder-checkpoint/legacy', { sha: 'HEAD_C', message: '' });
    const store = createGitCheckpointStore({
      getWorkspace: async () => WORKSPACE,
      logger: makeLogger(),
      exec: git.exec,
    });
    await createCheckpoint(gitStoreDeps(git, store), 'ws_1', { createdBy: 'user_test' });

    const fresh = createGitCheckpointStore({
      getWorkspace: async () => WORKSPACE,
      logger: makeLogger(),
      exec: git.exec,
    });
    const listed = await fresh.listForWorkspace('ws_1');
    expect(listed).toHaveLength(1);
    expect(listed[0].checkpointId).not.toBe('legacy');
  });

  it('degrades to the in-process records when the workspace has no worktree', async () => {
    const git = new FakeGit();
    const store = createGitCheckpointStore({
      getWorkspace: async () => null,
      logger: makeLogger(),
      exec: git.exec,
    });
    expect(await store.listForWorkspace('ws_gone')).toHaveLength(0);
    expect(git.calls.some((c) => c[0] === 'tag')).toBe(false);
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

/**
 * REAL git, no fake: the data-loss guard. Capture must fold UNTRACKED work into
 * the snapshot (the recoder-itjb bug: `git stash create` silently drops it) and
 * must never mutate the user's real index/worktree/stash. Uses a throwaway
 * on-disk repo and drives the actual host `git` through the exec seam.
 */
describe('checkpoint service (REAL git integration — recoder-itjb)', () => {
  const pexec = promisify(execFile);
  // A real exec seam: shape-compatible with `execFileSafe`, honoring the env
  // overlay the service uses to point git at a throwaway index.
  const realExec = async (
    bin: string,
    args: readonly string[],
    options?: ExecOptions,
  ): Promise<ExecResult> => {
    const { stdout, stderr } = await pexec(bin, [...args], {
      env: options?.env ? { ...process.env, ...options.env } : process.env,
      maxBuffer: options?.maxBuffer ?? 32 * 1024 * 1024,
    });
    return { stdout: String(stdout), stderr: String(stderr), code: 0 };
  };
  const git = (repo: string, args: string[], env?: Record<string, string>) =>
    realExec('git', ['-C', repo, ...args], env ? { env } : {});

  async function makeRepo(): Promise<string> {
    const repo = await mkdtemp(join(tmpdir(), 'recoder-itjb-real-'));
    await git(repo, ['init', '-q']);
    await git(repo, ['config', 'user.email', 'test@recoder.local']);
    await git(repo, ['config', 'user.name', 'Recoder Test']);
    await writeFile(join(repo, 'tracked.txt'), 'tracked v1\n');
    await git(repo, ['add', 'tracked.txt']);
    await git(repo, ['commit', '-qm', 'init']);
    return repo;
  }

  function repoWorkspace(repo: string): Workspace {
    return { ...WORKSPACE, workspaceId: 'ws_real', worktreePath: repo } as unknown as Workspace;
  }

  function realDeps(repo: string): CheckpointOpsDeps {
    let seq = 0;
    return {
      getWorkspace: async () => repoWorkspace(repo),
      store: createInMemoryCheckpointStore(),
      logger: makeLogger(),
      exec: realExec,
      newId: () => `cp_real_${++seq}`,
      now: () => '2026-07-19T00:00:00.000Z',
    };
  }

  it('captures a staged edit AND an UNTRACKED file, leaving index/worktree/stash untouched', async () => {
    const repo = await makeRepo();
    try {
      // Mixed-dirty worktree: a STAGED tracked edit + a brand-new UNTRACKED file.
      await writeFile(join(repo, 'tracked.txt'), 'tracked v2\n');
      await git(repo, ['add', 'tracked.txt']);
      await writeFile(join(repo, 'untracked.txt'), 'brand new untracked work\n');

      const deps = realDeps(repo);
      const record = await createCheckpoint(deps, 'ws_real', { createdBy: 'user_test' });

      // The snapshot TREE contains the untracked file (the bug dropped it) + the
      // staged edit — and no throwaway-index artifact leaked in.
      expect(record.kind).toBe('tree');
      const tree = (await git(repo, ['ls-tree', '-r', '--name-only', record.snapshotSha])).stdout;
      const files = tree.split('\n').map((f) => f.trim()).filter(Boolean);
      expect(files).toContain('untracked.txt');
      expect(files).toContain('tracked.txt');
      expect(files.some((f) => f.includes('.index'))).toBe(false);
      // The snapshot's tracked.txt is the EDITED (v2) content.
      const snapTracked = (await git(repo, ['show', `${record.snapshotSha}:tracked.txt`])).stdout;
      expect(snapTracked).toContain('tracked v2');

      // NON-DESTRUCTIVE: the user's real state is exactly as they left it.
      expect((await git(repo, ['stash', 'list'])).stdout.trim()).toBe(''); // stash untouched
      expect((await git(repo, ['diff', '--cached', '--name-only'])).stdout).toContain('tracked.txt'); // still staged
      expect((await git(repo, ['show', ':tracked.txt'])).stdout).toContain('tracked v2'); // index intact
      await expect(access(join(repo, 'untracked.txt'))).resolves.toBeUndefined(); // untracked still on disk
      // No temp-index file was created inside the worktree.
      const status = (await git(repo, ['status', '--porcelain'])).stdout;
      expect(status.includes('.index')).toBe(false);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('restore REPRODUCES the untracked file the checkpoint captured', async () => {
    const repo = await makeRepo();
    try {
      await writeFile(join(repo, 'untracked.txt'), 'brand new untracked work\n');
      const deps = realDeps(repo);
      const record = await createCheckpoint(deps, 'ws_real', { createdBy: 'user_test' });

      // Lose the untracked work, then restore — it must come back from the snapshot.
      await rm(join(repo, 'untracked.txt'));
      await restoreCheckpoint(deps, 'ws_real', record.checkpointId);

      const restored = await readFile(join(repo, 'untracked.txt'), 'utf8');
      expect(restored).toContain('brand new untracked work');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});
