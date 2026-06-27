import type { RunEvent } from '@recoder/agent-os';

/**
 * Append-only in-memory journal of emitted events for a single run, enabling replay and
 * letting `persistence/` flush it. Preserves the ordered event list so consumers like
 * `collectRuntimeEvents` continue to work.
 */
export class RunJournal {
  private readonly events: RunEvent[] = [];

  append(event: RunEvent): void {
    this.events.push(event);
  }

  /** Immutable ordered snapshot. */
  entries(): readonly RunEvent[] {
    return [...this.events];
  }

  get length(): number {
    return this.events.length;
  }

  /** The last terminal event, if any. */
  terminal(): RunEvent | undefined {
    for (let i = this.events.length - 1; i >= 0; i -= 1) {
      const event = this.events[i];
      if (event && (event.type === 'completed' || event.type === 'failed')) {
        return event;
      }
    }
    return undefined;
  }
}
