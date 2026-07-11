/**
 * workspace-waits — derive "the agent is blocked on operator input" from a
 * workspace's RunEvent log. The backend run-tailer emits a `needs_input` event
 * when an agent's pane tail is a recognized interactive prompt, and `log`
 * events as output moves on. The wait is ACTIVE only while nothing newer than
 * the prompt has been printed — an answered prompt clears the moment new output
 * lands. Same rule the `recoder-herd` terminal view uses.
 */
import type { RunEvent } from '../types';

/** The prompt the agent is currently blocked on, or null when not waiting. */
export function waitingPrompt(events: readonly RunEvent[] | undefined | null): string | null {
  if (!events || events.length === 0) return null;
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
