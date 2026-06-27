import type { RunEvent } from '@recoder/agent-os';

/**
 * Replayable run-journal storage. A `RunStore` appends the `RunEvent`s of a run in order so
 * they can be re-streamed for crash recovery, handoff, or autowake.
 *
 * Implementations: `memory-run-store.ts` (ephemeral, tests) and `jsonl-run-store.ts`
 * (append-only JSONL on disk, adapted from pi-agent-core session storage).
 */
export interface RunStore {
  /** Append a single event to a run's journal, preserving order. */
  append(runId: string, event: RunEvent): Promise<void>;

  /** Append a batch (flush) of events to a run's journal. */
  appendBatch(runId: string, events: readonly RunEvent[]): Promise<void>;

  /** Read the full ordered journal for a run. */
  read(runId: string): Promise<RunEvent[]>;

  /** List known run ids. */
  list(): Promise<string[]>;
}
