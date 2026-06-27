import type { RunEvent } from '@recoder/agent-os';
import type { RunEventSink } from './run-event-sink';

/** In-memory sink for tests and `collectRuntimeEvents`-style consumption. */
export class MemoryRunEventSink implements RunEventSink {
  private readonly events: RunEvent[] = [];

  async push(event: RunEvent): Promise<void> {
    this.events.push(event);
  }

  /** Immutable snapshot of everything emitted so far. */
  snapshot(): readonly RunEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events.length = 0;
  }
}

export function createMemoryRunEventSink(): MemoryRunEventSink {
  return new MemoryRunEventSink();
}
