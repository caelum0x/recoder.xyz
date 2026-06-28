import type { RunEvent } from '@recoder/agent-os';

/**
 * The agent-events outbox port. Distribution emits RunEvents (delivery
 * receipts, entitlement changes) back to Recoder — it never owns the canonical
 * task/artifact/approval state.
 */
export interface EventBusPort {
  emit(event: RunEvent): Promise<void>;
}
