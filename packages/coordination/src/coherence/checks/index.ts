/**
 * checks registry — every coherence invariant as a uniform, pure
 * `CoherenceCheck = (CoordinationSnapshot) => CoherenceFinding[]`.
 *
 * The reconciler walks `ALL_CHECKS` each tick and concatenates the findings, so
 * adding a new invariant is one file + one registry entry. Each check is its own
 * file and independently unit-tested (design §4.5: "each invariant is its own
 * file so it's independently testable and the set is extensible").
 */

import type { CoherenceFinding } from '../../domain';
import type { CoordinationSnapshot } from '../snapshot';

import { checkClaimWithoutRun } from './claim-without-run';
import { checkDepViolation } from './dep-violation';
import { checkDuplicateClaim } from './duplicate-claim';
import { checkLockExpiredLiveRun } from './lock-expired-live-run';
import { checkLockWithoutTask } from './lock-without-task';
import { checkOrphanHandoff } from './orphan-handoff';
import { checkOverlappingActiveLocks } from './overlapping-active-locks';
import { checkRunWithoutClaim } from './run-without-claim';
import { checkSquadMemberDrift } from './squad-member-drift';
import { checkStalePresence } from './stale-presence';

/** A single coherence invariant: a pure function over a snapshot. */
export type CoherenceCheck = (snapshot: CoordinationSnapshot) => CoherenceFinding[];

/** A named check, for selective execution + observability labels. */
export type NamedCheck = {
  name: string;
  run: CoherenceCheck;
};

/** The full, ordered set of coherence checks. */
export const ALL_CHECKS: readonly NamedCheck[] = [
  { name: 'lock_without_task', run: checkLockWithoutTask },
  { name: 'lock_expired_live_run', run: checkLockExpiredLiveRun },
  { name: 'claim_without_run', run: checkClaimWithoutRun },
  { name: 'run_without_claim', run: checkRunWithoutClaim },
  { name: 'duplicate_claim', run: checkDuplicateClaim },
  { name: 'stale_presence', run: checkStalePresence },
  { name: 'orphan_handoff', run: checkOrphanHandoff },
  { name: 'squad_member_drift', run: checkSquadMemberDrift },
  { name: 'overlapping_active_locks', run: checkOverlappingActiveLocks },
  { name: 'dep_violation', run: checkDepViolation },
] as const;

/** Run every check against a snapshot, flattening all findings. */
export function runAllChecks(snapshot: CoordinationSnapshot): CoherenceFinding[] {
  return ALL_CHECKS.flatMap((check) => check.run(snapshot));
}

export {
  checkClaimWithoutRun,
  checkDepViolation,
  checkDuplicateClaim,
  checkLockExpiredLiveRun,
  checkLockWithoutTask,
  checkOrphanHandoff,
  checkOverlappingActiveLocks,
  checkRunWithoutClaim,
  checkSquadMemberDrift,
  checkStalePresence,
};
