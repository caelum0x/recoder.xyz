/**
 * coherence-effects — the impure interpreter for the Effect subset the coherence
 * module produces (ReleaseLock, MarkPresenceOffline, EmitSignal, PublishEvent,
 * RecordFinding).
 *
 * NOTE: `engine/effect-runner.ts` is the canonical, package-wide effect
 * interpreter (design §4.6: "the only place effects run"). This module is the
 * coherence-local applier so the `Reconciler` shell is usable standalone and
 * unit-testable without the full engine; the engine can equally interpret these
 * same effects through its runner. The pure reconciler never calls this — it
 * only RETURNS effects.
 */

import type { Effect } from '../domain';
import type {
  ClockPort,
  EventBusPort,
  LockStorePort,
  PresenceStorePort,
  SignalSinkPort,
} from '../ports';

export type CoherenceEffectPorts = {
  lockStore: LockStorePort;
  presenceStore: PresenceStorePort;
  signalSink: SignalSinkPort;
  eventBus: EventBusPort;
  clock: ClockPort;
};

/** Apply one effect against the ports. Unknown effect types are ignored here. */
export async function applyCoherenceEffect(
  effect: Effect,
  ports: CoherenceEffectPorts,
): Promise<void> {
  switch (effect.type) {
    case 'ReleaseLock':
      await ports.lockStore.delete(effect.lockId, {
        ownerAgentId: effect.ownerAgentId,
        taskId: effect.taskId,
      });
      return;
    case 'MarkPresenceOffline':
      await ports.presenceStore.setStatus(effect.agentId, 'offline', ports.clock.iso());
      return;
    case 'EmitSignal':
      await ports.signalSink.emit(effect.signal);
      return;
    case 'PublishEvent':
      await ports.eventBus.publish(effect.event);
      return;
    case 'RecordFinding':
      // Audit-only in coherence; the durable record is the emitted signal/event.
      return;
    default:
      // Effects this module does not own (CommitClaim, DeliverHandoff, ...) are
      // interpreted by the engine's effect-runner, not here.
      return;
  }
}

/** A single effect that failed to apply, paired with the thrown error. */
export type CoherenceEffectFailure = {
  effect: Effect;
  error: unknown;
};

/** Outcome of applying a batch: how many effects ran vs. which ones failed. */
export type CoherenceEffectsOutcome = {
  /** Effects that applied without throwing. */
  applied: number;
  /** Effects that threw, with the offending effect and its error. */
  failures: CoherenceEffectFailure[];
};

/**
 * Apply a batch of effects best-effort.
 *
 * The coherence effects are INDEPENDENT heals (release lock A, mark agent B
 * offline, emit escalation signal C). Unlike the engine's transactional
 * `effect-runner` — which propagates so a transaction can roll back — this
 * standalone applier runs on the background reconcile tick where there is no
 * transaction to unwind. A transient port error on one heal must NOT abort the
 * remaining heals or crash the tick (fail-safe per design §2.4). We therefore
 * attempt every effect, isolate per-effect failures, and RETURN them so the
 * caller can surface a truthful outcome (log/metrics) instead of silently
 * losing the rest of the pass.
 */
export async function applyCoherenceEffects(
  effects: readonly Effect[],
  ports: CoherenceEffectPorts,
): Promise<CoherenceEffectsOutcome> {
  let applied = 0;
  const failures: CoherenceEffectFailure[] = [];
  for (const effect of effects) {
    try {
      await applyCoherenceEffect(effect, ports);
      applied += 1;
    } catch (error: unknown) {
      failures.push({ effect, error });
    }
  }
  return { applied, failures };
}
