import type { RecoderCloudEvent } from './cloudevent';

export interface NatsLikePublisher {
  publish(subject: string, payload: Uint8Array): Promise<void> | void;
}

export class NatsEventPublisher {
  constructor(private readonly publisher: NatsLikePublisher) {}

  async publish(event: RecoderCloudEvent): Promise<void> {
    await this.publisher.publish(event.type, new TextEncoder().encode(JSON.stringify(event)));
  }
}
