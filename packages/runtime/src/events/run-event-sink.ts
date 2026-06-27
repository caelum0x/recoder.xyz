import type { RunEvent } from '@recoder/agent-os';

/**
 * The emission port: a destination that accepts canonical `RunEvent`s.
 * Implementations: memory-sink (tests), outbox-sink (agent-events), tee-sink (fan-out).
 */
export interface RunEventSink {
  push(event: RunEvent): Promise<void>;
  /** Optional flush hook for buffered sinks; engine calls it at terminal state. */
  flush?(): Promise<void>;
}
