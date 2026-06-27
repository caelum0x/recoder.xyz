import type { RunEvent } from '@recoder/agent-os';
import { createOutboxRecord, mapRunEventToCloudEvent } from '@recoder/agent-events';
import type { RunEventSink } from './run-event-sink';

type OutboxRecordOf = ReturnType<typeof createOutboxRecord<RunEvent>>;

/**
 * A destination for transactional-outbox records. Hosts wire this to their persistence
 * (Postgres outbox table). The runtime only produces records; it never writes the DB.
 */
export interface OutboxWriter {
  append(record: OutboxRecordOf): Promise<void>;
}

/**
 * Adapts the RunEvent stream to `@recoder/agent-events`: each event becomes a CloudEvent
 * wrapped in a pending outbox record, handed to the host's `OutboxWriter`.
 */
export class OutboxRunEventSink implements RunEventSink {
  constructor(private readonly writer: OutboxWriter) {}

  async push(event: RunEvent): Promise<void> {
    const cloudEvent = mapRunEventToCloudEvent(event);
    const record = createOutboxRecord<RunEvent>(cloudEvent);
    await this.writer.append(record);
  }
}

export function createOutboxRunEventSink(writer: OutboxWriter): OutboxRunEventSink {
  return new OutboxRunEventSink(writer);
}
