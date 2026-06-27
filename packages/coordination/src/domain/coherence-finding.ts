/**
 * CoherenceFinding — the output of a single coherence check: a drift kind, the
 * evidence, a severity, and whether it is safe to auto-heal or must escalate to
 * a WorkSignal. Each `checks/*` file produces these; `heal-actions`/
 * `signal-builder` consume them.
 */

import type { WorkSignalSeverity } from './work-signal';

export type DriftKind =
  | 'lock_without_task'
  | 'lock_expired_live_run'
  | 'claim_without_run'
  | 'run_without_claim'
  | 'duplicate_claim'
  | 'stale_presence'
  | 'orphan_handoff'
  | 'squad_member_drift'
  | 'overlapping_active_locks'
  | 'dep_violation';

export const DRIFT_KINDS: readonly DriftKind[] = [
  'lock_without_task',
  'lock_expired_live_run',
  'claim_without_run',
  'run_without_claim',
  'duplicate_claim',
  'stale_presence',
  'orphan_handoff',
  'squad_member_drift',
  'overlapping_active_locks',
  'dep_violation',
] as const;

/** Disposition of a finding: auto-heal (provably safe) or escalate. */
export type FindingDisposition = 'heal' | 'escalate';

export type CoherenceFinding = {
  driftKind: DriftKind;
  disposition: FindingDisposition;
  severity: WorkSignalSeverity;
  /** Primary subject ids the drift concerns. */
  taskId?: string;
  spaceId?: string;
  lockId?: string;
  claimId?: string;
  handoffId?: string;
  squadId?: string;
  agentId?: string;
  /** Human-readable evidence for the drift. */
  evidence: string;
  detectedAt: string;
};
