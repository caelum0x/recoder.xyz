/**
 * Delivery-feedback fusion — a MERGED workspace fires the inference routing
 * feedback seam (`onDeliveryFeedback`) so the BYOK LLM gateway learns
 * `task_success` from real deliveries.
 *
 * Proves THE FUSION FIRES at the composer, over a REAL on-disk git merge (no
 * scripted exec): when the run's routed `inference_id` is persisted onto the
 * workspace record (`metadata.inferenceId`), a successful `mergeWorkspace`
 * invokes the injected sink with `(inferenceId, userId, true)`. And proves the
 * degrade-truthful contract: no persisted inference_id ⇒ the sink is NEVER
 * called (the feedback still reaches the gateway via the `/inference/feedback`
 * route), and a gate deny fires no feedback (the delivery never happened).
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { Workspace } from '@recoder/agent-os';
import { createConductorModule, type ConductorModuleDeps } from './index.js';
import { createWorkspaceRepository } from './adapters/workspace-repository.adapter.js';
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
 * Build a REAL git repo with a base `main` branch and a workspace worktree whose
 * branch carries one commit ahead of base — the exact on-disk shape the LOCAL
 * merge path (`git checkout main` + `git merge --no-ff <branch>`) delivers.
 */
async function makeGitWorkspaceRepo(): Promise<{ mainRepo: string; worktree: string; branch: string }> {
  const mainRepo = await mkdtemp(join(tmpdir(), 'recoder-merge-main-'));
  cleanups.push(mainRepo);
  const git = (args: string[], cwd: string) => run('git', args, { cwd });
  await run('git', ['-c', 'init.defaultBranch=main', 'init'], { cwd: mainRepo });
  await git(['checkout', '-B', 'main'], mainRepo);
  await git(['config', 'user.email', 'test@recoder.dev'], mainRepo);
  await git(['config', 'user.name', 'Recoder Test'], mainRepo);
  await writeFile(join(mainRepo, 'README.md'), '# base\n');
  await git(['add', '.'], mainRepo);
  await git(['commit', '-m', 'init'], mainRepo);

  const branch = 'recoder/ws_merge_feedback';
  const worktree = `${mainRepo}-wt`;
  cleanups.push(worktree);
  await git(['worktree', 'add', worktree, '-b', branch], mainRepo);
  await writeFile(join(worktree, 'feature.txt'), 'agent work\n');
  await git(['add', '.'], worktree);
  await git(['commit', '-m', 'feature'], worktree);
  return { mainRepo, worktree, branch };
}

function seededWorkspace(worktree: string, branch: string, metadata: Record<string, unknown>): Workspace {
  const now = new Date().toISOString();
  return {
    workspaceId: 'ws_merge_feedback',
    spaceId: 'space_1',
    projectId: 'project_1',
    taskId: 'task_1',
    runId: 'run_ws_merge_feedback',
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch,
    baseRef: 'main',
    worktreePath: worktree,
    state: 'awaiting_review',
    createdBy: 'user_test',
    createdAt: now,
    updatedAt: now,
    metadata,
  };
}

async function composeWithSeed(
  metadata: Record<string, unknown>,
  gate = makeGate('allow'),
): Promise<{ module: ReturnType<typeof createConductorModule>; feedback: FeedbackCall[]; worktree: string }> {
  const { worktree, branch } = await makeGitWorkspaceRepo();
  const repository = createWorkspaceRepository({ executor: makeExecutor(false) });
  await repository.upsertWorkspace(seededWorkspace(worktree, branch, metadata));
  const feedback: FeedbackCall[] = [];
  const onDeliveryFeedback: ConductorModuleDeps['onDeliveryFeedback'] = (inferenceId, userId, success) => {
    feedback.push({ inferenceId, userId, success });
  };
  const module = createConductorModule({
    config: makeConfig(),
    logger: makeLogger(),
    executor: makeExecutor(false),
    middleware: makeMiddleware(),
    gate,
    repository,
    substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
    onDeliveryFeedback,
  });
  return { module, feedback, worktree };
}

describe('conductor delivery-feedback fusion (real git merge)', () => {
  it('fires onDeliveryFeedback with the persisted inference_id when a merge lands', async () => {
    const { module, feedback } = await composeWithSeed({ inferenceId: 'inf-abc123' });

    const result = await module.mergeWorkspace('ws_merge_feedback', {}, makePrincipal());

    expect(result.ok).toBe(true);
    expect(result.value?.merged).toBe(true);
    // THE FUSION: the merge delivered → the inference routing feedback seam fired.
    expect(feedback).toEqual([{ inferenceId: 'inf-abc123', userId: 'user_test', success: true }]);
    // increment-2 close: POST /merge surfaces the sealed durable audit chain id
    // (id/seq/entryHash) so the cockpit evidence artifact cites a queryable entry.
    expect(typeof result.value?.auditId).toBe('string');
    expect(result.value?.auditId?.length ?? 0).toBeGreaterThan(0);
    expect(result.value?.auditSeq).toBeGreaterThan(0);
    expect((result.value?.auditEntryHash ?? '').length).toBe(64);
  });

  it('does NOT fire feedback when no inference_id was persisted (degrade-truthful)', async () => {
    const { module, feedback } = await composeWithSeed({});

    const result = await module.mergeWorkspace('ws_merge_feedback', {}, makePrincipal());

    expect(result.ok).toBe(true);
    expect(result.value?.merged).toBe(true);
    // No persisted inference_id ⇒ silent skip (feedback still flows via the route).
    expect(feedback).toEqual([]);
  });

  it('fires NO feedback when the gate denies the merge (no delivery happened)', async () => {
    const { module, feedback } = await composeWithSeed({ inferenceId: 'inf-abc123' }, makeGate('deny'));

    const result = await module.mergeWorkspace('ws_merge_feedback', {}, makePrincipal());

    expect(result.ok).toBe(false);
    expect(feedback).toEqual([]);
  });
});
