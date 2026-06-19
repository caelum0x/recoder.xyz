/**
 * @module squad.service
 *
 * Squads — named teams of agents and humans, with a leader, per-member roles,
 * and an activity log. The "turn agents into real teammates" layer (inspired by
 * multica): work can be assigned to a team, not just a single agent, and humans
 * can lead or participate. Complements the existing agent-registry (individual
 * identities), delegation-chain (handoffs), and capability-matcher (routing).
 *
 * Durable via the JSON persistence store; immutable updates.
 */

import { loadStore, debouncedSave } from '../persistence';
import { createLogger } from '../logger';
import { emitCollabEvent, type CollabEventType } from './collab-events.service.js';

const logger = createLogger('squad.service');

const STORE_NAME = 'agent-squads';
const MAX_ACTIVITY = 200;

export type MemberKind = 'agent' | 'human';

export interface SquadMember {
  id: string;
  kind: MemberKind;
  role: string;
  projectId?: string;
  addedAt: string;
}

export interface SquadActivityEntry {
  at: string;
  actor: string;
  action: string;
  detail?: string;
}

export interface Squad {
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
}

type SquadStore = Record<string, Squad>;

let store: SquadStore | null = null;

function getStore(): SquadStore {
  if (store === null) store = loadStore<SquadStore>(STORE_NAME, {});
  return store;
}

function save(next: SquadStore): void {
  store = next;
  debouncedSave(STORE_NAME, next);
}

function genId(): string {
  return `squad_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const ACTION_EVENT_TYPE: Record<string, CollabEventType> = {
  member_added: 'squad.member_added',
  member_removed: 'squad.member_removed',
  role_changed: 'squad.role_changed',
  updated: 'squad.updated',
  task_dispatched: 'task.dispatched',
};

function appendActivity(squad: Squad, entry: Omit<SquadActivityEntry, 'at'>): SquadActivityEntry[] {
  const type: CollabEventType = entry.action.startsWith('assignment_')
    ? 'task.assignment'
    : ACTION_EVENT_TYPE[entry.action] ?? 'squad.activity';
  emitCollabEvent({ type, squadId: squad.id, squadName: squad.name, actor: entry.actor, action: entry.action, detail: entry.detail });
  const next = [...squad.activity, { at: new Date().toISOString(), ...entry }];
  return next.length > MAX_ACTIVITY ? next.slice(next.length - MAX_ACTIVITY) : next;
}

function normalizeMember(input: Partial<SquadMember> & { id: string }): SquadMember {
  const projectId = input.projectId?.trim();
  return {
    id: input.id,
    kind: input.kind === 'human' ? 'human' : 'agent',
    role: (input.role ?? 'member').trim() || 'member',
    projectId: projectId || undefined,
    addedAt: new Date().toISOString(),
  };
}

export interface CreateSquadParams {
  name: string;
  ownerId: string;
  description?: string;
  leaderId?: string;
  projectId?: string;
  members?: Array<Partial<SquadMember> & { id: string }>;
}

export function createSquad(params: CreateSquadParams): Squad {
  const now = new Date().toISOString();
  const members = (params.members ?? [])
    .filter((m) => m && typeof m.id === 'string' && m.id.trim())
    .map(normalizeMember);
  // dedupe by id
  const seen = new Set<string>();
  const deduped = members.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));

  const squad: Squad = {
    id: genId(),
    name: params.name.trim(),
    description: params.description?.trim() || undefined,
    ownerId: params.ownerId,
    leaderId: params.leaderId && deduped.some((m) => m.id === params.leaderId) ? params.leaderId : undefined,
    projectId: params.projectId?.trim() || undefined,
    members: deduped,
    activity: [{ at: now, actor: params.ownerId, action: 'created', detail: params.name.trim() }],
    createdAt: now,
    updatedAt: now,
  };
  save({ ...getStore(), [squad.id]: squad });
  emitCollabEvent({ type: 'squad.created', squadId: squad.id, squadName: squad.name, actor: params.ownerId, action: 'created' });
  logger.info({ squadId: squad.id, members: deduped.length }, 'squad created');
  return squad;
}

export function getSquad(id: string): Squad | undefined {
  return getStore()[id];
}

export function listSquads(ownerId?: string): Squad[] {
  const all = Object.values(getStore());
  return ownerId ? all.filter((s) => s.ownerId === ownerId) : all;
}

function mutate(id: string, fn: (squad: Squad) => Squad): Squad | undefined {
  const current = getStore();
  const existing = current[id];
  if (!existing) return undefined;
  const next = { ...fn(existing), updatedAt: new Date().toISOString() };
  save({ ...current, [id]: next });
  return next;
}

export function updateSquad(
  id: string,
  patch: { name?: string; description?: string; leaderId?: string; projectId?: string | null },
  actor: string,
): Squad | undefined {
  return mutate(id, (squad) => {
    const leaderId = patch.leaderId !== undefined
      ? (squad.members.some((m) => m.id === patch.leaderId) ? patch.leaderId : squad.leaderId)
      : squad.leaderId;
    return {
      ...squad,
      name: patch.name?.trim() || squad.name,
      description: patch.description !== undefined ? (patch.description.trim() || undefined) : squad.description,
      leaderId,
      projectId: patch.projectId !== undefined ? (patch.projectId?.trim() || undefined) : squad.projectId,
      activity: appendActivity(squad, { actor, action: 'updated' }),
    };
  });
}

export function addMember(id: string, member: Partial<SquadMember> & { id: string }, actor: string): Squad | undefined {
  return mutate(id, (squad) => {
    if (squad.members.some((m) => m.id === member.id)) return squad;
    const normalized = normalizeMember(member);
    return {
      ...squad,
      members: [...squad.members, normalized],
      activity: appendActivity(squad, { actor, action: 'member_added', detail: `${normalized.kind}:${normalized.id} (${normalized.role})` }),
    };
  });
}

export function removeMember(id: string, memberId: string, actor: string): Squad | undefined {
  return mutate(id, (squad) => {
    if (!squad.members.some((m) => m.id === memberId)) return squad;
    return {
      ...squad,
      members: squad.members.filter((m) => m.id !== memberId),
      leaderId: squad.leaderId === memberId ? undefined : squad.leaderId,
      activity: appendActivity(squad, { actor, action: 'member_removed', detail: memberId }),
    };
  });
}

export function setMemberRole(
  id: string,
  memberId: string,
  role: string | undefined,
  actor: string,
  patch?: { projectId?: string | null },
): Squad | undefined {
  return mutate(id, (squad) => {
    if (!squad.members.some((m) => m.id === memberId)) return squad;
    const detailParts = [
      role !== undefined ? `role=${role.trim() || 'unchanged'}` : null,
      patch?.projectId !== undefined ? `project=${patch.projectId?.trim() || 'none'}` : null,
    ].filter(Boolean);
    return {
      ...squad,
      members: squad.members.map((m) => (m.id === memberId ? {
        ...m,
        role: role !== undefined ? (role.trim() || m.role) : m.role,
        projectId: patch?.projectId !== undefined ? (patch.projectId?.trim() || undefined) : m.projectId,
      } : m)),
      activity: appendActivity(squad, { actor, action: 'role_changed', detail: `${memberId} → ${detailParts.join(', ')}` }),
    };
  });
}

/** Append a free-form activity entry (e.g. "dispatched task X to squad"). */
export function logSquadActivity(id: string, entry: Omit<SquadActivityEntry, 'at'>): Squad | undefined {
  return mutate(id, (squad) => ({ ...squad, activity: appendActivity(squad, entry) }));
}

export interface ResolvedSquadProject {
  projectId?: string;
  source?: 'request' | 'member' | 'squad';
}

export function resolveSquadDispatchProject(params: {
  squadId: string;
  assignedMemberIds: readonly string[];
  explicitProjectId?: string;
}): ResolvedSquadProject {
  const explicitProjectId = params.explicitProjectId?.trim();
  if (explicitProjectId) return { projectId: explicitProjectId, source: 'request' };

  const squad = getSquad(params.squadId);
  if (!squad) return {};

  const assignedMembers = new Set(params.assignedMemberIds);
  const memberProjectIds = squad.members
    .filter((m) => assignedMembers.has(m.id))
    .map((m) => m.projectId?.trim())
    .filter((projectId): projectId is string => !!projectId);
  const uniqueMemberProjectIds = Array.from(new Set(memberProjectIds));
  if (uniqueMemberProjectIds.length === 1) {
    return { projectId: uniqueMemberProjectIds[0], source: 'member' };
  }

  const squadProjectId = squad.projectId?.trim();
  if (squadProjectId) return { projectId: squadProjectId, source: 'squad' };

  return {};
}

export interface PortableSquad {
  name: string;
  description?: string;
  leaderId?: string;
  projectId?: string;
  members: Array<{ id: string; kind: MemberKind; role: string; projectId?: string }>;
}

/** Export a squad to a portable shape (no owner/activity/timestamps). */
export function exportSquad(id: string): PortableSquad | undefined {
  const s = getStore()[id];
  if (!s) return undefined;
  return {
    name: s.name,
    description: s.description,
    leaderId: s.leaderId,
    projectId: s.projectId,
    members: s.members.map((m) => ({ id: m.id, kind: m.kind, role: m.role, projectId: m.projectId })),
  };
}

/** Create a squad from a portable shape (import / share). */
export function importSquad(data: PortableSquad, ownerId: string): Squad {
  return createSquad({
    name: data.name,
    description: data.description,
    ownerId,
    leaderId: data.leaderId,
    projectId: data.projectId,
    members: Array.isArray(data.members) ? data.members : [],
  });
}

/** Duplicate a squad's composition (members + roles + leader) into a new squad. */
export function cloneSquad(id: string, ownerId: string): Squad | undefined {
  const src = getStore()[id];
  if (!src) return undefined;
  return createSquad({
    name: `${src.name} (copy)`,
    description: src.description,
    ownerId,
    leaderId: src.leaderId,
    projectId: src.projectId,
    members: src.members.map((m) => ({ id: m.id, kind: m.kind, role: m.role, projectId: m.projectId })),
  });
}

export function deleteSquad(id: string): boolean {
  const current = getStore();
  if (!current[id]) return false;
  const next = { ...current };
  delete next[id];
  save(next);
  return true;
}
