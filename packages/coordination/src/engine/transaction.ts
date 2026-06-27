/**
 * transaction — groups a dispatch commit (claim + lock reservations + event
 * publish) into one all-or-nothing unit (design §4.6 / §5.1: "so you can never
 * end up claimed but unlocked").
 *
 * The in-memory adapters have no real DB transaction, so atomicity here is
 * achieved by COMPENSATION: if a later step fails after the claim CAS won, the
 * already-applied steps are undone (release the claim, delete the locks) before
 * the error propagates. The Postgres adapter (wave-2) replaces this with a real
 * `BEGIN/COMMIT/ROLLBACK` around the same effect set.
 *
 * It runs the dispatch effect subset (`CommitClaim`, `PersistLock`,
 * `PublishEvent`, `NotifyAgent`) through the `effect-runner`, recording inverse
 * actions as it goes. `PublishEvent`/`NotifyAgent` are not compensated (a
 * published event cannot be unpublished) — they are ordered LAST, after the
 * state-changing claim/lock steps have all succeeded, so a failure never leaves
 * a half-published commit.
 */

import type { Effect } from '../domain';
import type { ClaimStorePort, LockStorePort } from '../ports';
import { runEffect, type EffectRunnerPorts } from './effect-runner';

export type TransactionPorts = EffectRunnerPorts & {
  claimStore: ClaimStorePort;
  lockStore: LockStorePort;
};

type Compensation = () => Promise<void>;

/**
 * Commit a dispatch effect set atomically. State-changing effects
 * (`CommitClaim`, `PersistLock`) run first with recorded compensations;
 * publish/notify effects run last. On any failure the compensations run in
 * reverse and the error is rethrown.
 */
export async function commitTransaction(
  effects: readonly Effect[],
  ports: TransactionPorts,
): Promise<void> {
  const stateChanging = effects.filter(
    (effect) => effect.type === 'CommitClaim' || effect.type === 'PersistLock',
  );
  const sideEffects = effects.filter(
    (effect) => effect.type !== 'CommitClaim' && effect.type !== 'PersistLock',
  );

  const compensations: Compensation[] = [];

  try {
    for (const effect of stateChanging) {
      await runEffect(effect, ports);
      compensations.push(compensationFor(effect, ports));
    }
    // Publish/notify only after every state change succeeded.
    for (const effect of sideEffects) {
      await runEffect(effect, ports);
    }
  } catch (error: unknown) {
    await rollback(compensations);
    throw error;
  }
}

/** Build the inverse action for a state-changing effect. */
function compensationFor(effect: Effect, ports: TransactionPorts): Compensation {
  if (effect.type === 'CommitClaim') {
    const claimId = effect.claim.claimId;
    return () => ports.claimStore.release(claimId);
  }
  if (effect.type === 'PersistLock') {
    const lockId = effect.lock.lockId;
    return () => ports.lockStore.delete(lockId);
  }
  return async () => undefined;
}

/** Run compensations in reverse, swallowing compensation errors (best-effort undo). */
async function rollback(compensations: readonly Compensation[]): Promise<void> {
  for (let i = compensations.length - 1; i >= 0; i -= 1) {
    try {
      await compensations[i]();
    } catch {
      // A failed compensation must not mask the original error; the coherence
      // reconciler will detect any residual drift on the next tick.
    }
  }
}
