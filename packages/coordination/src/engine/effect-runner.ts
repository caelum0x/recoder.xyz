/**
 * effect-runner — the ONLY place in the package that performs IO against ports
 * in response to an `Effect` (design §4.6: "the only place effects run").
 *
 * The pure core (locks/dispatch/handoff/coherence) NEVER touches a port; it
 * returns `Effect[]`. The runner interprets each variant against the injected
 * ports. This keeps every capability module deterministic and unit-testable
 * without a DB, NATS, or clock, and gives the engine one auditable IO seam.
 *
 * It is intentionally exhaustive over the `Effect` ADT (`assertNever` on the
 * default branch) so adding a new effect variant is a compile error until it is
 * handled here.
 */

import type { Effect } from '../domain';
import { assertNever } from '../util';
import type {
  ClaimStorePort,
  ClockPort,
  EventBusPort,
  HandoffStorePort,
  LockStorePort,
  PresenceStorePort,
  SignalSinkPort,
} from '../ports';

export type EffectRunnerPorts = {
  lockStore: LockStorePort;
  claimStore: ClaimStorePort;
  handoffStore: HandoffStorePort;
  presenceStore: PresenceStorePort;
  signalSink: SignalSinkPort;
  eventBus: EventBusPort;
  clock: ClockPort;
};

/**
 * Interpret a single effect against the ports. Returns nothing; the effect's
 * side effect is its result. Errors propagate to the caller (the transaction
 * decides commit/rollback semantics).
 */
export async function runEffect(effect: Effect, ports: EffectRunnerPorts): Promise<void> {
  switch (effect.type) {
    case 'PersistLock':
      await ports.lockStore.put(effect.lock);
      return;
    case 'ReleaseLock':
      await ports.lockStore.delete(effect.lockId, {
        ...(effect.ownerAgentId ? { ownerAgentId: effect.ownerAgentId } : {}),
        ...(effect.taskId ? { taskId: effect.taskId } : {}),
      });
      return;
    case 'CommitClaim':
      await ports.claimStore.compareAndSet(effect.claim);
      return;
    case 'ReleaseClaim':
      await ports.claimStore.release(effect.claimId);
      return;
    case 'PublishEvent':
      await ports.eventBus.publish(effect.event);
      return;
    case 'EmitSignal':
      await ports.signalSink.emit(effect.signal);
      return;
    case 'DeliverHandoff':
      await ports.handoffStore.put(effect.envelope.handoff);
      return;
    case 'NotifyAgent':
      // Runtime notification is a transport concern; the canonical record is the
      // committed claim. A `runtimes-seam` adapter (wave-2) consumes this to
      // notify the chosen runtime it holds a claim. Until then it is a no-op so
      // the effect stream stays complete and auditable.
      return;
    case 'RecordFinding':
      // Audit-only: the durable record of a finding is its emitted signal/event.
      return;
    case 'MarkPresenceOffline':
      await ports.presenceStore.setStatus(effect.agentId, 'offline', ports.clock.iso());
      return;
    default:
      return assertNever(effect);
  }
}

/** Interpret a batch of effects in order against the ports. */
export async function runEffects(
  effects: readonly Effect[],
  ports: EffectRunnerPorts,
): Promise<void> {
  for (const effect of effects) {
    await runEffect(effect, ports);
  }
}

/**
 * EffectRunner — a thin class facade over `runEffect`/`runEffects` so it can be
 * injected and swapped (e.g. a dry-run runner that records effects instead of
 * applying them).
 */
export class EffectRunner {
  constructor(private readonly ports: EffectRunnerPorts) {}

  run(effect: Effect): Promise<void> {
    return runEffect(effect, this.ports);
  }

  runAll(effects: readonly Effect[]): Promise<void> {
    return runEffects(effects, this.ports);
  }
}
