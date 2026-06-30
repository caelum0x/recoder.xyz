/**
 * Unit tests for the Conductor / Agent OS payload parsers.
 *
 * These cover the defensive normalisation the mobile monitor relies on: valid
 * payloads parse, malformed items are dropped (not thrown), and envelopes are
 * unwrapped. Pure functions — no network, no react-native.
 */

import {
  parseApproval,
  parseRun,
  parseRunEvent,
  parseWorkspace,
  unwrapEnvelope,
} from '@/lib/conductor/parsers';

describe('unwrapEnvelope', () => {
  it('unwraps a { success, data } envelope', () => {
    expect(unwrapEnvelope({ success: true, data: [1, 2] })).toEqual([1, 2]);
  });

  it('passes through a bare array', () => {
    expect(unwrapEnvelope([1, 2])).toEqual([1, 2]);
  });

  it('passes through a plain object without data', () => {
    expect(unwrapEnvelope({ foo: 'bar' })).toEqual({ foo: 'bar' });
  });
});

describe('parseWorkspace', () => {
  it('parses a complete workspace', () => {
    const ws = parseWorkspace({
      workspaceId: 'ws-1',
      spaceId: 'space-1',
      projectId: 'proj-1',
      taskId: 'task-1',
      runtimeId: 'claude_code',
      substrate: 'in_process',
      branch: 'feat/x',
      baseRef: 'main',
      state: 'running',
      createdBy: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T01:00:00.000Z',
    });
    expect(ws).not.toBeNull();
    expect(ws?.workspaceId).toBe('ws-1');
    expect(ws?.state).toBe('running');
    expect(ws?.substrate).toBe('in_process');
  });

  it('defaults missing optional fields and unknown substrate', () => {
    const ws = parseWorkspace({
      workspaceId: 'ws-2',
      state: 'ready',
      substrate: 'bogus',
    });
    expect(ws?.runtimeId).toBe('unknown');
    expect(ws?.substrate).toBe('tmux_worktree');
    expect(ws?.branch).toBe('');
  });

  it('returns null when workspaceId is missing', () => {
    expect(parseWorkspace({ state: 'ready' })).toBeNull();
  });

  it('returns null for an invalid state', () => {
    expect(parseWorkspace({ workspaceId: 'ws-3', state: 'not_a_state' })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(parseWorkspace(null)).toBeNull();
    expect(parseWorkspace('x')).toBeNull();
    expect(parseWorkspace([])).toBeNull();
  });
});

describe('parseRunEvent', () => {
  it('parses a known event type', () => {
    const e = parseRunEvent({
      eventId: 'e-1',
      type: 'state_transition',
      taskId: 'task-1',
      state: 'running',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(e?.type).toBe('state_transition');
    expect(e?.state).toBe('running');
  });

  it('falls back to log for an unknown event type', () => {
    const e = parseRunEvent({ eventId: 'e-2', type: 'weird' });
    expect(e?.type).toBe('log');
  });

  it('returns null without eventId or type', () => {
    expect(parseRunEvent({ type: 'log' })).toBeNull();
    expect(parseRunEvent({ eventId: 'e-3' })).toBeNull();
  });
});

describe('parseRun', () => {
  it('parses a complete run', () => {
    const r = parseRun({
      runId: 'run-1',
      taskId: 'task-1',
      spaceId: 'space-1',
      state: 'waiting_for_approval',
      assigneeAgentId: 'agent-1',
      startedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:05:00.000Z',
    });
    expect(r?.runId).toBe('run-1');
    expect(r?.state).toBe('waiting_for_approval');
    expect(r?.assigneeAgentId).toBe('agent-1');
  });

  it('defaults updatedAt to startedAt when absent', () => {
    const r = parseRun({
      runId: 'run-2',
      state: 'running',
      startedAt: '2026-01-02T00:00:00.000Z',
    });
    expect(r?.updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('returns null for an unknown run state', () => {
    expect(parseRun({ runId: 'run-3', state: 'paused' })).toBeNull();
  });

  it('returns null without runId', () => {
    expect(parseRun({ state: 'running' })).toBeNull();
  });

  it('returns null for a non-object', () => {
    expect(parseRun(null)).toBeNull();
    expect(parseRun('run')).toBeNull();
  });
});

describe('parseApproval', () => {
  it('parses a pending approval with a target', () => {
    const a = parseApproval({
      approvalId: 'ap-1',
      taskId: 'task-1',
      status: 'pending',
      reason: 'push to remote',
      requestedBy: 'agent-1',
      requestedAt: '2026-01-01T00:00:00.000Z',
      requiredAt: 'before_push',
      target: { command: 'git push' },
    });
    expect(a?.status).toBe('pending');
    expect(a?.requiredAt).toBe('before_push');
    expect(a?.target?.command).toBe('git push');
  });

  it('coerces an unknown requiredAt to custom', () => {
    const a = parseApproval({
      approvalId: 'ap-2',
      status: 'escalated',
      requiredAt: 'whenever',
    });
    expect(a?.requiredAt).toBe('custom');
  });

  it('drops an empty target', () => {
    const a = parseApproval({ approvalId: 'ap-3', status: 'approved', target: {} });
    expect(a?.target).toBeUndefined();
  });

  it('returns null for an invalid status', () => {
    expect(parseApproval({ approvalId: 'ap-4', status: 'maybe' })).toBeNull();
  });

  it('returns null without approvalId', () => {
    expect(parseApproval({ status: 'pending' })).toBeNull();
  });
});
