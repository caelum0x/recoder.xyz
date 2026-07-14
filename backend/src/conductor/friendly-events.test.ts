/**
 * Friendly user-facing RunEvent messages — the run-tailer maps terminal tmux/
 * process internals to plain language for the local chat product, preserving the
 * technical detail on `data` for the audit trail.
 */
import { describe, expect, it } from 'vitest';
import type { RunEvent } from '@recoder/agent-os';
import { withFriendlyMessage } from './run-tailer.js';

function evt(partial: Partial<RunEvent>): RunEvent {
  return {
    eventId: 'event_1',
    type: 'log',
    taskId: 'task_1',
    runId: 'run_1',
    message: '',
    createdAt: new Date().toISOString(),
    ...partial,
  } as RunEvent;
}

describe('withFriendlyMessage', () => {
  it('maps exit-0 completion to "Agent finished"', () => {
    const out = withFriendlyMessage(evt({ type: 'completed', message: 'Agent session ended', data: { exitCode: 0 } }));
    expect(out.message).toBe('Agent finished');
    // technical detail preserved for audit
    expect(out.data?.technicalMessage).toBe('Agent session ended');
    expect(out.data?.exitCode).toBe(0);
  });

  it('maps non-zero exit to "Agent stopped (error, ...)"', () => {
    const out = withFriendlyMessage(evt({ type: 'failed', message: 'Agent session exited with code 1', data: { exitCode: 1 } }));
    expect(out.message).toBe('Agent stopped (error, exit 1)');
    expect(out.data?.technicalMessage).toBe('Agent session exited with code 1');
  });

  it('maps a generic failure (no exit code) to "Agent stopped (error)"', () => {
    const out = withFriendlyMessage(evt({ type: 'failed', message: 'something broke' }));
    expect(out.message).toBe('Agent stopped (error)');
  });

  it('maps a max-duration safety stop to a distinct friendly line', () => {
    const out = withFriendlyMessage(evt({ type: 'failed', message: 'Run tail stopped after max duration (1800000ms)', data: { reason: 'max_duration' } }));
    expect(out.message).toBe('Agent stopped (took too long)');
  });

  it('passes non-terminal events through unchanged (no scary mapping)', () => {
    const started = evt({ type: 'started', message: 'Run started on session recoder-x' });
    expect(withFriendlyMessage(started)).toBe(started);
    const logEvt = evt({ type: 'log', message: '[agent] working...' });
    expect(withFriendlyMessage(logEvt)).toBe(logEvt);
  });

  it('does not mutate the input event (immutable)', () => {
    const input = evt({ type: 'completed', message: 'Agent session ended', data: { exitCode: 0 } });
    const out = withFriendlyMessage(input);
    expect(input.message).toBe('Agent session ended');
    expect(out).not.toBe(input);
  });
});
