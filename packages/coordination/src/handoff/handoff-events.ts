/**
 * handoff-events — map handoff transitions to `CoordinationEvent`s.
 *
 * MERGED from the `bus.publish({ type: HandoffInitiated | HandoffCompleted })`
 * calls in `docker-backend/src/a2a/autonomous-routing.service.ts`, re-shaped to
 * the CloudEvent-style `CoordinationEvent` envelope. Pure: builds the event
 * value (the caller turns it into a `PublishEventEffect`). Ids/time come in from
 * the id/clock ports so this stays deterministic.
 */

import type {
  CoordinationEvent,
  CoordinationEventType,
  EventScope,
  Handoff,
} from '../domain';

const SOURCE = 'coordination/handoff';

export type HandoffEventInput = {
  handoff: Handoff;
  eventId: string;
  time: string;
  dedupKey: string;
  traceId?: string;
};

/** Scope a handoff event by its space + source/target tasks. */
function scopeOf(handoff: Handoff): EventScope {
  const scope: EventScope = {};
  if (handoff.spaceId) scope.spaceId = handoff.spaceId;
  if (handoff.targetTaskId) scope.taskId = handoff.targetTaskId;
  else if (handoff.sourceTaskId) scope.taskId = handoff.sourceTaskId;
  return scope;
}

function build(
  type: CoordinationEventType,
  input: HandoffEventInput,
): CoordinationEvent<{ handoff: Handoff }> {
  const { handoff, eventId, time, dedupKey, traceId } = input;
  return {
    eventId,
    type,
    source: SOURCE,
    time,
    specversion: '1.0',
    scope: scopeOf(handoff),
    dedupKey,
    ...(traceId ? { traceId } : {}),
    data: { handoff },
  };
}

/** `handoff.initiated` — a handoff has been created and is in flight. */
export function handoffInitiatedEvent(
  input: HandoffEventInput,
): CoordinationEvent<{ handoff: Handoff }> {
  return build('handoff.initiated', input);
}

/** `handoff.completed` — the target accepted/finished the handoff. */
export function handoffCompletedEvent(
  input: HandoffEventInput,
): CoordinationEvent<{ handoff: Handoff }> {
  return build('handoff.completed', input);
}

/** `handoff.failed` — the handoff was rejected or errored. */
export function handoffFailedEvent(
  input: HandoffEventInput,
): CoordinationEvent<{ handoff: Handoff }> {
  return build('handoff.failed', input);
}
