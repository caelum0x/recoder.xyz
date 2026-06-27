/**
 * Shared test fixtures for the locks module — deterministic clock/id helpers and
 * WorkLock builders. No IO; mirrors the brain package's colocated-test style but
 * lives under the module's disjoint test dir.
 */

import type { WorkLock } from '../../../src/domain';

export const T0 = '2026-06-27T00:00:00.000Z';

/** ISO `ms` after the fixed epoch T0. */
export function at(ms: number): string {
  return new Date(Date.parse(T0) + ms).toISOString();
}

let lockSeq = 0;
export function nextLockId(): string {
  lockSeq += 1;
  return `lock_${lockSeq}`;
}

/** Build a WorkLock with sensible exclusive defaults; override any field. */
export function makeLock(overrides: Partial<WorkLock> = {}): WorkLock {
  return {
    lockId: overrides.lockId ?? nextLockId(),
    spaceId: overrides.spaceId ?? 'space-1',
    repo: overrides.repo,
    pathGlob: overrides.pathGlob ?? 'src/**',
    ownerAgentId: overrides.ownerAgentId ?? 'agent-a',
    taskId: overrides.taskId ?? 'task-1',
    acquiredAt: overrides.acquiredAt ?? T0,
    expiresAt: overrides.expiresAt ?? at(30 * 60_000),
    fenceToken: overrides.fenceToken ?? 1,
    kind: overrides.kind ?? 'exclusive',
  };
}
