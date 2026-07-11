import { describe, expect, it } from 'vitest';
import { waitingPrompt } from './workspace-waits';
import type { RunEvent } from '../types';

function ev(type: string, message: string, createdAt: string): RunEvent {
  return { eventId: `e_${createdAt}`, type, taskId: 't', runId: 'r', message, createdAt } as RunEvent;
}

describe('waitingPrompt', () => {
  it('returns the prompt when needs_input is the newest signal', () => {
    expect(
      waitingPrompt([
        ev('log', 'working', '2026-07-12T00:00:00.000Z'),
        ev('needs_input', 'Overwrite? (y/n)', '2026-07-12T00:00:03.000Z'),
      ]),
    ).toBe('Overwrite? (y/n)');
  });

  it('clears when newer log output followed the prompt (answered)', () => {
    expect(
      waitingPrompt([
        ev('needs_input', 'Continue? [y/N]', '2026-07-12T00:00:03.000Z'),
        ev('log', 'continuing', '2026-07-12T00:00:06.000Z'),
      ]),
    ).toBeNull();
  });

  it('returns null with no needs_input and on empty/undefined input', () => {
    expect(waitingPrompt([ev('log', 'x', '2026-07-12T00:00:00.000Z')])).toBeNull();
    expect(waitingPrompt([])).toBeNull();
    expect(waitingPrompt(undefined)).toBeNull();
  });
});
