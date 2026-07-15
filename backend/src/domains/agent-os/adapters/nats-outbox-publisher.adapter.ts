/**
 * `nats-outbox-publisher.adapter` — the concrete {@link OutboxPublisherPort}
 * behind the at-least-once CloudEvents spine (domain doc §1.3, §8). Ported from
 * the legacy `src/agent-os/nats-outbox-publisher.ts`, refit to the port:
 *  - When a NATS url is configured it connects a JetStream publisher; `publish`
 *    resolves on a durable ack and REJECTS on a delivery fault (the drain leaves
 *    the record `pending` for retry — never a silent drop).
 *  - When NATS is absent (or the connection fails) it degrades to a LOG-ONLY
 *    sink whose `health()` is truthfully `down`; the drain then keeps records
 *    `pending` via its own accounting rather than faking delivery.
 *
 * No `process.env` reads — the url/subject-prefix arrive via the config slice.
 */
import { NatsEventPublisher, type RecoderCloudEvent } from '@recoder/agent-events';
import type { Logger } from '../../../shared/logger.js';
import type { HealthStatus } from '../../../shared/health-types.js';
import type { OutboxPublisherPort } from '../ports/outbox-publisher.port.js';

const RECODER_EVENTS_STREAM = 'RECODER_AGENT_EVENTS';
const RECODER_EVENTS_SUBJECTS = ['recoder.>'];

export interface NatsOutboxPublisherConfig {
  readonly natsUrl: string | null;
  readonly logger: Logger;
}

/**
 * The log-only degrade sink. Records the event and reports `down` so health
 * never fakes an `up` transport. Never rejects — the drain's own accounting
 * decides retry, not a thrown error.
 */
class LogOnlyOutboxPublisher implements OutboxPublisherPort {
  constructor(
    private readonly logger: Logger,
    private readonly reason: string,
  ) {}

  async publish(event: RecoderCloudEvent): Promise<void> {
    this.logger.warn(
      { eventId: event.id, type: event.type, reason: this.reason },
      'outbox publisher degraded to log-only sink — CloudEvent not delivered to NATS',
    );
  }

  health(): HealthStatus {
    return 'down';
  }
}

/** JetStream-backed publisher. `publish` rejects on a delivery fault. */
class NatsOutboxPublisher implements OutboxPublisherPort {
  private closed = false;

  constructor(
    private readonly publisher: NatsEventPublisher,
    private readonly closeFn: () => Promise<void>,
  ) {}

  async publish(event: RecoderCloudEvent): Promise<void> {
    if (this.closed) throw new Error('nats outbox publisher is closed');
    await this.publisher.publish(event);
  }

  health(): HealthStatus {
    return this.closed ? 'down' : 'up';
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.closeFn();
  }
}

/**
 * Build the outbox publisher for the given config. NEVER throws: a missing url
 * or a failed connection yields the truthful log-only sink so boot proceeds
 * degrade-safe. Returns the port plus an optional `close` for lifecycle.
 */
export async function createNatsOutboxPublisher(
  cfg: NatsOutboxPublisherConfig,
): Promise<OutboxPublisherPort & { close?(): Promise<void> }> {
  const { natsUrl, logger } = cfg;
  if (!natsUrl) {
    return new LogOnlyOutboxPublisher(logger, 'NATS url not configured');
  }

  try {
    // Dynamic import keeps `nats` an optional runtime dependency.
    const natsLib = (await (Function('return import("nats")')() as Promise<unknown>)) as {
      connect(opts: { servers: string }): Promise<NatsConnectionLike>;
    };
    const nc = await natsLib.connect({ servers: natsUrl });
    const js = nc.jetstream();
    const jsm = await nc.jetstreamManager();

    try {
      await jsm.streams.info(RECODER_EVENTS_STREAM);
    } catch {
      await jsm.streams.add({
        name: RECODER_EVENTS_STREAM,
        subjects: RECODER_EVENTS_SUBJECTS,
        max_age: 7 * 24 * 60 * 60 * 1_000_000_000,
        storage: 'file',
        retention: 'limits',
        discard: 'old',
      });
    }

    const publisher = new NatsEventPublisher({
      publish: async (subject: string, payload: Uint8Array) => {
        await js.publish(subject, payload);
      },
    });
    logger.info({ natsUrl }, 'agent-os outbox publisher connected to NATS JetStream');
    return new NatsOutboxPublisher(publisher, () => nc.close());
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'nats connect failed';
    logger.warn({ reason }, 'agent-os outbox publisher fell back to log-only sink');
    return new LogOnlyOutboxPublisher(logger, reason);
  }
}

/** Minimal structural view of the `nats` JetStream surface this adapter uses. */
interface NatsConnectionLike {
  jetstream(): { publish(subject: string, payload: Uint8Array): Promise<unknown> };
  jetstreamManager(): Promise<{
    streams: {
      info(name: string): Promise<unknown>;
      add(config: Record<string, unknown>): Promise<unknown>;
    };
  }>;
  close(): Promise<void>;
}
