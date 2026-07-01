/**
 * Reconciler — the impure shell (composition) exported as the module's public
 * entry (design §8 lists `Reconciler` from `coherence/reconciler`). It wires the
 * snapshot loader (impure read) → the pure `reconcile()` core → the coherence
 * effect applier (impure write), and implements `ReconcileTrigger` so a
 * scheduler can drive it.
 *
 * It owns no state. Each `tick()`:
 *   1. loads a fresh CoordinationSnapshot from the ports,
 *   2. runs the pure reconciler (checks → heal effects + escalation signals),
 *   3. applies the resulting effects against the ports,
 *   4. returns the `ReconcileResult` for observability.
 *
 * The pure `reconcile()` and the checks remain independently testable without
 * this shell; this only composes them.
 */

import type { CoordinationConfig } from '../config/coordination-config';
import type { IdGeneratorPort } from '../ports';
import {
  applyCoherenceEffects,
  type CoherenceEffectFailure,
  type CoherenceEffectPorts,
} from './coherence-effects';
import { reconcile, type ReconcileResult } from './reconciler';
import type { ReconcileTrigger } from './reconcile-scheduler';
import { loadSnapshot, type SnapshotLoaderDeps } from './snapshot-loader';

export type ReconcilerDeps = {
  loader: SnapshotLoaderDeps;
  effects: CoherenceEffectPorts;
  ids: IdGeneratorPort;
  config: CoordinationConfig;
  /** Spaces to reconcile each tick; undefined → adapter-decided scope. */
  spaceIds?: () => string[] | undefined;
  /**
   * Observe heals that failed to apply this tick. The coherence effects are
   * independent (release lock A, mark agent B offline, emit signal C), so a
   * transient port error on one must not abort the rest or crash the tick — all
   * effects are attempted, then the failures are reported here. When this hook
   * is provided the tick completes normally (returning its `ReconcileResult`)
   * and failures are surfaced through the hook; when it is absent, an aggregated
   * error is thrown AFTER every effect has been attempted so the failure is
   * never silently swallowed. Either way the scheduler stays fail-safe.
   */
  onEffectFailures?: (failures: readonly CoherenceEffectFailure[]) => void;
};

export class Reconciler implements ReconcileTrigger {
  constructor(private readonly deps: ReconcilerDeps) {}

  /** Run one reconcile pass: load → reconcile (pure) → apply effects. */
  async tick(): Promise<ReconcileResult> {
    const spaceIds = this.deps.spaceIds?.();
    const snapshot = await loadSnapshot(this.deps.loader, spaceIds);

    const result = reconcile(snapshot, {
      newSignalId: () => this.deps.ids.signalId(),
      autoHeal: this.deps.config.flags.autoHeal,
      source: 'coherence.reconciler',
    });

    const outcome = await applyCoherenceEffects(result.effects, this.deps.effects);
    if (outcome.failures.length > 0) {
      if (this.deps.onEffectFailures) {
        this.deps.onEffectFailures(outcome.failures);
      } else {
        throw new CoherenceEffectApplyError(outcome.failures, outcome.applied);
      }
    }
    return result;
  }
}

/**
 * Raised by `Reconciler.tick()` when one or more heals failed to apply and no
 * `onEffectFailures` hook was supplied. It is thrown ONLY after every effect has
 * been attempted, so it reports a partial-heal truthfully (how many applied,
 * which ones failed) rather than masking the aborted remainder of the pass.
 */
export class CoherenceEffectApplyError extends Error {
  constructor(
    readonly failures: readonly CoherenceEffectFailure[],
    readonly applied: number,
  ) {
    super(
      `Coherence reconcile applied ${applied} effect(s) but ${failures.length} failed to apply`,
    );
    this.name = 'CoherenceEffectApplyError';
  }
}
