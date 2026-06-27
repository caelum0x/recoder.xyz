import type { RunEvent } from '@recoder/agent-os';

/** `isTerminalRunEvent` from generic-adapter.ts:280. */
export function isTerminalRunEvent(event: RunEvent): boolean {
  return event.type === 'completed' || event.type === 'failed';
}

/**
 * Enforces the hard invariant: once a `completed`/`failed` is emitted, further events are
 * journaled but NOT re-emitted. The engine guarantees exactly one terminal event reaches
 * the consumer.
 */
export class TerminalEventGuard {
  private terminalEmitted = false;

  get sealed(): boolean {
    return this.terminalEmitted;
  }

  /**
   * Decide whether an event may be emitted to the consumer.
   * - Before terminal: pass everything through; mark sealed when a terminal passes.
   * - After terminal: suppress all (caller should still journal them).
   */
  admit(event: RunEvent): boolean {
    if (this.terminalEmitted) {
      return false;
    }
    if (isTerminalRunEvent(event)) {
      this.terminalEmitted = true;
    }
    return true;
  }
}
