/**
 * Tests for delivery-summary — the completion artifact + memory candidate builder.
 *
 * These drive the REAL module over the REAL in-memory AgentOsRepository singleton
 * (default when no AGENT_OS_DATABASE_URL is set). The workspace + RunEvents are
 * seeded into the real repo; generateDeliverySummary / generateMemoryCandidate
 * read them back through the real code path.
 *
 * The only external IO seam exercised here is the git diff: the seeded workspace
 * points at a worktreePath that does not exist, so `workspaceDiff` (real git)
 * fails and the module's own catch path falls back to an empty diff. That is the
 * REAL degrade-safe branch, not a stub — we never fake a diff result.
 *
 * Skips on a Postgres driver rather than mutate a real database.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { RunEvent, Workspace } from '@recoder/agent-os';
import { agentOsContainer } from '../agent-os/service-container';
import { generateDeliverySummary, generateMemoryCandidate } from './delivery-summary.js';

const usingMemoryRepo = agentOsContainer.repositoryDriver === 'memory';

describe.skipIf(!usingMemoryRepo)('delivery-summary (real in-memory AgentOsRepository)', () => {
  const repo = agentOsContainer.repository;

  function seedWorkspace(overrides: Partial<Workspace> = {}): Promise<Workspace> {
    const now = new Date().toISOString();
    const workspaceId = `ws_${randomUUID()}`;
    const ws: Workspace = {
      workspaceId,
      spaceId: 'space_summary',
      projectId: 'proj_summary',
      taskId: `task_${randomUUID()}`,
      runtimeId: 'claude_code',
      substrate: 'tmux_worktree',
      branch: 'recoder/summary-test',
      baseRef: 'HEAD',
      // Intentionally non-existent worktree -> real workspaceDiff fails -> the
      // module's own catch path returns the empty-diff fallback.
      worktreePath: `/tmp/recoder-nonexistent-${workspaceId}`,
      state: 'awaiting_review',
      runId: `run_${workspaceId}`,
      createdBy: 'summary-test',
      createdAt: now,
      updatedAt: now,
      metadata: {},
      ...overrides,
    };
    return repo.upsertWorkspace(ws);
  }

  function appendEvent(ws: Workspace, event: Partial<RunEvent> & Pick<RunEvent, 'type'>): void {
    // listWorkspaceEvents filters by runId === `run_${workspaceId}`.
    const runId = `run_${ws.workspaceId}`;
    repo.appendEvent({
      eventId: `event_${randomUUID()}`,
      taskId: ws.taskId,
      runId,
      createdAt: new Date().toISOString(),
      ...event,
    });
  }

  let taskId: string;
  beforeEach(() => {
    taskId = `task_${randomUUID()}`;
  });

  it('throws a truthful error when the workspace does not exist', async () => {
    await expect(generateDeliverySummary('ws_does_not_exist')).rejects.toThrow(/workspace not found/);
  });

  it('assembles the summary shape from a completed workspace (exit 0 -> success)', async () => {
    const ws = await seedWorkspace({ taskId });
    appendEvent(ws, { type: 'started', createdAt: '2026-01-01T00:00:00.000Z' });
    appendEvent(ws, { type: 'log', message: 'building project' });
    appendEvent(ws, { type: 'log', message: 'tests passed' });
    appendEvent(ws, {
      type: 'completed',
      message: 'done',
      createdAt: '2026-01-01T00:05:00.000Z',
      data: { exitCode: 0 },
    });

    const summary = await generateDeliverySummary(ws.workspaceId);

    expect(summary.workspaceId).toBe(ws.workspaceId);
    expect(summary.taskId).toBe(taskId);
    expect(summary.runId).toBe(`run_${ws.workspaceId}`);
    expect(summary.runtimeId).toBe('claude_code');
    expect(summary.state).toBe('awaiting_review');
    expect(summary.exitCode).toBe(0);
    expect(summary.success).toBe(true);
    // Real git diff failed on the missing worktree -> empty-diff fallback.
    expect(summary.diffStat).toBe('');
    expect(summary.changedFiles).toBe(0);
    expect(summary.untrackedFiles).toEqual([]);
    // Key log lines collected from the run's messages (started/log/completed all
    // carry a message here).
    expect(summary.keyLogLines).toContain('building project');
    expect(summary.keyLogLines).toContain('tests passed');
    expect(summary.startedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(summary.completedAt).toBe('2026-01-01T00:05:00.000Z');
  });

  it('marks a non-zero exit as a failure and surfaces the real exit code', async () => {
    const ws = await seedWorkspace({ taskId });
    appendEvent(ws, { type: 'log', message: 'compile error' });
    appendEvent(ws, { type: 'failed', message: 'crashed', data: { exitCode: 1 } });

    const summary = await generateDeliverySummary(ws.workspaceId);
    expect(summary.exitCode).toBe(1);
    expect(summary.success).toBe(false);
  });

  it('falls back to a generated completedAt + null exit when no terminal event exists', async () => {
    const ws = await seedWorkspace({ taskId });
    appendEvent(ws, { type: 'log', message: 'still running' });

    const summary = await generateDeliverySummary(ws.workspaceId);
    expect(summary.exitCode).toBeNull();
    expect(summary.success).toBe(false);
    expect(Number.isNaN(Date.parse(summary.completedAt))).toBe(false);
  });
});

describe.skipIf(!usingMemoryRepo)('delivery-summary memory candidate (real proposal builder)', () => {
  const repo = agentOsContainer.repository;

  function seedWorkspace(): Promise<Workspace> {
    const now = new Date().toISOString();
    const workspaceId = `ws_${randomUUID()}`;
    const ws: Workspace = {
      workspaceId,
      spaceId: 'space_mc',
      projectId: 'proj_mc',
      taskId: `task_${randomUUID()}`,
      runtimeId: 'claude_code',
      substrate: 'tmux_worktree',
      branch: 'recoder/mc-test',
      baseRef: 'HEAD',
      worktreePath: `/tmp/recoder-nonexistent-${workspaceId}`,
      state: 'awaiting_review',
      runId: `run_${workspaceId}`,
      createdBy: 'mc-test',
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };
    return repo.upsertWorkspace(ws);
  }

  it('returns null when the workspace is unknown', async () => {
    expect(await generateMemoryCandidate('ws_unknown')).toBeNull();
  });

  it('skips the candidate when there are no changes and no notable logs', async () => {
    const ws = await seedWorkspace();
    // No diff (missing worktree) and no log events -> nothing worth proposing.
    repo.appendEvent({
      eventId: `event_${randomUUID()}`,
      type: 'completed',
      taskId: ws.taskId,
      runId: `run_${ws.workspaceId}`,
      createdAt: new Date().toISOString(),
      data: { exitCode: 0 },
    });
    expect(await generateMemoryCandidate(ws.workspaceId)).toBeNull();
  });

  it('proposes (never durably writes) a candidate with evidence when notable logs exist', async () => {
    const ws = await seedWorkspace();
    repo.appendEvent({
      eventId: `event_${randomUUID()}`,
      type: 'log',
      taskId: ws.taskId,
      runId: `run_${ws.workspaceId}`,
      message: 'migration applied successfully',
      createdAt: new Date().toISOString(),
    });
    repo.appendEvent({
      eventId: `event_${randomUUID()}`,
      type: 'completed',
      taskId: ws.taskId,
      runId: `run_${ws.workspaceId}`,
      createdAt: new Date().toISOString(),
      data: { exitCode: 0 },
    });

    const candidate = await generateMemoryCandidate(ws.workspaceId);
    expect(candidate).not.toBeNull();
    if (!candidate) throw new Error('expected candidate');

    // It is a PROPOSAL with evidence, scoped to the task — never durable memory.
    expect(candidate.status).toBe('proposed');
    expect(candidate.scope).toBe('task');
    expect(candidate.workspaceId).toBe(ws.workspaceId);
    expect(candidate.taskId).toBe(ws.taskId);
    expect(candidate.candidateId.startsWith('mc_')).toBe(true);
    expect(candidate.content).toContain(ws.taskId);
    expect(candidate.content).toContain('Exited successfully (0).');
    expect(candidate.content).toContain('migration applied successfully');
    expect(candidate.evidence.exitCode).toBe(0);
    expect(candidate.evidence.keyLogs).toContain('migration applied successfully');
    expect(Number.isNaN(Date.parse(candidate.proposedAt))).toBe(false);
  });
});
