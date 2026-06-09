import type { OutboxRecord } from '@recoder/agent-events';

export interface EventPublisher {
  publish(record: OutboxRecord): Promise<void>;
}

export async function publishOutboxRecord(record: OutboxRecord, publisher: EventPublisher): Promise<void> {
  await publisher.publish(record);
}
