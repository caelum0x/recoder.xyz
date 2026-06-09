import type { OutboxRecord } from '@recoder/agent-events';

export interface OutboxQueue {
  next(limit: number): Promise<OutboxRecord[]>;
  ack(outboxId: string): Promise<void>;
  fail(outboxId: string, error: string): Promise<void>;
}
