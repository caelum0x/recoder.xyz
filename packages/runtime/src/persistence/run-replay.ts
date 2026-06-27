import type { RunEvent } from '@recoder/agent-os';
import type { RunStore } from './run-store';

/**
 * Re-stream a stored run journal as an `AsyncIterable<RunEvent>` for crash recovery,
 * handoff, or autowake. The replay is read-only: it never re-runs the driver, only replays
 * what was durably recorded.
 */
export async function* replayRun(
  store: RunStore,
  runId: string,
): AsyncIterable<RunEvent> {
  const events = await store.read(runId);
  for (const event of events) {
    yield event;
  }
}

/** Replay a journal directly from an in-memory event list (no store round-trip). */
export async function* replayEvents(
  events: readonly RunEvent[],
): AsyncIterable<RunEvent> {
  for (const event of events) {
    yield event;
  }
}

/**
 * Find the terminal event in a replayed journal, if the run reached one. Useful for
 * deciding whether a recovered run needs to be resumed or is already complete.
 */
export function terminalOf(events: readonly RunEvent[]): RunEvent | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event && (event.type === 'completed' || event.type === 'failed')) {
      return event;
    }
  }
  return undefined;
}
