import { describe, it, expect } from 'vitest';
import type { RunEvent, TaskRun, TaskRunState } from '@recoder/agent-os';
import { applyRunEventToRun, resolveTargetState } from '../services/run-transition.js';

function run(state: TaskRunState): TaskRun {
  return {
    runId: 'run-1',
    taskId: 'task-1',
    spaceId: 'space-1',
    state,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function event(partial: Partial<RunEvent> & Pick<RunEvent, 'type'>): RunEvent {
  return {
    eventId: 'evt-1',
    taskId: 'task-1',
    runId: 'run-1',
    createdAt: '2026-01-02T00:00:00.000Z',
    ...partial,
  };
}

describe('resolveTargetState', () => {
  it('prefers an explicit event.state over the type-implied state', () => {
    expect(resolveTargetState(event({ type: 'started', state: 'compiled' }))).toBe('compiled');
  });

  it('maps unambiguous event types to an implied state', () => {
    expect(resolveTargetState(event({ type: 'started' }))).toBe('running');
    expect(resolveTargetState(event({ type: 'approval_requested' }))).toBe('waiting_for_approval');
    expect(resolveTargetState(event({ type: 'failed' }))).toBe('failed');
    expect(resolveTargetState(event({ type: 'completed' }))).toBe('completed');
  });

  it('returns undefined for evidence-only event types', () => {
    expect(resolveTargetState(event({ type: 'log' }))).toBeUndefined();
    expect(resolveTargetState(event({ type: 'artifact' }))).toBeUndefined();
    expect(resolveTargetState(event({ type: 'user_message' }))).toBeUndefined();
  });
});

describe('applyRunEventToRun', () => {
  it('applies a legal explicit state_transition and returns a new immutable run', () => {
    const before = run('created');
    const out = applyRunEventToRun(before, event({ type: 'state_transition', state: 'compiled' }), '2026-02-01T00:00:00.000Z');
    expect(out.kind).toBe('applied');
    if (out.kind !== 'applied') throw new Error('unreachable');
    expect(out.from).toBe('created');
    expect(out.to).toBe('compiled');
    expect(out.run.state).toBe('compiled');
    expect(out.run.updatedAt).toBe('2026-02-01T00:00:00.000Z');
    // immutability: the input run is untouched
    expect(before.state).toBe('created');
  });

  it('reports illegal_transition for an unreachable target (created → running)', () => {
    const out = applyRunEventToRun(run('created'), event({ type: 'started' }));
    expect(out.kind).toBe('illegal_transition');
    if (out.kind !== 'illegal_transition') throw new Error('unreachable');
    expect(out.from).toBe('created');
    expect(out.to).toBe('running');
  });

  it('reports no_state_change for evidence-only events', () => {
    const out = applyRunEventToRun(run('running'), event({ type: 'log', message: 'hi' }));
    expect(out.kind).toBe('no_state_change');
  });

  it('reports no_state_change when the target equals the current state', () => {
    const out = applyRunEventToRun(run('running'), event({ type: 'state_transition', state: 'running' }));
    expect(out.kind).toBe('no_state_change');
  });

  it('carries event.data into the transition metadata', () => {
    const out = applyRunEventToRun(
      run('running'),
      event({ type: 'state_transition', state: 'waiting_for_approval', data: { reason: 'pr.create' } }),
    );
    expect(out.kind).toBe('applied');
    if (out.kind !== 'applied') throw new Error('unreachable');
    expect(out.run.metadata).toMatchObject({ reason: 'pr.create' });
  });
});
