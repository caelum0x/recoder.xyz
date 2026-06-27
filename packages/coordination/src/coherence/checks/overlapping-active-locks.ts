/**
 * check: overlapping_active_locks — two ACTIVE exclusive locks in the same
 * space+repo cover overlapping paths.
 *
 * This is the most important invariant: the lock engine's `acquire` is supposed
 * to make this structurally impossible (see property test
 * `no-overlapping-active-locks.prop.ts`). If the reconciler ever SEES it, a
 * writer bypassed the engine and a collision is imminent.
 *
 * Disposition: ESCALATE at `critical` severity. We never auto-heal a critical
 * invariant breach — a human must investigate the bypassing writer. The loser
 * (younger lock, by `acquiredAt`) is named so it can be released after audit.
 *
 * Two `shared` locks never conflict (only an `exclusive` participant matters),
 * mirroring `locksAreCompatible` in the domain.
 *
 * Pure: `(CoordinationSnapshot) => CoherenceFinding[]`.
 */

import type { CoherenceFinding, WorkLock } from '../../domain';
import { globsOverlap } from '../../util/glob';
import { isActive } from '../../util/time';
import type { CoordinationSnapshot } from '../snapshot';

function sameScope(a: WorkLock, b: WorkLock): boolean {
  return a.spaceId === b.spaceId && (a.repo ?? '') === (b.repo ?? '');
}

export function checkOverlappingActiveLocks(snapshot: CoordinationSnapshot): CoherenceFinding[] {
  const active = snapshot.locks.filter((lock) => isActive(lock.expiresAt, snapshot.at));
  const findings: CoherenceFinding[] = [];

  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i];
      const b = active[j];
      // Two shared locks co-locate; conflict requires at least one exclusive.
      if (a.kind === 'shared' && b.kind === 'shared') {
        continue;
      }
      if (!sameScope(a, b)) {
        continue;
      }
      if (!globsOverlap(a.pathGlob, b.pathGlob)) {
        continue;
      }

      // Younger lock (later acquiredAt) is the suspected bypass / loser.
      const [winner, loser] =
        a.acquiredAt <= b.acquiredAt ? [a, b] : [b, a];

      findings.push({
        driftKind: 'overlapping_active_locks',
        disposition: 'escalate',
        severity: 'critical',
        taskId: loser.taskId,
        spaceId: loser.spaceId,
        lockId: loser.lockId,
        agentId: loser.ownerAgentId,
        evidence: `INVARIANT BREACH: active locks ${winner.lockId} (${winner.pathGlob}, agent ${winner.ownerAgentId}) and ${loser.lockId} (${loser.pathGlob}, agent ${loser.ownerAgentId}) overlap in space ${loser.spaceId}/${loser.repo ?? ''}. A writer bypassed the engine.`,
        detectedAt: snapshot.at,
      });
    }
  }

  return findings;
}
