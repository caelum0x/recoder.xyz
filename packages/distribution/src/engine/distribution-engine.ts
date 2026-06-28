import type { DeliveryReceipt, DeliveryRequest } from '../domain/delivery';
import type { DistributionChannel } from '../domain/channel';
import type { ChannelHealth } from '../domain/health-state';
import { unhealthy } from '../domain/health-state';
import type { ChannelPublisher } from './channel-publisher';
import {
  runDeliveryPipeline,
  createInMemoryIdempotencyStore,
  type DeliveryPipelineDeps,
  type IdempotencyStore,
} from './delivery-pipeline';

/** A registry of channel publishers keyed by channel. */
export interface ChannelRegistry {
  register(publisher: ChannelPublisher): void;
  get(channel: DistributionChannel): ChannelPublisher | undefined;
  channels(): readonly DistributionChannel[];
}

export function createChannelRegistry(): ChannelRegistry {
  const map = new Map<DistributionChannel, ChannelPublisher>();
  return {
    register: (publisher) => void map.set(publisher.channel, publisher),
    get: (channel) => map.get(channel),
    channels: () => [...map.keys()],
  };
}

/**
 * The distribution engine. Owns the channel registry, the idempotency store,
 * and drives the gated delivery pipeline. `deliver` resolves to a truthful
 * receipt for every outcome (completed / denied / pending_approval / failed).
 */
export interface DistributionEngine {
  readonly channels: ChannelRegistry;
  deliver(req: DeliveryRequest): Promise<DeliveryReceipt>;
  health(): Promise<Record<string, ChannelHealth>>;
}

export interface DistributionEngineDeps extends DeliveryPipelineDeps {
  readonly registry?: ChannelRegistry;
  readonly idempotency?: IdempotencyStore;
}

export function createDistributionEngine(deps: DistributionEngineDeps): DistributionEngine {
  const registry = deps.registry ?? createChannelRegistry();
  const idempotency = deps.idempotency ?? createInMemoryIdempotencyStore();

  return {
    channels: registry,
    async deliver(req) {
      const publisher = registry.get(req.channel);
      if (!publisher) {
        // No registered channel → fail safe, do not pretend to publish.
        const { buildReceipt } = await import('./receipt-builder');
        return buildReceipt({
          request: req,
          status: 'failed',
          health: unhealthy(`no publisher registered for channel '${req.channel}'`),
          errorCode: 'provider_unavailable',
          evidence: { channel: req.channel },
          ...(deps.now ? { now: deps.now } : {}),
        });
      }
      return runDeliveryPipeline(deps, publisher, idempotency, req);
    },
    async health() {
      const out: Record<string, ChannelHealth> = {};
      for (const channel of registry.channels()) {
        const publisher = registry.get(channel)!;
        try {
          out[channel] = await publisher.health();
        } catch (e) {
          out[channel] = unhealthy(
            e instanceof Error ? e.message : 'health check threw',
            { channel },
          );
        }
      }
      return out;
    },
  };
}
