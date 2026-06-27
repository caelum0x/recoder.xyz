/**
 * Lock reaper — pure sweep of expired locks → effects.
 *
 * NOT in the original `work-lock-service.ts`. Given a snapshot of locks at a
 * point in time, the reaper returns:
 *  - a `ReleaseLock` + `lock.expired` effect for every expired lock, and
 *  - an additional `EmitSignal` (`run_stale`) effect when the expired lock's
 *    owning task still has a live run — that is exactly the unsafe drift the
 *    coherence design calls out ("lock expired but run still writing"), surfaced
 *    truthfully instead of silently reaped.
 *
 * PURE: takes `now`, the lock set, the set of tasks with live runs, and
 * pre-issued ids (event ids + signal ids) injected by the caller. The caller
 * (lock-manager / reconciler) wires the ports; the reaper only decides.
 */

import type {
  CoordinationEvent,
  Effect,
  EmitSignalEffect,
  WorkLock,
  WorkSignal,
} from '../domain';
import { expiredLocks } from './lock-ttl';
import { lockExpiredEvent } from './lock-events';

export type ReapInput = {
  locks: readonly WorkLock[];
  now: string;
  /** Task ids that currently have a live run (drives the run_stale signal). */
  liveRunTaskIds: ReadonlySet<string>;
  /** Pre-issued event id per expired lock, keyed by lockId. */
  eventIdFor: (lockId: string) => string;
  /** Pre-issued signal id per stale lock, keyed by lockId. */
  signalIdFor: (lockId: string) => string;
  traceId?: string;
};

export type ReapResult = {
  /** The locks that were reaped (expired at `now`). */
  reaped: WorkLock[];
  /** Release + expired-event + run_stale-signal effects. */
  effects: Effect[];
};

/** Build the `run_stale` WorkSignal for an expired lock whose run is still live. */
function staleRunSignal(lock: WorkLock, signalId: string, now: string): WorkSignal {
  return {
    signalId,
    taskId: lock.taskId,
    spaceId: lock.spaceId,
    source: 'work_lock',
    sourceId: lock.lockId,
    title: `Work lock expired while its run is still active`,
    severity: 'high',
    status: 'open',
    detectedReason: 'run_stale',
    whyItMatters:
      'The write-lock guarding this task expired but the task still has a live run, so another agent could acquire an overlapping lock and collide with the in-flight writer.',
    recommendedNextAction:
      'Renew the lock for the live run or stop the run before another agent acquires the path.',
    agentHandoffPrompt: `Lock ${lock.lockId} on path "${lock.pathGlob}" (task ${lock.taskId}) expired while a run is active. Renew the lock or stop the run to avoid a collision.`,
    detectedAt: now,
    metadata: { lockId: lock.lockId, pathGlob: lock.pathGlob, ownerAgentId: lock.ownerAgentId },
  };
}

/**
 * Sweep expired locks. Safe drift (expired lock, no live run) becomes a clean
 * release; unsafe drift (expired lock, live run) becomes a release PLUS a
 * `run_stale` signal so the collision risk is never hidden.
 */
export function reapExpiredLocks(input: ReapInput): ReapResult {
  const reaped = expiredLocks(input.locks, input.now);
  const effects: Effect[] = [];

  for (const lock of reaped) {
    const event: CoordinationEvent<WorkLock> = lockExpiredEvent(lock, {
      eventId: input.eventIdFor(lock.lockId),
      time: input.now,
      traceId: input.traceId,
    });

    effects.push(
      { type: 'ReleaseLock', lockId: lock.lockId, ownerAgentId: lock.ownerAgentId, taskId: lock.taskId },
      { type: 'PublishEvent', event },
    );

    if (input.liveRunTaskIds.has(lock.taskId)) {
      const signalEffect: EmitSignalEffect = {
        type: 'EmitSignal',
        signal: staleRunSignal(lock, input.signalIdFor(lock.lockId), input.now),
      };
      effects.push(signalEffect);
    }
  }

  return { reaped, effects };
}
