/**
 * Blocked-on-input derivation over a workspace's RunEvents: the run-tailer
 * emits `needs_input` when an agent's pane tail is a recognized interactive
 * prompt, and plain `log` events as output moves on. The wait is ACTIVE only
 * while nothing newer than the prompt has been printed — an answered prompt
 * clears the moment new output lands.
 */
import type { RunEvent } from '@recoder/agent-os';

export function waitingPrompt(events: readonly RunEvent[]): string | null {
  let lastInput: RunEvent | undefined;
  let lastLog: RunEvent | undefined;
  for (const e of events) {
    if (e.type === 'needs_input') lastInput = e;
    else if (e.type === 'log') lastLog = e;
  }
  if (!lastInput) return null;
  if (lastLog && lastLog.createdAt > lastInput.createdAt) return null;
  return lastInput.message || null;
}
