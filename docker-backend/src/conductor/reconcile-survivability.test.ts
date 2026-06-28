/**
 * Reconcile survivability unit test (no tmux required).
 *
 * Proves the restart-survivability path in `reconcile()` without launching any
 * real tmux session: a non-terminal workspace whose tmux session is NOT live
 * (the always-true case here, since the seeded session name is a random,
 * never-launched name) is a CRASHED ORPHAN and must be FINALIZED — advanced to a
 * terminal record state, its open run closed, and a terminal RunEvent emitted —
 * instead of left dangling forever.
 *
 * It drives the REAL `reconcile()` over the REAL in-memory AgentOsRepository
 * singleton (the default driver when no AGENT_OS_DATABASE_URL is set). Nothing in
 * the reconcile logic is stubbed; only the seeded records are test data.
 *
 * The companion file conductor-locks.test.ts covers the self-safe lock
 * re-acquire; this file covers orphan finalization end-to-end through the repo.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { TaskRun, Workspace } from '@recoder/agent-os';
import { agentOsContainer } from '../agent-os/service-container';
import { reconcile, listWorkspaceEvents } from './workspace-service.js';

// This suite only makes sense over the in-memory repo. If a Postgres driver is
// configured in the environment, skip rather than mutate a real database.
const usingMemoryRepo = agentOsContainer.repositoryDriver === 'memory';

describe.skipIf(!usingMemoryRepo)('reconcile survivability (no tmux)', () => {
  const repo = agentOsContainer.repository;

  // A session name that is guaranteed NOT to be a live tmux session: random,
  // never launched. So `reconcile()` always classifies the workspace as orphaned.
  const orphanWsId = `ws_${randomUUID()}`;
  const orphanRunId = `run_${orphanWsId}`;
  const deadSession = `recoder-never-launched-${randomUUID()}`;

  beforeAll(async () => {
    const now = new Date().toISOString();
    const workspace: Workspace = {
      workspaceId: orphanWsId,
      spaceId: 'space_reconcile_test',
      projectId: 'proj_reconcile_test',
      taskId: 'task_reconcile_test',
      runId: orphanRunId,
      runtimeId: 'claude_code',
      substrate: 'tmux_worktree',
      branch: 'recoder/reconcile-test',
      baseRef: 'HEAD',
      sessionName: deadSession,
      state: 'running',
      createdBy: 'reconcile-test',
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };
    await repo.upsertWorkspace(workspace);

    // An OPEN run that reconcile should close to a terminal state.
    const run: TaskRun = {
      runId: orphanRunId,
      taskId: 'task_reconcile_test',
      spaceId: 'space_reconcile_test',
      state: 'running',
      startedAt: now,
      updatedAt: now,
      metadata: { workspaceId: orphanWsId },
    };
    await repo.upsertRun(run);
  });

  it('finalizes a crashed orphan: terminal record + closed run + terminal event', async () => {
    const report = await reconcile();

    // The orphan is detected and finalized this pass.
    expect(report.orphanedWorkspaces).toContain(orphanWsId);
    expect(report.finalized).toContain(orphanWsId);

    // Workspace advanced to a terminal lifecycle state with truthful reconcile
    // metadata (no fabricated success).
    const ws = await repo.getWorkspace(orphanWsId);
    expect(ws).not.toBeNull();
    expect(ws?.state).toBe('failed');
    const reconcileMeta = ws?.metadata?.reconcile as Record<string, unknown> | undefined;
    expect(reconcileMeta?.finalized).toBe(true);
    expect(reconcileMeta?.sessionMissing).toBe(true);

    // The open run is closed to a terminal state.
    const runs = await repo.listRuns();
    const run = runs.find((r) => r.runId === orphanRunId);
    expect(run).toBeTruthy();
    expect(['completed', 'failed', 'cancelled', 'rejected']).toContain(run?.state);
    expect(run?.completedAt).toBeTruthy();

    // A terminal RunEvent was emitted into the audit log, attributed to reconcile.
    const events = await listWorkspaceEvents(orphanWsId);
    const terminal = events.find((e) => e.type === 'completed' || e.type === 'failed');
    expect(terminal).toBeTruthy();
    expect((terminal?.data as Record<string, unknown> | undefined)?.finalizedBy).toBe('reconcile');
  });

  it('is idempotent: a finalized (terminal) orphan is not re-finalized', async () => {
    // The workspace is now `failed` (non-terminal per isTerminalWorkspaceState,
    // which only treats `archived` as terminal) but is no longer `running` /
    // `awaiting_approval`, so reconcile neither lists nor re-finalizes it.
    const report = await reconcile();
    expect(report.orphanedWorkspaces).not.toContain(orphanWsId);
    expect(report.finalized).not.toContain(orphanWsId);
  });
});
