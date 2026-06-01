import { describe, expect, it } from 'vitest';
import type { TaskEnvelope, ApprovalRequest, AuditEvent } from '@recoder/shared/a2a';
import { buildRunHistory } from '../run-history.service';

function baseEnvelope(overrides: Partial<TaskEnvelope> = {}): TaskEnvelope {
  return {
    envelope_version: '1.0.0',
    id: 'task_1',
    workspace_id: 'ws_1',
    thread_id: 'thread_1',
    trace_id: 'trace_1',
    state: 'completed',
    requester: { agent_id: 'supervisor', platform: 'recoder_pm' },
    assignee: { agent_id: 'worker', platform: 'codex' },
    connector: { connector_id: 'c1', platform: 'codex', protocol: 'a2a' },
    payload: { kind: 'text', text: 'build the landing page' },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:05:00.000Z',
    history: [
      { from: 'submitted', to: 'working', transitioned_at: '2026-01-01T00:01:00.000Z' },
      { from: 'working', to: 'completed', transitioned_at: '2026-01-01T00:04:00.000Z', reason: 'done' },
    ],
    ...overrides,
  };
}

function auditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    schema_version: '1.0.0',
    id: 'evt_1',
    event_type: 'task.started',
    actor: { kind: 'agent', id: 'worker' },
    target: { kind: 'task', id: 'task_1' },
    trace_id: 'trace_1',
    workspace_id: 'ws_1',
    task_id: 'task_1',
    timestamp: '2026-01-01T00:02:00.000Z',
    severity: 'info',
    ...overrides,
  };
}

describe('buildRunHistory', () => {
  it('aggregates per-task timelines and exposes prompt + assignee summaries', () => {
    const history = buildRunHistory('ws_1', [baseEnvelope()]);

    expect(history.workspaceId).toBe('ws_1');
    expect(history.tasks).toHaveLength(1);
    expect(history.tasks[0]).toMatchObject({
      taskId: 'task_1',
      prompt: 'build the landing page',
      assignee: 'worker',
      requester: 'supervisor',
      state: 'completed',
    });

    // Reuses buildTaskTimeline: lifecycle events are present and tagged to task.
    const taskEntries = history.entries.filter((e) => e.type === 'task');
    expect(taskEntries.map((e) => e.title)).toEqual([
      'Task created',
      'Task working',
      'Task completed: done',
    ]);
    expect(taskEntries.every((e) => e.taskId === 'task_1')).toBe(true);
  });

  it('merges multiple tasks into one chronologically-ordered stream', () => {
    const t1 = baseEnvelope({ id: 'task_1', created_at: '2026-01-01T00:00:00.000Z', history: [] });
    const t2 = baseEnvelope({
      id: 'task_2',
      created_at: '2026-01-01T00:03:00.000Z',
      history: [],
      payload: { kind: 'text', text: 'second task' },
    });

    const history = buildRunHistory('ws_1', [t2, t1]);

    expect(history.tasks.map((t) => t.taskId).sort()).toEqual(['task_1', 'task_2']);
    const timestamps = history.entries.map((e) => e.timestamp);
    expect([...timestamps].sort()).toEqual(timestamps);
  });

  it('only includes tasks and audit events for the requested workspace', () => {
    const inWs = baseEnvelope({ id: 'task_1', workspace_id: 'ws_1' });
    const otherWs = baseEnvelope({ id: 'task_2', workspace_id: 'ws_2' });
    const audits = [
      auditEvent({ id: 'a1', workspace_id: 'ws_1', task_id: 'task_1' }),
      auditEvent({ id: 'a2', workspace_id: 'ws_2', task_id: 'task_2' }),
    ];

    const history = buildRunHistory('ws_1', [inWs, otherWs], [], audits);

    expect(history.tasks.map((t) => t.taskId)).toEqual(['task_1']);
    expect(history.entries.some((e) => e.id === 'audit:a2')).toBe(false);
    expect(history.entries.some((e) => e.id === 'audit:a1')).toBe(true);
  });

  it('surfaces policy audit events as decision entries', () => {
    const decision = auditEvent({
      id: 'a3',
      event_type: 'policy.denied',
      policy: {
        action: 'file:write',
        rule: 'deny',
        approved: false,
        reason: 'protected path',
        agent_id: 'worker',
      },
    });

    const history = buildRunHistory('ws_1', [baseEnvelope()], [], [decision]);
    const decisions = history.entries.filter((e) => e.type === 'decision');

    expect(decisions).toHaveLength(1);
    expect(decisions[0].title).toBe('Decision: file:write denied');
    expect(decisions[0].status).toBe('failed');
    expect(decisions[0].taskId).toBe('task_1');
  });

  it('routes per-task approvals into the originating task lane', () => {
    const approval: ApprovalRequest = {
      approvalId: 'approval_1',
      workspaceId: 'ws_1',
      requestingAgentId: 'worker',
      targetAgentId: 'supervisor',
      action: 'merge:pr',
      details: { sourceTaskId: 'task_1' },
      status: 'granted',
      createdAt: '2026-01-01T00:06:00.000Z',
      resolvedAt: '2026-01-01T00:07:00.000Z',
      timeoutMs: 60_000,
    };

    const history = buildRunHistory('ws_1', [baseEnvelope()], [approval]);
    const approvals = history.entries.filter((e) => e.type === 'approval');

    expect(approvals).toHaveLength(1);
    expect(approvals[0].title).toBe('Approval: merge:pr');
    expect(approvals[0].taskId).toBe('task_1');
    expect(approvals[0].status).toBe('success');
  });

  it('filters to a single task (run) when taskId is provided', () => {
    const t1 = baseEnvelope({ id: 'task_1', history: [] });
    const t2 = baseEnvelope({ id: 'task_2', history: [] });
    const audits = [auditEvent({ id: 'a1', task_id: 'task_2' })];

    const history = buildRunHistory('ws_1', [t1, t2], [], audits, { taskId: 'task_2' });

    expect(history.tasks.map((t) => t.taskId)).toEqual(['task_2']);
    expect(history.entries.every((e) => e.taskId === 'task_2')).toBe(true);
    expect(history.entries.some((e) => e.id === 'audit:a1')).toBe(true);
  });

  it('filters by entry type', () => {
    const env = baseEnvelope({
      result: {
        artifacts: [
          { key: 'diff', artifact_type: 'patch', mime_type: 'text/x-diff', content: '...', path: 'src/app.ts' },
        ],
      },
    });

    const history = buildRunHistory('ws_1', [env], [], [], { types: ['artifact'] });

    expect(history.entries).toHaveLength(1);
    expect(history.entries[0].type).toBe('artifact');
  });

  it('applies a since lower bound and a limit', () => {
    const env = baseEnvelope();

    const since = buildRunHistory('ws_1', [env], [], [], {
      since: '2026-01-01T00:03:00.000Z',
    });
    expect(since.entries.every((e) => e.timestamp >= '2026-01-01T00:03:00.000Z')).toBe(true);

    const limited = buildRunHistory('ws_1', [env], [], [], { limit: 1 });
    expect(limited.entries).toHaveLength(1);
    // Keeps the most recent entry while preserving order.
    const all = buildRunHistory('ws_1', [env]);
    expect(limited.entries[0].timestamp).toBe(all.entries[all.entries.length - 1].timestamp);
  });

  it('returns an empty projection for a workspace with no tasks', () => {
    const history = buildRunHistory('ws_empty', []);
    expect(history.tasks).toEqual([]);
    expect(history.entries).toEqual([]);
  });
});
