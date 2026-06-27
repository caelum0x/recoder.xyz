/**
 * Lock transitions → CoordinationEvents + Effects.
 *
 * Pure builders. The lock module never publishes anything itself; it returns
 * `PublishEventEffect`/`PersistLockEffect`/`ReleaseLockEffect` that the engine's
 * effect-runner is the only place to interpret. CloudEvent fields (id, time,
 * dedupKey, scope) are passed in so the builders stay deterministic.
 */

import type {
  CoordinationEvent,
  CoordinationEventType,
  Effect,
  PersistLockEffect,
  PublishEventEffect,
  ReleaseLockEffect,
  WorkLock,
} from '../domain';
import { hashParts } from '../util/hash';

const SOURCE = 'coordination/locks';

/** Stable dedup key for a lock transition (id + type + fence token). */
export function lockEventDedupKey(lock: WorkLock, type: CoordinationEventType): string {
  return `lock:${hashParts([lock.lockId, type, String(lock.fenceToken)])}`;
}

export type LockEventInput = {
  eventId: string;
  time: string;
  traceId?: string;
};

function buildEvent(
  type: CoordinationEventType,
  lock: WorkLock,
  input: LockEventInput,
): CoordinationEvent<WorkLock> {
  return {
    eventId: input.eventId,
    type,
    source: SOURCE,
    time: input.time,
    specversion: '1.0',
    scope: { spaceId: lock.spaceId, taskId: lock.taskId },
    dedupKey: lockEventDedupKey(lock, type),
    traceId: input.traceId,
    data: lock,
  };
}

export function lockAcquiredEvent(lock: WorkLock, input: LockEventInput): CoordinationEvent<WorkLock> {
  return buildEvent('lock.acquired', lock, input);
}

export function lockReleasedEvent(lock: WorkLock, input: LockEventInput): CoordinationEvent<WorkLock> {
  return buildEvent('lock.released', lock, input);
}

export function lockExpiredEvent(lock: WorkLock, input: LockEventInput): CoordinationEvent<WorkLock> {
  return buildEvent('lock.expired', lock, input);
}

/** `PersistLock` + `lock.acquired` publish effects for a newly acquired lock. */
export function acquireEffects(lock: WorkLock, input: LockEventInput): Effect[] {
  const persist: PersistLockEffect = { type: 'PersistLock', lock };
  const publish: PublishEventEffect = { type: 'PublishEvent', event: lockAcquiredEvent(lock, input) };
  return [persist, publish];
}

/** `ReleaseLock` + `lock.released` publish effects for a released lock. */
export function releaseEffects(lock: WorkLock, input: LockEventInput): Effect[] {
  const release: ReleaseLockEffect = {
    type: 'ReleaseLock',
    lockId: lock.lockId,
    ownerAgentId: lock.ownerAgentId,
    taskId: lock.taskId,
  };
  const publish: PublishEventEffect = { type: 'PublishEvent', event: lockReleasedEvent(lock, input) };
  return [release, publish];
}
