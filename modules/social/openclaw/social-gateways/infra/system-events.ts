// Owned by Recoder. The raw gateway imported `../../infra/system-events.js` to
// surface out-of-band channel happenings (reactions, joins, boosts, pins, ...)
// to the agent loop as synthetic "system" messages. That infra sibling was not
// part of the extraction. The Discord adapter enqueues events via
// `enqueueSystemEvent(text, { sessionKey, contextKey })`; the gateway loop drains
// them. This is the real, dependency-free queue behavior: per-session FIFO with
// `contextKey` deduplication so a repeated event (e.g. the same reaction
// re-delivered) is enqueued at most once.

export interface SystemEvent {
  text: string;
  sessionKey?: string;
  contextKey?: string;
  enqueuedAt: number;
}

export interface EnqueueSystemEventOptions {
  /** Route this event into a specific agent session's inbound stream. */
  sessionKey?: string;
  /**
   * Idempotency key. A second event sharing an already-seen `contextKey` is
   * dropped, so at-least-once event delivery from the gateway does not produce
   * duplicate system messages.
   */
  contextKey?: string;
}

const QUEUE: SystemEvent[] = [];
const SEEN_CONTEXT_KEYS = new Set<string>();

/**
 * Enqueue a system event for later draining by the gateway loop. Returns `true`
 * when the event was accepted, `false` when it was suppressed as a duplicate of
 * an already-seen `contextKey`.
 */
export function enqueueSystemEvent(text: string, options: EnqueueSystemEventOptions = {}): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  const { sessionKey, contextKey } = options;
  if (contextKey) {
    if (SEEN_CONTEXT_KEYS.has(contextKey)) {
      return false;
    }
    SEEN_CONTEXT_KEYS.add(contextKey);
  }
  QUEUE.push({ text: trimmed, sessionKey, contextKey, enqueuedAt: Date.now() });
  return true;
}

/**
 * Remove and return all pending system events. When `sessionKey` is supplied,
 * only events bound to that session (and unrouted events) are drained.
 */
export function drainSystemEvents(sessionKey?: string): SystemEvent[] {
  if (sessionKey === undefined) {
    return QUEUE.splice(0, QUEUE.length);
  }
  const drained: SystemEvent[] = [];
  for (let index = QUEUE.length - 1; index >= 0; index -= 1) {
    const event = QUEUE[index];
    if (event.sessionKey === undefined || event.sessionKey === sessionKey) {
      drained.unshift(event);
      QUEUE.splice(index, 1);
    }
  }
  return drained;
}

/** Number of events currently waiting to be drained. */
export function pendingSystemEventCount(): number {
  return QUEUE.length;
}

/** Test-only reset of the queue + dedupe set. */
export function __resetSystemEventsForTest(): void {
  QUEUE.length = 0;
  SEEN_CONTEXT_KEYS.clear();
}
