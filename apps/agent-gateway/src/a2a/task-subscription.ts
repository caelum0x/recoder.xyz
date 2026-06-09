import { EventEmitter } from 'node:events';
import type { TaskEnvelope } from '@recoder/a2a-sdk';

export type A2ATaskSubscriptionEvent =
  | { type: 'task.updated'; task: TaskEnvelope }
  | { type: 'artifact.created'; taskId: string; artifact: unknown }
  | { type: 'task.cancelled'; task: TaskEnvelope };

export class A2ATaskSubscriptionHub {
  private readonly emitter = new EventEmitter();

  publish(taskId: string, event: A2ATaskSubscriptionEvent): void {
    this.emitter.emit(taskId, event);
  }

  subscribe(taskId: string, listener: (event: A2ATaskSubscriptionEvent) => void): () => void {
    this.emitter.on(taskId, listener);
    return () => this.emitter.off(taskId, listener);
  }
}

export function encodeServerSentEvent(event: A2ATaskSubscriptionEvent): string {
  return [
    `event: ${event.type}`,
    `data: ${JSON.stringify(event)}`,
    '',
    '',
  ].join('\n');
}
