/**
 * Attention classifier — per-state fixtures proving each truthful signal path:
 * durable-state authority, RunEvent turn markers (with newer-turn invalidation),
 * dmux-derived tail heuristics, and the `'unknown'` no-signal invariant (the
 * classifier NEVER guesses when nothing signals).
 */
import { describe, it, expect } from 'vitest';
import type { RunEvent, RunEventType } from '@recoder/agent-os';
import { classifyAttention } from './attention-classifier.js';

let seq = 0;
function ev(type: RunEventType, overrides: Partial<RunEvent> = {}): RunEvent {
  seq += 1;
  return {
    eventId: `ev_${seq}`,
    type,
    taskId: 'task_1',
    runId: 'run_ws_1',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('classifyAttention — durable state authority', () => {
  it('awaiting_approval state → awaiting_approval', () => {
    const result = classifyAttention({ state: 'awaiting_approval' });
    expect(result.attention).toBe('awaiting_approval');
    expect(result.reason).toContain('awaiting_approval');
  });

  it('awaiting_review state → review_ready', () => {
    expect(classifyAttention({ state: 'awaiting_review' }).attention).toBe('review_ready');
  });

  it('failed state → error', () => {
    expect(classifyAttention({ state: 'failed' }).attention).toBe('error');
  });

  it('durable state wins over a contradicting tail (state of record is authoritative)', () => {
    const result = classifyAttention({
      state: 'awaiting_approval',
      tail: 'Analyzing files... esc to interrupt',
    });
    expect(result.attention).toBe('awaiting_approval');
  });
});

describe('classifyAttention — run-event signals (running workspace)', () => {
  it('failed event → error', () => {
    const result = classifyAttention({
      state: 'running',
      events: [ev('started'), ev('failed', { message: 'exit 1' })],
    });
    expect(result.attention).toBe('error');
    expect(result.reason).toContain('exit 1');
  });

  it('approval_requested event → awaiting_approval', () => {
    const result = classifyAttention({
      state: 'running',
      events: [ev('started'), ev('approval_requested')],
    });
    expect(result.attention).toBe('awaiting_approval');
  });

  it('needs_input event → agent_idle_prompt', () => {
    const result = classifyAttention({
      state: 'running',
      events: [ev('started'), ev('needs_input')],
    });
    expect(result.attention).toBe('agent_idle_prompt');
  });

  it('completed event → review_ready', () => {
    const result = classifyAttention({
      state: 'running',
      events: [ev('started'), ev('log'), ev('completed')],
    });
    expect(result.attention).toBe('review_ready');
  });

  it('a NEWER user_message invalidates an older completed (fresh turn running)', () => {
    const result = classifyAttention({
      state: 'running',
      events: [ev('started'), ev('completed'), ev('user_message')],
      tail: '✻ Thinking…',
    });
    // The old completed marker no longer describes the present; the tail decides.
    expect(result.attention).toBe('working');
  });

  it('log / state_transition events alone carry no signal → unknown', () => {
    const result = classifyAttention({
      state: 'running',
      events: [ev('log'), ev('state_transition')],
    });
    expect(result.attention).toBe('unknown');
  });
});

describe('classifyAttention — terminal-tail heuristics (running workspace)', () => {
  it('"esc to interrupt" → working', () => {
    const result = classifyAttention({
      state: 'running',
      tail: 'Compacting context\n✶ Germinating… (esc to interrupt)',
    });
    expect(result.attention).toBe('working');
  });

  it('spinner + progress word → working', () => {
    expect(classifyAttention({ state: 'running', tail: '⠹ Thinking...' }).attention).toBe('working');
  });

  it('approval question → awaiting_approval', () => {
    const result = classifyAttention({
      state: 'running',
      tail: 'Do you want to make this edit?\n❯ 1. Yes\n  2. No',
    });
    expect(result.attention).toBe('awaiting_approval');
  });

  it('permission prompt → awaiting_approval', () => {
    const result = classifyAttention({
      state: 'running',
      tail: 'Claude needs your permission to run: rm -rf dist',
    });
    expect(result.attention).toBe('awaiting_approval');
  });

  it('settled input prompt → agent_idle_prompt', () => {
    const result = classifyAttention({
      state: 'running',
      tail: 'All tests pass. Anything else?\n❯ ',
    });
    expect(result.attention).toBe('agent_idle_prompt');
  });

  it('tail without any recognizable signal → unknown (never guessed)', () => {
    const result = classifyAttention({
      state: 'running',
      tail: 'some ordinary program output\nline two',
    });
    expect(result.attention).toBe('unknown');
  });

  it('Omnara: "waiting for your input" → agent_idle_prompt', () => {
    expect(classifyAttention({ state: 'running', tail: 'Done.\nWaiting for your input to continue' }).attention).toBe(
      'agent_idle_prompt',
    );
  });

  it('Omnara: "Press Enter to continue" → agent_idle_prompt', () => {
    expect(classifyAttention({ state: 'running', tail: 'Summary written.\nPress Enter to continue' }).attention).toBe(
      'agent_idle_prompt',
    );
  });

  it('Omnara: a numbered selection menu (2+ options) → agent_idle_prompt', () => {
    const result = classifyAttention({
      state: 'running',
      tail: 'Which approach?\n❯ 1. Rebase\n2. Merge commit\n3. Squash',
    });
    expect(result.attention).toBe('agent_idle_prompt');
  });

  it('a single numbered line is NOT treated as a menu (no false needs-input)', () => {
    expect(classifyAttention({ state: 'running', tail: 'Step 1. build the thing and keep going' }).attention).toBe(
      'unknown',
    );
  });
});

describe('classifyAttention — the no-signal invariant', () => {
  it('running with no tail and no events → unknown with a truthful reason', () => {
    const result = classifyAttention({ state: 'running' });
    expect(result.attention).toBe('unknown');
    expect(result.reason).toContain('no terminal tail');
  });

  it('null tail (capture returned nothing) is a MISSING signal, not idle', () => {
    expect(classifyAttention({ state: 'running', tail: null }).attention).toBe('unknown');
  });

  it.each(['created', 'setting_up', 'ready', 'merging', 'merged', 'cancelled', 'archived'] as const)(
    'non-live state %s → unknown (no live-attention semantics)',
    (state) => {
      const result = classifyAttention({ state, tail: '⠹ Thinking...' });
      expect(result.attention).toBe('unknown');
      expect(result.reason).toContain(state);
    },
  );
});
