import type { PolicyDecision } from '@recoder/agent-os';
import { decision, globMatch, type PolicyInput } from '@recoder/agent-policy';

/**
 * work-lock rule (NEW, governance-only).
 *
 * Denies file writes that fall OUTSIDE every work lock the actor currently
 * holds for the active task. This is stricter than the upstream agent-policy
 * `file-access` rule, which only escalates to `needs_approval` when a lock is
 * missing entirely. Here, once an agent holds *any* lock for the task, writing
 * outside the locked path glob is a hard deny — the lock defines the agent's
 * write envelope and stepping outside it is a coordination violation.
 *
 * Semantics (deny-biased):
 *   - Only applies to `file.write` actions with a concrete target path.
 *   - If the actor holds no locks for this task, defer (return null) so the
 *     upstream chain's `writeLockRequired` -> needs_approval logic still fires.
 *   - If the actor holds locks for this task but NONE cover the path -> DENY.
 *   - Expired locks do not count.
 */
export function evaluateWorkLock(input: PolicyInput): PolicyDecision | null {
  if (input.action !== 'file.write') return null;

  const path = input.target.path;
  if (!path) return null;
  if (!input.task) return null;

  const nowMs = Date.parse(input.now ?? new Date().toISOString());
  const locks = input.workLocks ?? [];

  const ownedActiveLocks = locks.filter(
    (lock) =>
      lock.taskId === input.task?.taskId &&
      lock.ownerAgentId === input.actor.agentId &&
      Date.parse(lock.expiresAt) > nowMs,
  );

  // No held locks for this task -> let upstream policy decide (needs_approval).
  if (ownedActiveLocks.length === 0) {
    return null;
  }

  const covered = ownedActiveLocks.some((lock) => globMatch(lock.pathGlob, path));
  if (covered) {
    return null; // inside the held envelope -> not our concern
  }

  return decision(
    input,
    'deny',
    `Write to '${path}' is outside the held work-lock envelope; acquire a lock covering this path first.`,
    [
      {
        path,
        heldLockGlobs: ownedActiveLocks.map((lock) => lock.pathGlob),
      },
    ],
  );
}
