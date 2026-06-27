/**
 * squad-leader-policy — leader review / no-action gating.
 *
 * Ports multica's squad-leader no-action evaluation
 * (`go/multica/server/internal/service/squad_no_action.go`,
 * `HasSquadLeaderNoActionEvaluationForTask`) fused with the A2A squad team
 * model (`docker-backend/src/a2a/squad.service.ts`). The rule, ported (not
 * transpiled):
 *
 *  - A squad with a designated leader gates member engagement behind a leader
 *    review the FIRST time a task is considered for that squad.
 *  - If this exact (squad, task) already recorded a leader no-action
 *    evaluation, the leader has decided not to act → the dispatch is
 *    `no_action` (do not re-engage; do not re-open a review).
 *  - A squad without a leader needs no review; members may be engaged directly.
 *
 * Pure: squad + task + prior-evaluation flag → gating verdict. The prior-eval
 * lookup (multica's DB query) is done by the manager; this is the decision.
 */

import type { Squad } from '../domain';

export type LeaderGateVerdict =
  | { kind: 'no_review_required' }
  | { kind: 'requires_leader_review'; leaderId: string }
  | { kind: 'no_action'; leaderId: string; reason: string };

/**
 * Decide the leader gate for engaging a squad on a task.
 *
 * @param squad                  The resolved squad.
 * @param hasPriorNoActionEval   True when this exact (squad, task) already has a
 *                               recorded leader no-action evaluation (multica's
 *                               `HasSquadLeaderNoActionEvaluationForTask`).
 */
export function evaluateLeaderGate(
  squad: Squad,
  hasPriorNoActionEval: boolean,
): LeaderGateVerdict {
  const leaderId = squad.leaderId;
  if (!leaderId) {
    return { kind: 'no_review_required' };
  }
  if (hasPriorNoActionEval) {
    return {
      kind: 'no_action',
      leaderId,
      reason: `squad leader ${leaderId} previously recorded no_action for this task`,
    };
  }
  return { kind: 'requires_leader_review', leaderId };
}

/** True when the leader is also a member of the squad (sanity for review routing). */
export function leaderIsMember(squad: Squad): boolean {
  return squad.leaderId !== undefined && squad.members.some((m) => m.id === squad.leaderId);
}
