import { describe, expect, it } from 'vitest';
import type { TaskEnvelope, ApprovalRequest } from '@recoder/shared/a2a';
import { buildTaskTimeline } from '../task-timeline.service';

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
    payload: { kind: 'text', text: 'do work' },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:05:00.000Z',
    history: [
      { from: 'submitted', to: 'working', transitioned_at: '2026-01-01T00:01:00.000Z' },
      { from: 'working', to: 'completed', transitioned_at: '2026-01-01T00:04:00.000Z', reason: 'done' },
    ],
    ...overrides,
  };
}

describe('buildTaskTimeline', () => {
  it('projects task lifecycle events in chronological order', () => {
    const timeline = buildTaskTimeline(baseEnvelope());

    const taskEvents = timeline.events.filter((e) => e.type === 'task');
    expect(taskEvents.map((e) => e.title)).toEqual([
      'Task created',
      'Task working',
      'Task completed: done',
    ]);
    // chronological
    const timestamps = timeline.events.map((e) => e.timestamp);
    expect([...timestamps].sort()).toEqual(timestamps);
  });

  it('includes artifact, pr, preview and approval events', () => {
    const envelope = baseEnvelope({
      result: {
        artifacts: [
          { key: 'diff', artifact_type: 'patch', mime_type: 'text/x-diff', content: '...', path: 'src/app.ts' },
        ],
        data: { prUrl: 'https://github.com/acme/repo/pull/7' },
      },
      metadata: { previewUrl: 'https://preview.example.com/run/1' },
    });

    const approvals: ApprovalRequest[] = [
      {
        approvalId: 'approval_1',
        workspaceId: 'ws_1',
        requestingAgentId: 'worker',
        targetAgentId: 'supervisor',
        action: 'merge:pr',
        details: {},
        status: 'granted',
        createdAt: '2026-01-01T00:06:00.000Z',
        resolvedAt: '2026-01-01T00:07:00.000Z',
        timeoutMs: 60_000,
      },
    ];

    const timeline = buildTaskTimeline(envelope, approvals);
    const byType = (t: string) => timeline.events.filter((e) => e.type === t);

    expect(byType('artifact')).toHaveLength(1);
    expect(byType('artifact')[0].title).toBe('Artifact: src/app.ts');

    expect(byType('pr')).toHaveLength(1);
    expect(byType('pr')[0].url).toBe('https://github.com/acme/repo/pull/7');
    expect(byType('pr')[0].status).toBe('success');

    expect(byType('preview')).toHaveLength(1);
    expect(byType('preview')[0].url).toBe('https://preview.example.com/run/1');

    expect(byType('approval')).toHaveLength(1);
    expect(byType('approval')[0].title).toBe('Approval: merge:pr');
    expect(byType('approval')[0].status).toBe('success');
  });

  it('emits one preview event per canonical result.preview link', () => {
    const envelope = baseEnvelope({
      result: {
        preview: [
          { url: 'https://preview.example.com/a', label: 'Staging' },
          { url: 'https://preview.example.com/b' },
        ],
      },
      // A loosely-typed fallback URL that must be ignored when canonical
      // preview links are present.
      metadata: { previewUrl: 'https://legacy.example.com/should-be-ignored' },
    });

    const timeline = buildTaskTimeline(envelope);
    const previews = timeline.events.filter((e) => e.type === 'preview');

    expect(previews).toHaveLength(2);
    expect(previews[0]).toMatchObject({ url: 'https://preview.example.com/a', title: 'Staging' });
    expect(previews[1]).toMatchObject({ url: 'https://preview.example.com/b', title: 'Preview deployed' });
    // The legacy metadata fallback must not also fire.
    expect(previews.some((p) => p.url === 'https://legacy.example.com/should-be-ignored')).toBe(false);
  });

  it('emits a minimal timeline for a freshly created task', () => {
    const envelope = baseEnvelope({ state: 'submitted', history: [], updated_at: '2026-01-01T00:00:00.000Z' });
    const timeline = buildTaskTimeline(envelope);
    expect(timeline.events).toHaveLength(1);
    expect(timeline.events[0]).toMatchObject({ type: 'task', title: 'Task created', status: 'pending' });
  });
});
