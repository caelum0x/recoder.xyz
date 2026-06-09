import type { OutboxRecord } from './outbox';

export interface PostgresOutboxWriter {
  insertOutbox(record: OutboxRecord): Promise<void>;
}

export class PostgresOutboxPublisher {
  constructor(private readonly writer: PostgresOutboxWriter) {}

  async publish(record: OutboxRecord): Promise<void> {
    await this.writer.insertOutbox(record);
  }
}
