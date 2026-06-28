/**
 * The concrete `EventBusPort` for the distribution module.
 *
 * Distribution emits `RunEvent`s (entitlement changes from verified Polar
 * webhooks, delivery receipts) back to Recoder — it never owns canonical task /
 * approval / artifact state. This sink is real and auditable: every emitted
 * event is appended to a durable, bounded JSON log via the existing persistence
 * layer and mirrored to the structured logger, so an operator can audit what
 * the webhook pipeline applied.
 */
import type { EventBusPort, RunEvent } from '@recoder/distribution';
import { loadStore, debouncedSave } from '../persistence.js';
import { createLogger } from './log.js';

const logger = createLogger('distribution-events');

const STORE_NAME = 'distribution-events';
const MAX_RETAINED = 1000;

export interface DistributionEventLog {
  events: RunEvent[];
}

export interface DistributionEventBus extends EventBusPort {
  /** Read the most recent emitted events (newest last), for audit/inspection. */
  recent(limit?: number): readonly RunEvent[];
}

/**
 * Build a durable event bus. Events are persisted (debounced atomic write) and
 * bounded to `MAX_RETAINED` so the audit log cannot grow without limit.
 */
export function createDistributionEventBus(): DistributionEventBus {
  const state = loadStore<DistributionEventLog>(STORE_NAME, { events: [] });

  return {
    async emit(event: RunEvent): Promise<void> {
      state.events.push(event);
      if (state.events.length > MAX_RETAINED) {
        state.events.splice(0, state.events.length - MAX_RETAINED);
      }
      debouncedSave(STORE_NAME, state);
      logger.info('distribution RunEvent emitted', {
        type: event.type,
        taskId: event.taskId,
        eventId: event.eventId,
      });
    },
    recent(limit = 50) {
      const n = Math.max(0, Math.min(limit, state.events.length));
      return state.events.slice(state.events.length - n);
    },
  };
}
