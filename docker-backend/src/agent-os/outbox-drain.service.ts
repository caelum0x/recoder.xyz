import {
  markOutboxFailed,
  markOutboxPublished,
  type OutboxRecord,
  type RecoderCloudEvent,
} from '@recoder/agent-events';
import type { AgentOsRepository } from './repositories/agent-os.repository';

export type OutboxEventPublisher = {
  publish(event: RecoderCloudEvent): Promise<void> | void;
};

export type DrainAgentOsOutboxOptions = {
  limit?: number;
  now?: string;
};

export type DrainAgentOsOutboxResult = {
  operation: 'outbox.drain';
  attempted: number;
  published: number;
  failed: number;
  remainingPending: number;
  records: OutboxRecord[];
};

export async function drainAgentOsOutbox(
  repository: AgentOsRepository,
  publisher: OutboxEventPublisher,
  options: DrainAgentOsOutboxOptions = {},
): Promise<DrainAgentOsOutboxResult> {
  const limit = options.limit ?? 100;
  const now = options.now ?? new Date().toISOString();
  const pending = (await repository.listOutbox())
    .filter((record) => record.status === 'pending')
    .slice(0, limit);

  const records: OutboxRecord[] = [];
  let published = 0;
  let failed = 0;

  for (const record of pending) {
    try {
      await publisher.publish(record.event);
      const updated = await repository.upsertOutbox(markOutboxPublished(record, now));
      records.push(updated);
      published += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'outbox publish failed';
      const updated = await repository.upsertOutbox(markOutboxFailed(record, message, now));
      records.push(updated);
      failed += 1;
    }
  }

  const remainingPending = (await repository.listOutbox()).filter((record) => record.status === 'pending').length;

  return {
    operation: 'outbox.drain',
    attempted: pending.length,
    published,
    failed,
    remainingPending,
    records,
  };
}
