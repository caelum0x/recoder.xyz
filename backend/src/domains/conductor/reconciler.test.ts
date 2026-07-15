/**
 * Reconciler — restart survivability.
 *
 * After a backend restart the in-memory session map is empty, so reconcile
 * queries the REAL substrate directly (via the scan seam) and joins it against
 * persisted workspaces. This proves the orphan path: a persisted `running`
 * workspace whose live session is gone is FINALIZED to a terminal `failed` record
 * with truthful metadata (never left dangling, never a fabricated success) and
 * reported in the reconcile report. Live work is never killed by the pass.
 */
import { describe, it, expect } from 'vitest';
import type { Workspace } from '@recoder/agent-os';
import { createWorkspaceRepository } from './adapters/workspace-repository.adapter.js';
import { composeConductor, FakeSubstrate, makeExecutor, makePrincipal } from './__fixtures__/harness.js';

function runningWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  const now = new Date().toISOString();
  return {
    workspaceId: 'ws_crashed',
    spaceId: 'space_1',
    projectId: 'project_1',
    taskId: 'task_1',
    runId: 'run_ws_crashed',
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: 'recoder/ws_crashed',
    baseRef: 'HEAD',
    sessionName: 'sess_crashed',
    worktreePath: '/tmp/wt/ws_crashed',
    state: 'running',
    createdBy: 'user_test',
    createdAt: now,
    updatedAt: now,
    metadata: {},
    ...overrides,
  };
}

describe('conductor reconciler (restart-survivable)', () => {
  it('finalizes a crashed orphan (session gone) to a truthful terminal record', async () => {
    const repository = createWorkspaceRepository({ executor: makeExecutor(false) });
    await repository.upsertWorkspace(runningWorkspace());

    // No live sessions are visible to the scan (simulates a post-restart empty host).
    const { module } = composeConductor({
      substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
      repository,
    });

    const result = await module.reconcile(makePrincipal());

    expect(result.ok).toBe(true);
    const report = result.value!;
    expect(report.orphanedWorkspaces).toContain('ws_crashed');
    expect(report.finalized).toContain('ws_crashed');
    expect(report.live).not.toContain('ws_crashed');

    const finalized = await repository.getWorkspace('ws_crashed');
    expect(finalized?.state).toBe('failed');
  });

  it('reports an empty, well-formed pass when there are no persisted workspaces', async () => {
    const repository = createWorkspaceRepository({ executor: makeExecutor(false) });
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      repository,
    });

    const result = await module.reconcile(makePrincipal());

    expect(result.ok).toBe(true);
    expect(result.value?.orphanedWorkspaces).toHaveLength(0);
    expect(result.value?.live).toHaveLength(0);
    expect(result.value?.checkedAt).toBeTruthy();
  });

  it('does not finalize a terminal record (never re-touches completed work)', async () => {
    const repository = createWorkspaceRepository({ executor: makeExecutor(false) });
    await repository.upsertWorkspace(runningWorkspace({ workspaceId: 'ws_done', state: 'merged' }));
    const { module } = composeConductor({ substrates: [new FakeSubstrate()], repository });

    const result = await module.reconcile(makePrincipal());

    expect(result.value?.orphanedWorkspaces).not.toContain('ws_done');
    expect((await repository.getWorkspace('ws_done'))?.state).toBe('merged');
  });
});
