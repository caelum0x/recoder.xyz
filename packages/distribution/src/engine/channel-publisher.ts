import type { DeliveryRequest } from '../domain/delivery';
import type { ChannelHealth } from '../domain/health-state';

/** The result a channel publisher returns from a successful publish step. */
export interface PublishOutcome {
  readonly url: string;
  readonly sha256?: string;
  readonly evidence?: Readonly<Record<string, unknown>>;
}

/**
 * A channel's publish + health surface. The engine drives every channel through
 * this uniform interface; the channel does the actual external IO (npm, tap,
 * site, preview, …) inside `publish` and reports truthful `health`.
 */
export interface ChannelPublisher {
  readonly channel: DeliveryRequest['channel'];
  publish(req: DeliveryRequest): Promise<PublishOutcome>;
  /** Explicit post-publish health probe — no inferred success. */
  verify(req: DeliveryRequest, outcome: PublishOutcome): Promise<ChannelHealth>;
  health(): Promise<ChannelHealth>;
}
