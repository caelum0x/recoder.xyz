/**
 * InProcEventBus — an in-process `EventBusPort` (MERGED from the local-dispatch
 * path of `docker-backend/src/a2a/a2a-event-bus.ts`). Publishes
 * CoordinationEvents synchronously to in-process subscribers whose scope filter
 * matches the event's scope. The NATS adapter (wave-2) mirrors the same port
 * onto JetStream for cross-process fan-out.
 *
 * Scope matching follows the source's global/space/task/squad keys: a
 * subscriber with an empty filter receives everything; a filter field set
 * narrows to events carrying that same field value. A subscriber that throws (or
 * rejects) does not break delivery to the other subscribers — the error is
 * isolated per handler, mirroring the source's best-effort local dispatch.
 */

import type { CoordinationEvent, EventScope } from '../domain';
import type { EventBusPort, EventHandler, Unsubscribe } from '../ports';

type Subscription = {
  readonly scope: EventScope;
  readonly handler: EventHandler;
};

/** True when an event's scope satisfies a subscriber's scope filter. */
function scopeMatches(filter: EventScope, eventScope: EventScope): boolean {
  if (filter.spaceId !== undefined && filter.spaceId !== eventScope.spaceId) {
    return false;
  }
  if (filter.taskId !== undefined && filter.taskId !== eventScope.taskId) {
    return false;
  }
  if (filter.squadId !== undefined && filter.squadId !== eventScope.squadId) {
    return false;
  }
  return true;
}

export type InProcEventBusOptions = {
  /** Optional sink for handler errors (best-effort dispatch). Defaults to a no-op. */
  onHandlerError?: (error: unknown, event: CoordinationEvent) => void;
};

export class InProcEventBus implements EventBusPort {
  private readonly subscriptions = new Set<Subscription>();
  private readonly onHandlerError: (error: unknown, event: CoordinationEvent) => void;

  constructor(options: InProcEventBusOptions = {}) {
    this.onHandlerError = options.onHandlerError ?? (() => undefined);
  }

  async publish(event: CoordinationEvent): Promise<void> {
    // Snapshot subscribers so a handler that (un)subscribes during dispatch does
    // not mutate the set mid-iteration.
    const targets = [...this.subscriptions].filter((sub) => scopeMatches(sub.scope, event.scope));
    for (const sub of targets) {
      try {
        await sub.handler(event);
      } catch (error: unknown) {
        // Isolate per-handler failure; one bad subscriber must not drop delivery
        // to the others (best-effort local dispatch, per the source bus).
        this.onHandlerError(error, event);
      }
    }
  }

  subscribe(scope: EventScope, handler: EventHandler): Unsubscribe {
    const subscription: Subscription = { scope: { ...scope }, handler };
    this.subscriptions.add(subscription);
    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  /** Current subscriber count (diagnostics/tests). */
  get subscriberCount(): number {
    return this.subscriptions.size;
  }
}
