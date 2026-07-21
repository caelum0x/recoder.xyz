import { describe, expect, it } from 'vitest';
import { backendPhaseLine } from './backend-phase-line';
import type { BackendPhaseSnapshot } from '../types';

function snap(overrides: Partial<BackendPhaseSnapshot>): BackendPhaseSnapshot {
  return {
    phase: 'idle',
    ready: false,
    restartCount: 0,
    userMessage: null,
    logPath: null,
    ...overrides,
  };
}

describe('backendPhaseLine', () => {
  it('renders a calm starting line', () => {
    expect(backendPhaseLine(snap({ phase: 'starting' }))).toBe('Starting the backend…');
  });

  it('renders the restart count for a crash', () => {
    expect(backendPhaseLine(snap({ phase: 'crashed', restartCount: 2 }))).toBe(
      'Backend restarting (crashed 2 time(s))…',
    );
  });

  it('surfaces the failure message AND the log path as evidence', () => {
    expect(
      backendPhaseLine(
        snap({ phase: 'failed', userMessage: 'tmux binary missing', logPath: '/tmp/backend.log' }),
      ),
    ).toBe('Backend could not start — tmux binary missing. Log: /tmp/backend.log');
  });

  it('falls back to a generic reason and omits the log clause when both are absent', () => {
    expect(backendPhaseLine(snap({ phase: 'failed', userMessage: null, logPath: null }))).toBe(
      'Backend could not start — the backend could not start.',
    );
  });

  it('never renders the literal "null" for an empty userMessage', () => {
    const line = backendPhaseLine(snap({ phase: 'failed', userMessage: '   ', logPath: null }));
    expect(line).toBe('Backend could not start — the backend could not start.');
    expect(line).not.toContain('null');
  });

  it('returns null for idle/ready/stopped (generic banner path)', () => {
    expect(backendPhaseLine(snap({ phase: 'idle' }))).toBeNull();
    expect(backendPhaseLine(snap({ phase: 'ready', ready: true }))).toBeNull();
    expect(backendPhaseLine(snap({ phase: 'stopped' }))).toBeNull();
  });

  it('returns null for a null status', () => {
    expect(backendPhaseLine(null)).toBeNull();
  });
});
