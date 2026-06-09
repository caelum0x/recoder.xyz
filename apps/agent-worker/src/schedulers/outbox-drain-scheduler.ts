import type { OutboxQueue } from '../queues/outbox-queue';
import type { EventPublisher } from '../activities/publish-outbox';
import { publishOutboxRecord } from '../activities/publish-outbox';

export async function drainOutbox(queue: OutboxQueue, publisher: EventPublisher, limit = 25): Promise<number> {
  const records = await queue.next(limit);
  for (const record of records) {
    try {
      await publishOutboxRecord(record, publisher);
      await queue.ack(record.outboxId);
    } catch (error) {
      await queue.fail(record.outboxId, error instanceof Error ? error.message : String(error));
    }
  }
  return records.length;
}
