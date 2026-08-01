import { describe, it, expect, vi } from 'vitest';
import {
  NatsEventPublisher,
  createRecoderCloudEvent,
  type RecoderCloudEvent,
} from '@recoder/agent-events';
import { createNatsOutboxPublisher } from '../adapters/nats-outbox-publisher.adapter.js';

/**
 * The NATS outbox publisher is the CloudEvents transport seam. Two invariants:
 *   1. degrade-safe boot — a missing NATS url yields a log-only sink whose
 *      health() is truthfully `down` and whose publish() never throws (never a
 *      faked delivery), so the drain keeps records `pending`;
 *   2. envelope integrity — the publish path serializes the CloudEvent onto its
 *      `type` subject as loss-lessly round-trippable JSON.
 */

function capturingLogger(): { logger: never; warns: Array<Record<string, unknown>> } {
  const warns: Array<Record<string, unknown>> = [];
  const logger = {
    info: () => {},
    warn: (ctx: Record<string, unknown>) => {
      warns.push(ctx);
    },
    error: () => {},
    debug: () => {},
  } as never;
  return { logger, warns };
}

function cloudEvent(id: string): RecoderCloudEvent {
  return createRecoderCloudEvent({
    id,
    type: 'recoder.run.completed',
    source: 'recoder://agent-os/test',
    subject: `run/${id}`,
    data: { runId: id, ok: true },
    time: '2026-04-01T00:00:00.000Z',
  });
}

describe('createNatsOutboxPublisher — degrade-safe boot (log-only sink)', () => {
  it('with no NATS url: never throws, reports health `down`, and does not fake delivery', async () => {
    const { logger, warns } = capturingLogger();

    const publisher = await createNatsOutboxPublisher({ natsUrl: null, logger });

    expect(await publisher.health()).toBe('down');

    // publish must RESOLVE (never throw) so the drain's own accounting decides retry.
    await expect(publisher.publish(cloudEvent('e1'))).resolves.toBeUndefined();

    // The degrade is surfaced truthfully in the log — not a silent drop.
    expect(warns.length).toBe(1);
    expect(warns[0].reason).toBe('NATS url not configured');
    expect(warns[0].eventId).toBe('e1');
  });

  it('the factory itself never rejects for a null url (boot proceeds degrade-safe)', async () => {
    const { logger } = capturingLogger();
    await expect(createNatsOutboxPublisher({ natsUrl: null, logger })).resolves.toBeDefined();
  });
});

describe('CloudEvents envelope integrity — the publish serialization the adapter wires', () => {
  it('publishes onto the event `type` subject as loss-lessly round-trippable JSON', async () => {
    const captured: Array<{ subject: string; payload: Uint8Array }> = [];
    const publisher = new NatsEventPublisher({
      publish: (subject, payload) => {
        captured.push({ subject, payload });
      },
    });

    const event = cloudEvent('env-1');
    await publisher.publish(event);

    expect(captured).toHaveLength(1);
    expect(captured[0].subject).toBe('recoder.run.completed'); // subject === event.type

    const decoded = JSON.parse(new TextDecoder().decode(captured[0].payload)) as RecoderCloudEvent;
    expect(decoded).toEqual(event); // no field loss / mutation
    expect(decoded.specversion).toBe('1.0');
    expect(decoded.datacontenttype).toBe('application/json');
    expect(decoded.data).toEqual({ runId: 'env-1', ok: true });
  });

  it('propagates a transport reject so the drain leaves the record pending (never a silent drop)', async () => {
    const publisher = new NatsEventPublisher({
      publish: vi.fn(async () => {
        throw new Error('jetstream nack');
      }),
    });

    await expect(publisher.publish(cloudEvent('e2'))).rejects.toThrow('jetstream nack');
  });
});
