import type { RunEvent } from '@recoder/agent-os';
import type { RunStore } from './run-store';

/**
 * Ephemeral in-memory run store. ADAPTS pi-agent-core `memory-storage.ts`: a map of run id
 * to ordered events, for tests and runs that do not need durable journals.
 */
export class MemoryRunStore implements RunStore {
  readonly #byRun = new Map<string, RunEvent[]>();

  async append(runId: string, event: RunEvent): Promise<void> {
    this.#ensure(runId).push(event);
  }

  async appendBatch(runId: string, events: readonly RunEvent[]): Promise<void> {
    this.#ensure(runId).push(...events);
  }

  async read(runId: string): Promise<RunEvent[]> {
    return [...(this.#byRun.get(runId) ?? [])];
  }

  async list(): Promise<string[]> {
    return [...this.#byRun.keys()];
  }

  #ensure(runId: string): RunEvent[] {
    let events = this.#byRun.get(runId);
    if (!events) {
      events = [];
      this.#byRun.set(runId, events);
    }
    return events;
  }
}

export function createMemoryRunStore(): RunStore {
  return new MemoryRunStore();
}
