/**
 * heal-actions — turns provably-safe (`disposition: 'heal'`) findings into
 * Effect[] that `engine/effect-runner.ts` later interprets against the ports.
 *
 * Per design §4: the pure core NEVER performs IO. This module returns effects,
 * it does not release a lock or mark an agent offline itself. Only two drift
 * kinds are auto-healable (the rest escalate):
 *  - `lock_without_task`  → ReleaseLock (the task is terminal/missing).
 *  - `stale_presence`     → MarkPresenceOffline (heartbeat dead; idempotent).
 *
 * Every heal also emits a RecordFinding effect so the auto-heal is auditable
 * ("safe drift was healed at T"), honoring "drift is never hidden" (§2.4).
 *
 * Pure: `(findings) => Effect[]`.
 */

import type { CoherenceFinding, Effect } from '../domain';

/** Drift kinds the engine is allowed to auto-heal. */
const HEALABLE: ReadonlySet<string> = new Set(['lock_without_task', 'stale_presence']);

/** True if a finding may be safely auto-healed. */
export function isHealable(finding: CoherenceFinding): boolean {
  return finding.disposition === 'heal' && HEALABLE.has(finding.driftKind);
}

/**
 * Build the heal effects for one finding. Returns [] when the finding is not a
 * recognized safe-heal (defensive: an `escalate` finding never produces a heal
 * effect even if mis-routed here).
 */
export function healEffectsFor(finding: CoherenceFinding): Effect[] {
  if (!isHealable(finding)) {
    return [];
  }

  switch (finding.driftKind) {
    case 'lock_without_task': {
      if (!finding.lockId) {
        return [];
      }
      return [
        { type: 'RecordFinding', finding },
        {
          type: 'ReleaseLock',
          lockId: finding.lockId,
          ownerAgentId: finding.agentId,
          taskId: finding.taskId,
        },
      ];
    }
    case 'stale_presence': {
      if (!finding.agentId) {
        return [];
      }
      return [
        { type: 'RecordFinding', finding },
        { type: 'MarkPresenceOffline', agentId: finding.agentId },
      ];
    }
    default:
      return [];
  }
}

/** Build heal effects for a batch of findings (only the healable ones). */
export function buildHealEffects(findings: readonly CoherenceFinding[]): Effect[] {
  return findings.filter(isHealable).flatMap(healEffectsFor);
}
