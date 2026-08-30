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
import {
  composeConductor,
  FakeSubstrate,
  makeExecutor,
  makePrincipal,
} from './__fixtures__/harness.js';

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
    const repository = createWorkspaceRepository({
      executor: makeExecutor(false),
    });
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

  it('finalizes an INTERRUPTED orphan (unknown exit) as failed — never a fabricated completed/exit-0', async () => {
    const repository = createWorkspaceRepository({
      executor: makeExecutor(false),
    });
    await repository.upsertWorkspace(
      runningWorkspace({
        workspaceId: 'ws_acp',
        runId: 'run_ws_acp',
        substrate: 'acp',
      })
    );
    await repository.upsertRun({
      runId: 'run_ws_acp',
      taskId: 'task_1',
      spaceId: 'space_1',
      state: 'running',
      updatedAt: new Date().toISOString(),
    });

    // A substrate that can't determine the orphan's outcome (an ACP session the
    // tmux-keyed scan can't see, interrupted by the restart) reports `undefined`.
    const { module } = composeConductor({
      substrates: [
        new FakeSubstrate({ id: 'acp', missingExitCode: undefined }),
      ],
      repository,
    });

    const result = await module.reconcile(makePrincipal());
    expect(result.ok).toBe(true);
    expect(result.value!.finalized).toContain('ws_acp');

    // The run + the terminal RunEvent are FAILED (truthful), not completed/exit-0.
    const runs = await repository.listRuns();
    const run = runs.find(r => r.runId === 'run_ws_acp');
    expect(run?.state).toBe('failed');
    const events = await repository.listEvents();
    const terminal = events.filter(
      e =>
        e.runId === 'run_ws_acp' &&
        (e.type === 'completed' || e.type === 'failed')
    );
    expect(terminal).toHaveLength(1);
    expect(terminal[0]!.type).toBe('failed');
    // and it must NOT fabricate a clean exit 0.
    expect((terminal[0]!.data as { exitCode?: unknown }).exitCode).not.toBe(0);
  });

  it('finalizes a GONE orphan (null exit) as failed — never treats a missing handle as clean', async () => {
    const repository = createWorkspaceRepository({ executor: makeExecutor(false) });
    await repository.upsertWorkspace(
      runningWorkspace({ workspaceId: 'ws_gone', runId: 'run_ws_gone', runtimeId: 'cursor' })
    );
    await repository.upsertRun({
      runId: 'run_ws_gone',
      taskId: 'task_1',
      spaceId: 'space_1',
      state: 'running',
      updatedAt: new Date().toISOString(),
    });

    const { module } = composeConductor({
      substrates: [new FakeSubstrate({ id: 'tmux_worktree', missingExitCode: null })],
      repository,
    });

    const result = await module.reconcile(makePrincipal());
    expect(result.ok).toBe(true);
    expect(result.value!.finalized).toContain('ws_gone');
    expect((await repository.listRuns()).find(run => run.runId === 'run_ws_gone')?.state).toBe('failed');
    const terminal = (await repository.listEvents()).find(
      event => event.runId === 'run_ws_gone' && (event.type === 'completed' || event.type === 'failed')
    );
    expect(terminal?.type).toBe('failed');
    expect(terminal?.data?.exitCode).toBeNull();
  });

  it('reports an empty, well-formed pass when there are no persisted workspaces', async () => {
    const repository = createWorkspaceRepository({
      executor: makeExecutor(false),
    });
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

  it('RESUMES a crashed orphan carrying a native session ref instead of finalizing it', async () => {
    const repository = createWorkspaceRepository({
      executor: makeExecutor(false),
    });
    // A crashed `running` orphan whose durable state carries the agent's own native
    // session ref (claude `--resume <id>`). Its live session is gone (empty scan).
    await repository.upsertWorkspace(
      runningWorkspace({
        workspaceId: 'ws_resumable',
        runId: 'run_ws_resumable',
        runtimeId: 'claude_code',
        metadata: { resume: { sessionRef: 'sess-abc-123' } },
      })
    );

    const { module } = composeConductor({
      substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
      repository,
    });

    const result = await module.reconcile(makePrincipal());
    expect(result.ok).toBe(true);
    const report = result.value!;

    // It was orphaned (session gone) but RESUMED — never finalized to failed.
    expect(report.orphanedWorkspaces).toContain('ws_resumable');
    expect(report.resumed).toContain('ws_resumable');
    expect(report.finalized).not.toContain('ws_resumable');

    // The record is NOT transitioned to a terminal state — the agent's run is live.
    const ws = await repository.getWorkspace('ws_resumable');
    expect(ws?.state).toBe('running');
    expect((ws?.metadata?.resume as { attempts?: number }).attempts).toBe(1);
    expect((ws?.metadata?.resume as { nextAttemptAt?: string }).nextAttemptAt).toBeTruthy();

    // A truthful resume RunEvent is recorded (never a fabricated completion/failure).
    const events = await repository.listEvents();
    const resumeEvents = events.filter(
      e => e.runId === 'run_ws_resumable' && e.type === 'log'
    );
    expect(resumeEvents.length).toBeGreaterThanOrEqual(1);
    expect((resumeEvents[0]!.data as { resumedBy?: unknown }).resumedBy).toBe(
      'reconcile'
    );
    // The captured buffer is NOT replayed — no completed/failed terminal event.
    const terminal = events.filter(
      e =>
        e.runId === 'run_ws_resumable' &&
        (e.type === 'completed' || e.type === 'failed')
    );
    expect(terminal).toHaveLength(0);
  });

  it('finalizes (does NOT resume) an orphan whose runtime has no native resume', async () => {
    const repository = createWorkspaceRepository({
      executor: makeExecutor(false),
    });
    // A native session ref IS present, but `cursor` has no native resume seam ⇒ the
    // registry returns null and the orphan stays truthfully finalized-to-failed.
    await repository.upsertWorkspace(
      runningWorkspace({
        workspaceId: 'ws_no_resume',
        runId: 'run_ws_no_resume',
        runtimeId: 'cursor',
        metadata: { resume: { sessionRef: 'sess-xyz' } },
      })
    );

    const { module } = composeConductor({
      substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
      repository,
    });

    const result = await module.reconcile(makePrincipal());
    const report = result.value!;
    expect(report.resumed).not.toContain('ws_no_resume');
    expect(report.finalized).toContain('ws_no_resume');
    expect((await repository.getWorkspace('ws_no_resume'))?.state).toBe(
      'failed'
    );
  });

  it('does not resume an awaiting-approval orphan', async () => {
    const repository = createWorkspaceRepository({ executor: makeExecutor(false) });
    await repository.upsertWorkspace(
      runningWorkspace({
        workspaceId: 'ws_waiting',
        state: 'awaiting_approval',
        metadata: { resume: { sessionRef: 'sess-waiting' } },
      })
    );
    const { module } = composeConductor({
      substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
      repository,
    });

    const result = await module.reconcile(makePrincipal());
    expect(result.ok).toBe(true);
    expect(result.value!.resumed).not.toContain('ws_waiting');
    expect(result.value!.orphanedWorkspaces).not.toContain('ws_waiting');
    expect((await repository.getWorkspace('ws_waiting'))?.state).toBe('awaiting_approval');
  });

  it('finalizes after the persisted native-resume attempt limit', async () => {
    const repository = createWorkspaceRepository({ executor: makeExecutor(false) });
    await repository.upsertWorkspace(
      runningWorkspace({
        workspaceId: 'ws_resume_limit',
        metadata: { resume: { sessionRef: 'sess-limit', attempts: 3 } },
      })
    );
    const { module } = composeConductor({
      substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
      repository,
    });

    const result = await module.reconcile(makePrincipal());
    expect(result.ok).toBe(true);
    expect(result.value!.resumed).not.toContain('ws_resume_limit');
    expect(result.value!.finalized).toContain('ws_resume_limit');
    expect((await repository.getWorkspace('ws_resume_limit'))?.state).toBe('failed');
  });

  it('DEDUPE: two orphans sharing one native session resume it at most once', async () => {
    const repository = createWorkspaceRepository({
      executor: makeExecutor(false),
    });
    // Two crashed orphans point at the SAME (runtimeId, sessionRef). Only one may
    // resume that session; the other must fall through to a truthful finalize.
    await repository.upsertWorkspace(
      runningWorkspace({
        workspaceId: 'ws_dup_a',
        runId: 'run_dup_a',
        runtimeId: 'claude_code',
        sessionName: 'sess_dup_a',
        metadata: { resume: { sessionRef: 'shared-session' } },
      })
    );
    await repository.upsertWorkspace(
      runningWorkspace({
        workspaceId: 'ws_dup_b',
        runId: 'run_dup_b',
        runtimeId: 'claude_code',
        sessionName: 'sess_dup_b',
        metadata: { resume: { sessionRef: 'shared-session' } },
      })
    );

    const { module } = composeConductor({
      substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
      repository,
    });

    const result = await module.reconcile(makePrincipal());
    const report = result.value!;
    // Exactly one of the two resumed; the other finalized. Same session, resumed once.
    expect(report.resumed).toHaveLength(1);
    const [resumedId] = report.resumed;
    const finalizedId = resumedId === 'ws_dup_a' ? 'ws_dup_b' : 'ws_dup_a';
    expect(report.finalized).toContain(finalizedId);
    expect(report.resumed).not.toContain(finalizedId);
  });

  it('does not finalize a terminal record (never re-touches completed work)', async () => {
    const repository = createWorkspaceRepository({
      executor: makeExecutor(false),
    });
    await repository.upsertWorkspace(
      runningWorkspace({ workspaceId: 'ws_done', state: 'merged' })
    );
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      repository,
    });

    const result = await module.reconcile(makePrincipal());

    expect(result.value?.orphanedWorkspaces).not.toContain('ws_done');
    expect((await repository.getWorkspace('ws_done'))?.state).toBe('merged');
  });
});
