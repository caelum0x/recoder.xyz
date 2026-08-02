import { describe, expect, it } from 'vitest';

import { TaskStateEnum, type TaskStateTransition } from './schemas';
import { validateTaskHistory } from './history-validation';

/** Build a well-formed transition entry. */
function transition(
  from: string,
  to: string,
  at: string,
  extra?: Partial<TaskStateTransition>,
): TaskStateTransition {
  return { from: from as never, to: to as never, transitioned_at: at, ...extra };
}

describe('validateTaskHistory', () => {
  it('accepts an empty history (freshly created envelope)', () => {
    expect(validateTaskHistory([])).toEqual({ ok: true });
  });

  it('accepts an absent (undefined) history', () => {
    expect(validateTaskHistory(undefined)).toEqual({ ok: true });
  });

  it('accepts a single legal transition entry', () => {
    const history = [
      transition(TaskStateEnum.Submitted, TaskStateEnum.Working, '2026-01-01T00:00:00.000Z'),
    ];
    expect(validateTaskHistory(history)).toEqual({ ok: true });
  });

  it('accepts a continuous, monotonic, fully legal chain', () => {
    const history = [
      transition(TaskStateEnum.Submitted, TaskStateEnum.Working, '2026-01-01T00:00:00.000Z', {
        reason: 'started',
        triggered_by: 'orchestrator',
      }),
      transition(TaskStateEnum.Working, TaskStateEnum.InputRequired, '2026-01-01T00:00:01.000Z'),
      transition(TaskStateEnum.InputRequired, TaskStateEnum.Working, '2026-01-01T00:00:02.000Z'),
      transition(TaskStateEnum.Working, TaskStateEnum.Completed, '2026-01-01T00:00:03.000Z'),
    ];
    expect(validateTaskHistory(history)).toEqual({ ok: true });
  });

  it('accepts equal adjacent timestamps (non-decreasing ordering)', () => {
    const history = [
      transition(TaskStateEnum.Submitted, TaskStateEnum.Working, '2026-01-01T00:00:00.000Z'),
      transition(TaskStateEnum.Working, TaskStateEnum.Completed, '2026-01-01T00:00:00.000Z'),
    ];
    expect(validateTaskHistory(history)).toEqual({ ok: true });
  });

  it('rejects a non-array history', () => {
    const result = validateTaskHistory('nope' as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/array/i);
  });

  it('rejects an entry that is not an object', () => {
    const result = validateTaskHistory([42 as never]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/object/i);
  });

  it('rejects a shape-broken entry with an invalid "from" state', () => {
    const history = [
      transition('bogus', TaskStateEnum.Working, '2026-01-01T00:00:00.000Z'),
    ];
    const result = validateTaskHistory(history);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/from/i);
  });

  it('rejects a shape-broken entry missing "to"', () => {
    const history = [{ from: TaskStateEnum.Submitted, transitioned_at: '2026-01-01T00:00:00.000Z' }];
    const result = validateTaskHistory(history as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/to/i);
  });

  it('rejects a non-ISO transitioned_at timestamp', () => {
    const history = [
      transition(TaskStateEnum.Submitted, TaskStateEnum.Working, 'not-a-date'),
    ];
    const result = validateTaskHistory(history);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/timestamp|transitioned_at/i);
  });

  it('rejects a non-string reason when present', () => {
    const history = [
      transition(TaskStateEnum.Submitted, TaskStateEnum.Working, '2026-01-01T00:00:00.000Z', {
        reason: 5 as never,
      }),
    ];
    const result = validateTaskHistory(history);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/reason/i);
  });

  it('rejects a discontinuous chain (gap between entries)', () => {
    // Both entries are individually legal, but the chain is broken:
    // entry[0] ends at "working", entry[1] starts at "input-required".
    const history = [
      transition(TaskStateEnum.Submitted, TaskStateEnum.Working, '2026-01-01T00:00:00.000Z'),
      transition(TaskStateEnum.InputRequired, TaskStateEnum.Working, '2026-01-01T00:00:01.000Z'),
    ];
    const result = validateTaskHistory(history);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/discontinu/i);
  });

  it('rejects an out-of-order (non-monotonic) history', () => {
    const history = [
      transition(TaskStateEnum.Submitted, TaskStateEnum.Working, '2026-01-01T00:00:02.000Z'),
      transition(TaskStateEnum.Working, TaskStateEnum.Completed, '2026-01-01T00:00:01.000Z'),
    ];
    const result = validateTaskHistory(history);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/order/i);
  });

  it('rejects an illegal transition (terminal state -> active)', () => {
    const history = [
      transition(TaskStateEnum.Completed, TaskStateEnum.Working, '2026-01-01T00:00:00.000Z'),
    ];
    const result = validateTaskHistory(history);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/illegal|transition/i);
  });

  it('rejects an illegal direct transition (submitted -> completed)', () => {
    const history = [
      transition(TaskStateEnum.Submitted, TaskStateEnum.Completed, '2026-01-01T00:00:00.000Z'),
    ];
    const result = validateTaskHistory(history);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/illegal|transition/i);
  });

  it('is exported from the SDK barrel', async () => {
    const mod = await import('./index');
    expect(typeof mod.validateTaskHistory).toBe('function');
  });
});
