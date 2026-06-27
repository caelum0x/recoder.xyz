/**
 * Squad — a named team of agents and humans, with a leader, per-member roles,
 * and an activity log.
 *
 * MERGED from `docker-backend/src/a2a/squad.service.ts`
 * (`Squad`/`SquadMember`/`SquadActivityEntry`/`MemberKind`). The TS service's
 * JSON persistence is split off into `persistence/*-squad-store.ts`; the *type*
 * lives here. The squad-leader / no-action gating concepts from multica
 * (`squad_no_action.go`) are modeled via `SquadRole` + dispatch policy.
 */

export type MemberKind = 'agent' | 'human';

export const MEMBER_KINDS: readonly MemberKind[] = ['agent', 'human'] as const;

/** Role is free-form in the source; `leader` is recognized for no-action gating. */
export type SquadRole = 'leader' | 'member' | 'reviewer' | string;

export type SquadMember = {
  id: string;
  kind: MemberKind;
  role: SquadRole;
  projectId?: string;
  addedAt: string;
};

export type SquadActivityEntry = {
  at: string;
  actor: string;
  action: string;
  detail?: string;
};

export type Squad = {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  leaderId?: string;
  projectId?: string;
  members: SquadMember[];
  activity: SquadActivityEntry[];
  createdAt: string;
  updatedAt: string;
};
