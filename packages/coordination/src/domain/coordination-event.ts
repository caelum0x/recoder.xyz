/**
 * CoordinationEvent — a CloudEvent-shaped envelope for every coordination
 * transition published on the bus / outbox. MERGED from the event shape +
 * scoped subscription keys in `docker-backend/src/a2a/a2a-event-bus.ts`.
 */

export type CoordinationEventType =
  | 'lock.acquired'
  | 'lock.released'
  | 'lock.expired'
  | 'task.dispatched'
  | 'claim.taken'
  | 'claim.lost'
  | 'claim.released'
  | 'handoff.initiated'
  | 'handoff.completed'
  | 'handoff.failed'
  | 'coherence.finding'
  | 'signal.emitted';

export const COORDINATION_EVENT_TYPES: readonly CoordinationEventType[] = [
  'lock.acquired',
  'lock.released',
  'lock.expired',
  'task.dispatched',
  'claim.taken',
  'claim.lost',
  'claim.released',
  'handoff.initiated',
  'handoff.completed',
  'handoff.failed',
  'coherence.finding',
  'signal.emitted',
] as const;

/** Scope keys for subscription routing (global/space/task/squad). */
export type EventScope = {
  spaceId?: string;
  taskId?: string;
  squadId?: string;
};

export type CoordinationEvent<T = unknown> = {
  /** CloudEvents `id`. */
  eventId: string;
  /** CloudEvents `type`. */
  type: CoordinationEventType;
  /** CloudEvents `source` — the producing module. */
  source: string;
  /** CloudEvents `time`. */
  time: string;
  /** CloudEvents `specversion`. */
  specversion: '1.0';
  scope: EventScope;
  /** Idempotency/dedup key for effectively-once delivery. */
  dedupKey: string;
  /** Trace-context propagated across the chain. */
  traceId?: string;
  /** Redacted payload (secrets stripped before publish). */
  data: T;
};
