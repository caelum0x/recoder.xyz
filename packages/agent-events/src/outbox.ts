import type { RecoderCloudEvent } from './cloudevent';

export type OutboxStatus = 'pending' | 'published' | 'failed' | 'discarded';

export type OutboxRecord<T = Record<string, unknown>> = {
  outboxId: string;
  event: RecoderCloudEvent<T>;
  status: OutboxStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
};

export function createOutboxRecord<T>(event: RecoderCloudEvent<T>, now = new Date().toISOString()): OutboxRecord<T> {
  return {
    outboxId: `outbox_${event.id}`,
    event,
    status: 'pending',
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function markOutboxPublished<T>(record: OutboxRecord<T>, now = new Date().toISOString()): OutboxRecord<T> {
  return { ...record, status: 'published', updatedAt: now };
}

export function markOutboxFailed<T>(record: OutboxRecord<T>, error: string, now = new Date().toISOString()): OutboxRecord<T> {
  return {
    ...record,
    status: 'failed',
    attempts: record.attempts + 1,
    lastError: error,
    updatedAt: now,
  };
}
