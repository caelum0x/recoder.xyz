import type { RunEvent } from '../domain';

export type EventPublishResult = {
  eventId: string;
  publishedAt: string;
};

export interface EventBusPort {
  publish(event: RunEvent): Promise<EventPublishResult>;
  publishBatch(events: RunEvent[]): Promise<EventPublishResult[]>;
}
