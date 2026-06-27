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

    await applyCoherenceEffects(result.effects, this.deps.effects);
    return result;
  }
}
