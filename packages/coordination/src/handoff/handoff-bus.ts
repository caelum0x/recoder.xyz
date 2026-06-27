/**
 * handoff-bus — publish/subscribe handoffs, typed + deduplicated.
 *
 * MERGED from the core of `docker-backend/src/a2a/a2a-event-bus.ts` but narrowed
 * to coordination handoffs: the generic transport mechanics (NATS mirror, ring
 * buffer retention, redaction, raw scoped EventEmitter keys) live in
 * `transport/`; here we keep the part that matters for handoffs — effectively-once
 * delivery (the `_localEventIds` dedup) and scoped publish — layered over the
 * `EventBusPort` and the in-memory `DedupLedger`.
 *
 * The bus is a thin impure shell: it owns no domain state, only the dedup ledger
 * for the keys it has emitted this process (the durable dedup lives in the
 * `HandoffStorePort`). Publishing a duplicate is a no-op (idempotent), mirroring
 * the source's "skip events we published ourselves".
 */

import { DedupLedger } from './dedup-ledger';
import { handoffInitiatedEvent } from './handoff-events';
import type { EventBusPort, EventHandler, Unsubscribe } from '../ports/event-bus';
import type { CoordinationEvent, EventScope, Handoff, HandoffEnvelope } from '../domain';

export type HandoffPublishInput = {
  envelope: HandoffEnvelope;
  eventId: string;
};

export type HandoffPublishResult =
  | { readonly published: true; readonly event: CoordinationEvent<{ handoff: Handoff }> }
  | { readonly published: false; readonly reason: 'duplicate' };

export class HandoffBus {
  private ledger: DedupLedger;

  constructor(
    private readonly bus: EventBusPort,
    ledger: DedupLedger = DedupLedger.empty(),
  ) {
    this.ledger = ledger;
  }

  /**
   * Publish a handoff envelope effectively-once. A second publish of the same
   * `dedupKey` is dropped without touching the underlying bus. On first sight the
   * dedup key is remembered and a `handoff.initiated` event is published scoped to
   * the handoff's space/task.
   */
  async publish(input: HandoffPublishInput): Promise<HandoffPublishResult> {
    const { envelope, eventId } = input;
    if (this.ledger.has(envelope.dedupKey)) {
      return { published: false, reason: 'duplicate' };
    }
    this.ledger = this.ledger.remember(envelope.dedupKey);

    const event = handoffInitiatedEvent({
      handoff: envelope.handoff,
      eventId,
      time: envelope.emittedAt,
      dedupKey: envelope.dedupKey,
      ...(envelope.traceId ? { traceId: envelope.traceId } : {}),
    });
    await this.bus.publish(event);
    return { published: true, event };
  }

  /** Subscribe to handoff events within a scope (delegates to the bus). */
  subscribe(scope: EventScope, handler: EventHandler): Unsubscribe {
    return this.bus.subscribe(scope, handler);
  }

  /** True if a handoff with this dedup key was already published this process. */
  seen(dedupKey: string): boolean {
    return this.ledger.has(dedupKey);
  }
}
