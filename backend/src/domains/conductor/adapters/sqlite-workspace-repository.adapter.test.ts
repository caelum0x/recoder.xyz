/**
 * Restart-durability e2e for the sqlite state-of-record (DB-less desktop):
 * write workspace-ish state through BOTH sqlite repositories (the agent-os
 * `SqliteAgentOsRepository` as the canonical store + the conductor
 * `createSqliteWorkspaceRepository` over the SAME file), CLOSE every
 * connection, reopen fresh adapters on the same file, and assert everything —
 * workspaces, runs, the RunEvent log (order + tail cursor), tasks, reconcile
 * findings, approvals, outbox — is still there. This is the proof behind
 * `isDurable() === true` on the sqlite driver.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';
import type { RunEvent, TaskRun, TaskSpec, Workspace } from '@recoder/agent-os';
import type { Approval } from '@recoder/agent-os';
import { SqliteAgentOsRepository } from '../../agent-os/adapters/sqlite-agent-os.repository.js';
import { createSqliteWorkspaceRepository } from './sqlite-workspace-repository.adapter.js';

const dir = mkdtempSync(join(tmpdir(), 'conductor-sqlite-restart-'));
const dbPath = join(dir, 'state.sqlite');

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const workspace: Workspace = {
  workspaceId: 'ws-1',
  spaceId: 'space-1',
  projectId: 'proj-1',
  taskId: 'task-1',
  runId: 'run-1',
  runtimeId: 'claude_code',
  substrate: 'tmux_worktree',
  branch: 'recoder/ws-1',
  baseRef: 'main',
  worktreePath: '/tmp/worktrees/ws-1',
  sessionName: 'recoder-ws-1',
  state: 'running',
  createdBy: 'user-1',
  policyProfile: {
    version: 1,
    revision: 2,
    defaultToolEffect: 'allow',
    toolRules: [{
      toolName: 'skill.recoder.workspace.git_diff',
      effect: 'needs_approval',
      reason: 'review repository-wide diffs',
    }],
    swarm: { autoAnswer: true, minConfidence: 0.86 },
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'user-1',
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const run: TaskRun = {
  runId: 'run-1',
  taskId: 'task-1',
  spaceId: 'space-1',
  state: 'running',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const task: TaskSpec = {
  taskId: 'task-1',
  title: 'Fix the thing',
  intent: 'bugfix',
  goal: 'make it pass',
  spaceId: 'space-1',
  targetPaths: [],
  forbiddenPaths: [],
  acceptanceCriteria: [],
  verification: { commands: ['pnpm test'] },
  approvalRequired: [],
  artifactRequired: [],
};

const approval: Approval = {
  approvalId: 'appr-1',
  taskId: 'task-1',
  status: 'pending',
  reason: 'push to main',
  requestedBy: 'agent-1',
  requestedAt: '2026-01-01T00:00:00.000Z',
  requiredAt: 'before_push',
};

const event = (id: string, message: string): RunEvent => ({
  eventId: id,
  type: 'log',
  taskId: 'task-1',
  runId: 'run-1',
  message,
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('sqlite state-of-record — restart durability e2e', () => {
  it('survives a close + reopen with every aggregate intact', async () => {
    // --- Session 1: create workspace-ish state through both repos. ---
    const store1 = new SqliteAgentOsRepository(dbPath);
    const repo1 = createSqliteWorkspaceRepository({ path: dbPath, canonicalStore: store1 });

    expect(repo1.isDurable()).toBe(true);

    await repo1.upsertWorkspace(workspace);
    await repo1.upsertRun(run);
    await repo1.appendEvent(event('e-1', 'launching'));
    await repo1.appendEvent(event('e-2', 'running'));
    store1.upsertTask(task);
    store1.upsertApproval(approval);
    store1.appendOutbox({
      outboxId: 'ob-1',
      event: { id: 'evt-ob-1' } as never,
      status: 'pending',
      attempts: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await repo1.persistTailCursor({
      workspaceId: 'ws-1',
      runId: 'run-1',
      lastOffset: 4096,
      lastCaptureHash: 'hash-abc',
      finished: false,
    });
    await repo1.recordReconcileFinding({
      findingId: 'find-1',
      workspaceId: 'ws-1',
      kind: 'live',
      sessionName: 'recoder-ws-1',
      detail: { note: 'seen at boot' },
    });

    // --- Restart: close EVERY connection, reopen fresh adapters on the file. ---
    repo1.close();
    store1.close();

    const store2 = new SqliteAgentOsRepository(dbPath);
    const repo2 = createSqliteWorkspaceRepository({ path: dbPath, canonicalStore: store2 });

    expect(repo2.isDurable()).toBe(true);
    expect(await repo2.getWorkspace('ws-1')).toEqual(workspace);
    expect(await repo2.listWorkspaces()).toEqual([workspace]);
    expect(await repo2.listRuns()).toEqual([run]);
    expect(await repo2.listTasks()).toEqual([task]);

    // The RunEvent log survived, in append order, idempotency index intact.
    expect((await repo2.listEvents()).map((e) => e.eventId)).toEqual(['e-1', 'e-2']);
    await repo2.appendEvent(event('e-1', 'launching'));
    expect((await repo2.listEvents()).map((e) => e.eventId)).toEqual(['e-1', 'e-2']);

    // The tail cursor survived — tailing resumes without re-emitting output.
    expect(await repo2.getTailCursor('ws-1')).toMatchObject({
      workspaceId: 'ws-1',
      runId: 'run-1',
      lastOffset: 4096,
      lastCaptureHash: 'hash-abc',
      finished: false,
    });

    // The reconcile audit + agent-os aggregates survived too.
    expect(await repo2.listReconcileFindings('ws-1')).toMatchObject([
      { findingId: 'find-1', kind: 'live', detail: { note: 'seen at boot' } },
    ]);
    expect(store2.getApproval('appr-1')).toEqual(approval);
    expect(store2.listOutbox().map((r) => r.outboxId)).toEqual(['ob-1']);

    // Filtered NEWEST-first event page reads straight off the reopened file.
    const page = store2.listEventsPage({ taskId: 'task-1', limit: 10, offset: 0 });
    expect(page.total).toBe(2);
    expect(page.items.map((e) => e.eventId)).toEqual(['e-2', 'e-1']);

    repo2.close();
    store2.close();
  });
});
