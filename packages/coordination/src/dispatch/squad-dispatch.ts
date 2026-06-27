/**
 * squad-dispatch — resolve task → squad → member.
 *
 * Fuses the A2A `squad.service.ts` team model (members, roles, leader,
 * per-member `projectId`) with multica's squad leader/no-action gating
 * (`squad-leader-policy`). Produces a `SquadAssignment` whose status reflects
 * whether a member was engaged, a leader review is pending, the leader chose no
 * action, or no eligible member exists.
 *
 * Member resolution (ported from the A2A `resolveSquadDispatchProject` notion):
 *  - prefer a member explicitly scoped to the task's project (`projectId`),
 *  - else the first non-leader member,
 *  - else (leaderless squad) the first member.
 *
 * Pure: squad + task context + prior-eval flag → assignment. No IO.
 */

import type { Squad, SquadAssignment, SquadMember } from '../domain';
import { evaluateLeaderGate } from './squad-leader-policy';

export type SquadDispatchInput = {
  squad: Squad;
  taskId: string;
  spaceId: string;
  /** Project the task targets, for member project-scoping. */
  projectId?: string;
  /** Prefer agent members over humans for autonomous dispatch. */
  preferKind?: SquadMember['kind'];
  /** multica `HasSquadLeaderNoActionEvaluationForTask` result. */
  hasPriorNoActionEval: boolean;
  now: string;
};

/** Choose the member to engage, honoring project scope + leader exclusion. */
export function selectMember(
  squad: Squad,
  projectId?: string,
  preferKind?: SquadMember['kind'],
): SquadMember | undefined {
  const eligible = squad.members.filter((m) =>
    preferKind ? m.kind === preferKind : true,
  );
  const pool = eligible.length > 0 ? eligible : squad.members;

  const projectScoped = projectId
    ? pool.find((m) => m.projectId === projectId)
    : undefined;
  if (projectScoped) {
    return projectScoped;
  }

  const nonLeader = pool.find((m) => m.id !== squad.leaderId && m.role !== 'leader');
  return nonLeader ?? pool[0];
}

export function resolveSquadDispatch(input: SquadDispatchInput): SquadAssignment {
  const { squad, taskId, spaceId, projectId, preferKind, hasPriorNoActionEval, now } = input;
  const base = {
    squadId: squad.id,
    taskId,
    spaceId,
    leaderId: squad.leaderId,
    assignedAt: now,
  };

  const gate = evaluateLeaderGate(squad, hasPriorNoActionEval);

  if (gate.kind === 'no_action') {
    return { ...base, status: 'no_action', reason: gate.reason };
  }

  if (gate.kind === 'requires_leader_review') {
    return {
      ...base,
      status: 'pending_leader_review',
      reason: `squad leader ${gate.leaderId} must review before a member is engaged`,
    };
  }

  // no_review_required — resolve a member directly.
  const member = selectMember(squad, projectId, preferKind);
  if (!member) {
    return {
      ...base,
      status: 'rejected',
      reason: 'squad has no eligible member to engage',
    };
  }

  return {
    ...base,
    memberId: member.id,
    status: 'assigned',
    reason: `resolved member ${member.id} (${member.role})`,
  };
}
