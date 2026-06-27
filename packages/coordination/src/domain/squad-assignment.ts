/**
 * SquadAssignment — the resolution of a task to a squad and a specific member.
 * Fuses the A2A `resolveSquadDispatchProject` result with multica's squad
 * leader/no-action gating: a dispatch may be `pending_leader_review` when the
 * squad leader must approve before a member is engaged.
 */

export type SquadAssignmentStatus =
  | 'assigned'
  | 'pending_leader_review'
  | 'no_action'
  | 'rejected';

export const SQUAD_ASSIGNMENT_STATUSES: readonly SquadAssignmentStatus[] = [
  'assigned',
  'pending_leader_review',
  'no_action',
  'rejected',
] as const;

export type SquadAssignment = {
  squadId: string;
  taskId: string;
  spaceId: string;
  /** Resolved member id (the agent/human that will do the work). */
  memberId?: string;
  /** The squad leader at assignment time, if any. */
  leaderId?: string;
  status: SquadAssignmentStatus;
  reason: string;
  assignedAt: string;
};
