/**
 * Single-writer run-inference persistence — `recordRunInferenceId` anchors a run's
 * napi-tier `inference_id` onto the workspace record (`metadata.inferenceId`), the
 * WRITE side of the merge → `feedback()` RLHF loop.
 *
 * Proves the PRODUCTION persistence path (not the seeded masking of
 * `workspace-merge-feedback.test.ts`): a workspace with NO pre-seeded
 * `metadata.inferenceId` gets its anchor from `recordRunInferenceId`, and a
 * subsequent real on-disk merge fires `onDeliveryFeedback` with THAT persisted id.
 * Also proves the WRITE-ONCE contract (a second record never clobbers the first),
 * degrade-truthfulness (missing workspace / empty id ⇒ `false`, no throw), and the
 * negative case (no record ⇒ merge is a byte-identical silent no-op).
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { Workspace } from '@recoder/agent-os';
import { createConductorModule, type ConductorModule, type ConductorModuleDeps } from './index.js';
import { createWorkspaceRepository } from './adapters/workspace-repository.adapter.js';
import type { WorkspaceRepositoryPort } from './ports/workspace-repository.port.js';
import {
  FakeSubstrate,
  makeConfig,
  makeExecutor,
  makeGate,
  makeLogger,
  makeMiddleware,
  makePrincipal,
} from './__fixtures__/harness.js';

const run = promisify(execFile);

interface FeedbackCall {
  inferenceId: string;
  userId: string | undefined;
  success: boolean;
}

const cleanups: string[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/**
 * A REAL git repo with a base `main` and a workspace worktree one commit ahead —
 * the exact on-disk shape the LOCAL merge path delivers (see
 * `workspace-merge-feedback.test.ts`).
 */
async function makeGitWorkspaceRepo(): Promise<{ worktree: string; branch: string }> {
  const mainRepo = await mkdtemp(join(tmpdir(), 'recoder-record-inf-'));
  cleanups.push(mainRepo);
  const git = (args: string[], cwd: string) => run('git', args, { cwd });
  await run('git', ['-c', 'init.defaultBranch=main', 'init'], { cwd: mainRepo });
  await git(['checkout', '-B', 'main'], mainRepo);
  await git(['config', 'user.email', 'test@recoder.dev'], mainRepo);
  await git(['config', 'user.name', 'Recoder Test'], mainRepo);
  await writeFile(join(mainRepo, 'README.md'), '# base\n');
  await git(['add', '.'], mainRepo);
  await git(['commit', '-m', 'init'], mainRepo);

  const branch = 'recoder/ws_record_inf';
  const worktree = `${mainRepo}-wt`;
  cleanups.push(worktree);
  await git(['worktree', 'add', worktree, '-b', branch], mainRepo);
  await writeFile(join(worktree, 'feature.txt'), 'agent work\n');
  await git(['add', '.'], worktree);
  await git(['commit', '-m', 'feature'], worktree);
  return { worktree, branch };
}

function seededWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  const now = new Date().toISOString();
  return {
    workspaceId: 'ws_record_inf',
    spaceId: 'space_1',
    projectId: 'project_1',
    taskId: 'task_1',
    runId: 'run_ws_record_inf',
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: 'recoder/ws_record_inf',
    baseRef: 'main',
    state: 'awaiting_review',
    createdBy: 'user_test',
    createdAt: now,
    updatedAt: now,
    metadata: {},
    ...overrides,
  };
}

/** Compose a module over a shared repository so tests can read back persisted state. */
async function compose(
  repository: WorkspaceRepositoryPort,
  onDeliveryFeedback?: ConductorModuleDeps['onDeliveryFeedback'],
): Promise<ConductorModule> {
  return createConductorModule({
    config: makeConfig(),
    logger: makeLogger(),
    executor: makeExecutor(false),
    middleware: makeMiddleware(),
    gate: makeGate('allow'),
    repository,
    substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
    ...(onDeliveryFeedback ? { onDeliveryFeedback } : {}),
  });
}

describe('conductor.recordRunInferenceId (single-writer persistence)', () => {
  it('persists the napi-tier inference_id onto metadata (production path, not seeded)', async () => {
    const repository = createWorkspaceRepository({ executor: makeExecutor(false) });
    await repository.upsertWorkspace(seededWorkspace());
    const module = await compose(repository);

    const ok = await module.recordRunInferenceId('ws_record_inf', 'inf-napi-1');

    expect(ok).toBe(true);
    const stored = await repository.getWorkspace('ws_record_inf');
    expect(stored?.metadata?.inferenceId).toBe('inf-napi-1');
    // Same-state write: the lifecycle state is untouched by the correlation patch.
    expect(stored?.state).toBe('awaiting_review');
  });

  it('is WRITE-ONCE — a second record never clobbers the first anchor', async () => {
    const repository = createWorkspaceRepository({ executor: makeExecutor(false) });
    await repository.upsertWorkspace(seededWorkspace());
    const module = await compose(repository);

    expect(await module.recordRunInferenceId('ws_record_inf', 'inf-first')).toBe(true);
    // Second call returns true (idempotent) but leaves the persisted id unchanged.
    expect(await module.recordRunInferenceId('ws_record_inf', 'inf-second')).toBe(true);

    const stored = await repository.getWorkspace('ws_record_inf');
    expect(stored?.metadata?.inferenceId).toBe('inf-first');
  });

  it('preserves sibling metadata keys (merge patch, not wholesale replace)', async () => {
    const repository = createWorkspaceRepository({ executor: makeExecutor(false) });
    await repository.upsertWorkspace(seededWorkspace({ metadata: { previewUrl: 'http://localhost:3000' } }));
    const module = await compose(repository);

    await module.recordRunInferenceId('ws_record_inf', 'inf-napi-1');

    const stored = await repository.getWorkspace('ws_record_inf');
    expect(stored?.metadata?.previewUrl).toBe('http://localhost:3000');
    expect(stored?.metadata?.inferenceId).toBe('inf-napi-1');
  });

  it('is degrade-truthful — a missing workspace ⇒ false (no throw)', async () => {
    const repository = createWorkspaceRepository({ executor: makeExecutor(false) });
    const module = await compose(repository);

    await expect(module.recordRunInferenceId('ws_absent', 'inf-x')).resolves.toBe(false);
  });

  it('rejects an empty inference_id ⇒ false (no anchor written)', async () => {
    const repository = createWorkspaceRepository({ executor: makeExecutor(false) });
    await repository.upsertWorkspace(seededWorkspace());
    const module = await compose(repository);

    expect(await module.recordRunInferenceId('ws_record_inf', '')).toBe(false);
    const stored = await repository.getWorkspace('ws_record_inf');
    expect(stored?.metadata?.inferenceId).toBeUndefined();
  });
});

describe('conductor merge RLHF loop closes over the PRODUCTION persistence path', () => {
  it('a merge AFTER recordRunInferenceId fires onDeliveryFeedback with the persisted id', async () => {
    const { worktree, branch } = await makeGitWorkspaceRepo();
    const repository = createWorkspaceRepository({ executor: makeExecutor(false) });
    // NO pre-seeded metadata.inferenceId — the anchor lands via the real write.
    await repository.upsertWorkspace(seededWorkspace({ worktreePath: worktree, branch }));
    const feedback: FeedbackCall[] = [];
    const module = await compose(repository, (inferenceId, userId, success) => {
      feedback.push({ inferenceId, userId, success });
    });

    // Production write path (what the run-inference sink calls), then merge.
    await module.recordRunInferenceId('ws_record_inf', 'inf-napi-merge');
    const result = await module.mergeWorkspace('ws_record_inf', {}, makePrincipal());

    expect(result.ok).toBe(true);
    expect(result.value?.merged).toBe(true);
    // THE LOOP CLOSES: the merge read at conductor-module:1338 found the persisted id.
    expect(feedback).toEqual([{ inferenceId: 'inf-napi-merge', userId: 'user_test', success: true }]);
  });

  it('a merge WITHOUT a recorded id stays a truthful no-op (no feedback)', async () => {
    const { worktree, branch } = await makeGitWorkspaceRepo();
    const repository = createWorkspaceRepository({ executor: makeExecutor(false) });
    await repository.upsertWorkspace(seededWorkspace({ worktreePath: worktree, branch }));
    const feedback: FeedbackCall[] = [];
    const module = await compose(repository, (inferenceId, userId, success) => {
      feedback.push({ inferenceId, userId, success });
    });

    // No recordRunInferenceId call (e.g. a run that never touched the napi tier).
    const result = await module.mergeWorkspace('ws_record_inf', {}, makePrincipal());

    expect(result.ok).toBe(true);
    expect(result.value?.merged).toBe(true);
    expect(feedback).toEqual([]);
  });
});
