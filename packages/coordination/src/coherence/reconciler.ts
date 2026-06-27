/**
 * Reconciler — the pure heart of the coherence module.
 *
 * `reconcile(snapshot, deps)` runs every check in `checks/` over a
 * `CoordinationSnapshot`, then partitions the findings:
 *  - `heal`     findings → safe Effect[] (release expired lock, mark offline)
 *               via `heal-actions`.
 *  - `escalate` findings → WorkSignal[] via `escalation`/`signal-builder`,
 *               emitted as `EmitSignal` + `PublishEvent(coherence.finding)`
 *               effects, UNLESS an equivalent signal is already open (dedup
 *               against `snapshot.openSignals` by the deterministic signal id).
 *
 * This mirrors design §5.3 exactly. It performs NO IO: it returns
 * `ReconcileResult { findings, effects, signals }` which `effect-runner.ts`
 * interprets against the ports. The `signalId` allocator is injected so tests
 * get deterministic ids and production uses `IdGeneratorPort.signalId()`.
 */

import type { CoherenceFinding, CoordinationEvent, Effect, WorkSignal } from '../domain';
import { runAllChecks } from './checks';
import { escalateFinding, expectedSignalId } from './escalation';
import { buildHealEffects, isHealable } from './heal-actions';
import type { CoordinationSnapshot } from './snapshot';

/** Dependencies the pure reconciler needs (all deterministic seams). */
export type ReconcileDeps = {
  /**
   * Allocate a fresh signal id. Production wires `IdGeneratorPort.signalId()`;
   * tests pass a counter. Only called when a NEW signal must be created (i.e.
   * no equivalent signal is already open).
   */
  newSignalId: () => string;
  /** Feature flag: when false, healable findings are escalated instead of healed. */
  autoHeal: boolean;
  /** Source label stamped on emitted CoordinationEvents. */
  source?: string;
};

export type ReconcileResult = {
  /** Every finding produced this tick (healed + escalated + suppressed). */
  findings: CoherenceFinding[];
  /** Effects to run: heal effects + EmitSignal/PublishEvent for escalations. */
  effects: Effect[];
  /** The WorkSignals that were (re)emitted this tick. */
  signals: WorkSignal[];
};

/** Pure reconcile: snapshot → findings + effects + signals. No IO. */
export function reconcile(
  snapshot: CoordinationSnapshot,
  deps: ReconcileDeps,
): ReconcileResult {
  const findings = runAllChecks(snapshot);
  const openSignalIds = new Set(snapshot.openSignals.map((signal) => signal.signalId));

  const effects: Effect[] = [];
  const signals: WorkSignal[] = [];

  for (const finding of findings) {
    const canHeal = deps.autoHeal && isHealable(finding);
    if (canHeal) {
      effects.push(...buildHealEffects([finding]));
      continue;
    }

    // Escalate: dedup against already-open signals by the deterministic id.
    const stableId = expectedSignalId(finding);
    if (openSignalIds.has(stableId)) {
      continue; // an equivalent signal is already open — do not re-emit
    }

    // Reuse the stable id so the same drift coalesces across ticks; only mint a
    // fresh id when the deterministic one is unavailable (defensive).
    const signalId = stableId || deps.newSignalId();
    const signal = escalateFinding(finding, signalId);
    signals.push(signal);
    openSignalIds.add(signalId);

    effects.push({ type: 'EmitSignal', signal });
    effects.push({ type: 'PublishEvent', event: buildFindingEvent(finding, deps) });
  }

  return { findings, effects, signals };
}

/** Build the `coherence.finding` CoordinationEvent for an escalated finding. */
function buildFindingEvent(finding: CoherenceFinding, deps: ReconcileDeps): CoordinationEvent {
  return {
    eventId: deps.newSignalId(),
    type: 'coherence.finding',
    source: deps.source ?? 'coherence.reconciler',
    time: finding.detectedAt,
    specversion: '1.0',
    scope: {
      spaceId: finding.spaceId,
      taskId: finding.taskId,
      squadId: finding.squadId,
    },
    dedupKey: expectedSignalId(finding),
    data: finding,
  };
}

/** Convenience: counts by disposition for diagnostics/metrics labels. */
export function summarizeFindings(findings: readonly CoherenceFinding[]): {
  total: number;
  healed: number;
  escalated: number;
} {
  let healed = 0;
  let escalated = 0;
  for (const finding of findings) {
    if (isHealable(finding)) {
      healed += 1;
    } else {
      escalated += 1;
    }
  }
  return { total: findings.length, healed, escalated };
}
