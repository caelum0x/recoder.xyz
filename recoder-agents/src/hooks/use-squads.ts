'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSessionAccessToken } from '@/lib/auth/session-token';

// Squads live on docker-backend (/api/a2a/squads), reached same-origin via the
// /dx/* proxy (see next.config.ts). Authenticated with the session token.

export type MemberKind = 'agent' | 'human';

export interface SquadMember {
  id: string;
  kind: MemberKind;
  role: string;
  addedAt: string;
}

export interface SquadActivityEntry {
  at: string;
  actor: string;
  action: string;
  detail?: string;
}

export interface AgentPresence {
  agentId: string;
  availability: 'online' | 'unstable' | 'offline';
  workload: 'idle' | 'queued' | 'working';
  activeTasks: number;
  queuedTasks: number;
  lastSeenAt?: string;
}

export interface Squad {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  leaderId?: string;
  members: SquadMember[];
  activity: SquadActivityEntry[];
  createdAt: string;
  updatedAt: string;
  presence?: Record<string, AgentPresence>;
}

async function dx<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getSessionAccessToken().catch(() => null);
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (init?.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`/dx${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const json = await res.json();
  return (json?.data ?? json) as T;
}

export const squadKeys = {
  all: ['squads'] as const,
  detail: (id: string) => ['squads', id] as const,
};

export function useSquads() {
  return useQuery<Squad[]>({
    queryKey: squadKeys.all,
    queryFn: async () => (await dx<{ squads: Squad[] }>('/a2a/squads')).squads,
    staleTime: 15_000,
    retry: 1,
  });
}

export function useSquad(id: string, withPresence = true) {
  return useQuery<Squad>({
    queryKey: [...squadKeys.detail(id), withPresence],
    queryFn: () => dx<Squad>(`/a2a/squads/${id}${withPresence ? '?withPresence=true' : ''}`),
    enabled: !!id,
    refetchInterval: withPresence ? 15_000 : false,
  });
}

export function useCreateSquad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string; members?: Array<{ id: string; kind?: MemberKind; role?: string }> }) =>
      dx<Squad>('/a2a/squads', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: squadKeys.all }),
  });
}

export function useDeleteSquad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dx(`/a2a/squads/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: squadKeys.all }),
  });
}

export interface PortableSquad {
  name: string;
  description?: string;
  leaderId?: string;
  members: Array<{ id: string; kind: MemberKind; role: string }>;
}

export function useImportSquad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PortableSquad) => dx<Squad>('/a2a/squads/import', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: squadKeys.all }),
  });
}

export function useCloneSquad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dx<Squad>(`/a2a/squads/${id}/clone`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: squadKeys.all }),
  });
}

export function useAddMember(squadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (member: { id: string; kind?: MemberKind; role?: string }) =>
      dx<Squad>(`/a2a/squads/${squadId}/members`, { method: 'POST', body: JSON.stringify(member) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: squadKeys.detail(squadId) });
      qc.invalidateQueries({ queryKey: squadKeys.all });
    },
  });
}

export function useRemoveMember(squadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => dx<Squad>(`/a2a/squads/${squadId}/members/${memberId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: squadKeys.detail(squadId) });
      qc.invalidateQueries({ queryKey: squadKeys.all });
    },
  });
}

// ── Squad task dispatch ──────────────────────────────────────────────────────

export type DispatchStrategy = 'all' | 'leader' | 'round-robin' | 'best-match';
export type AssignmentStatus = 'queued' | 'in_progress' | 'completed' | 'failed';

export interface SquadAssignment {
  memberId: string;
  status: AssignmentStatus;
  updatedAt: string;
}

export interface ExecutionResult {
  requested: boolean;
  started: boolean;
  reason?: string;
}

export interface SquadTask {
  id: string;
  squadId: string;
  task: string;
  strategy: DispatchStrategy;
  status: 'assigned' | 'in_progress' | 'completed' | 'failed' | 'partial';
  assignments: SquadAssignment[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // Present only on the dispatch response, not on listed tasks.
  deliveredTo?: string[];
  executed?: boolean;
  execution?: ExecutionResult;
}

export interface SquadStats {
  totalTasks: number;
  byStatus: Record<string, number>;
  assignments: { total: number; completed: number; failed: number; inProgress: number; queued: number };
  completionRate: number;
  byMember: Record<string, { total: number; completed: number; failed: number }>;
}

export function useSquadStats(squadId: string) {
  return useQuery<SquadStats>({
    queryKey: ['squad-stats', squadId],
    queryFn: () => dx<SquadStats>(`/a2a/squads/${squadId}/stats`),
    enabled: !!squadId,
    refetchInterval: 15_000,
  });
}

export function useSquadTasks(squadId: string) {
  return useQuery<SquadTask[]>({
    queryKey: ['squad-tasks', squadId],
    queryFn: async () => (await dx<{ tasks: SquadTask[] }>(`/a2a/squads/${squadId}/tasks`)).tasks,
    enabled: !!squadId,
    refetchInterval: 10_000,
  });
}

export interface BoardTask extends SquadTask {
  squadName: string;
}

/** Every task across all of the caller's squads, for the cross-squad board. */
export function useAllSquadTasks() {
  return useQuery<BoardTask[]>({
    queryKey: ['squad-tasks', 'all'],
    queryFn: async () => (await dx<{ tasks: BoardTask[] }>(`/a2a/squad-tasks`)).tasks,
    refetchInterval: 10_000,
  });
}

/** Dispatch to any squad by id (used by the board's dispatch dialog). */
export function useDispatchAnySquad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ squadId, ...body }: { squadId: string; task: string; strategy?: DispatchStrategy; projectId?: string; execute?: boolean }) =>
      dx<SquadTask>(`/a2a/squads/${squadId}/dispatch`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['squad-tasks'] });
    },
  });
}

/** Transition an assignment from the board, invalidating both the board and the squad's own list. */
export function useTransitionBoardAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, memberId, status }: { taskId: string; memberId: string; status: AssignmentStatus }) =>
      dx<SquadTask>(`/a2a/squad-tasks/${taskId}/assignments/${memberId}`, { method: 'POST', body: JSON.stringify({ status }) }),
    onSuccess: () => {
      // Prefix match invalidates the board (['squad-tasks','all']) and any
      // open per-squad list (['squad-tasks', squadId]).
      qc.invalidateQueries({ queryKey: ['squad-tasks'] });
    },
  });
}

export function useDispatchToSquad(squadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { task: string; strategy?: DispatchStrategy; projectId?: string; execute?: boolean }) =>
      dx<SquadTask>(`/a2a/squads/${squadId}/dispatch`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['squad-tasks', squadId] });
      qc.invalidateQueries({ queryKey: squadKeys.detail(squadId) });
    },
  });
}

export interface CollabFeedEntry {
  at: string;
  squadId: string;
  squadName: string;
  actor: string;
  action: string;
  detail?: string;
}

export function useCollabFeed(limit = 30) {
  return useQuery<CollabFeedEntry[]>({
    queryKey: ['collab-feed', limit],
    queryFn: async () => (await dx<{ feed: CollabFeedEntry[] }>(`/a2a/collaboration/feed?limit=${limit}`)).feed,
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 1,
  });
}

export interface CollabSummary {
  squads: number;
  totalActivity: number;
  byAction: Record<string, number>;
  lastActivityAt?: string;
}

export function useCollabSummary() {
  return useQuery<CollabSummary>({
    queryKey: ['collab-summary'],
    queryFn: () => dx<CollabSummary>('/a2a/collaboration/summary'),
    staleTime: 15_000,
    refetchInterval: 20_000,
    retry: 1,
  });
}

export interface SkillStat {
  skill: string;
  attempts: number;
  successes: number;
  successRate: number;
  avgDurationMs: number;
  lastUsedAt: string;
}

export interface AgentSkillProfile {
  agentId: string;
  skills: Record<string, SkillStat>;
  totalTasks: number;
  totalSuccesses: number;
  updatedAt: string;
}

export function useAgentSkills(agentId: string | null) {
  return useQuery<AgentSkillProfile | null>({
    queryKey: ['agent-skills', agentId],
    queryFn: async () => {
      if (!agentId) return null;
      try {
        return await dx<AgentSkillProfile>(`/agent-skills/${encodeURIComponent(agentId)}`);
      } catch {
        return null; // no profile yet (404)
      }
    },
    enabled: !!agentId,
    staleTime: 15_000,
  });
}

export interface AgentAssignment {
  squadTaskId: string;
  squadId: string;
  squadName: string;
  task: string;
  strategy: DispatchStrategy;
  status: AssignmentStatus;
  taskStatus: SquadTask['status'];
  createdAt: string;
  updatedAt: string;
}

/** One agent's recent squad-task assignment history (run history beyond skills). */
export function useAgentAssignments(agentId: string | null) {
  return useQuery<AgentAssignment[]>({
    queryKey: ['agent-assignments', agentId],
    queryFn: async () =>
      (await dx<{ assignments: AgentAssignment[] }>(`/a2a/agents/${encodeURIComponent(agentId!)}/assignments`)).assignments,
    enabled: !!agentId,
    staleTime: 10_000,
  });
}

export interface LeaderboardEntry {
  agentId: string;
  score: number;
  attempts: number;
  successes: number;
  successRate: number;
  topSkills: Array<{ skill: string; successRate: number; attempts: number }>;
}

export function useLeaderboard(skill?: string) {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['skills-leaderboard', skill ?? 'overall'],
    queryFn: async () =>
      (await dx<{ leaderboard: LeaderboardEntry[] }>(`/agent-skills/leaderboard${skill ? `?skill=${encodeURIComponent(skill)}` : ''}`)).leaderboard,
    staleTime: 15_000,
    refetchInterval: 20_000,
    retry: 1,
  });
}

export interface RosterEntry {
  agentId: string;
  squads: Array<{ squadId: string; squadName: string; role: string }>;
  presence: AgentPresence;
}

export function useRoster() {
  return useQuery<RosterEntry[]>({
    queryKey: ['collab-roster'],
    queryFn: async () => (await dx<{ roster: RosterEntry[] }>('/a2a/collaboration/roster')).roster,
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 1,
  });
}

export interface CollabStreamEvent {
  at: string;
  type: string;
  squadId?: string;
  squadName?: string;
  actor?: string;
  action?: string;
  detail?: string;
}

/**
 * Live collaboration event stream via native EventSource. The session token is
 * passed as `?token=` (EventSource can't set headers; the backend promotes it to
 * an Authorization header). EventSource auto-reconnects on transient errors.
 * Callers fall back to the polled feed while `connected` is false.
 */
export function useCollabStream(max = 50): { events: CollabStreamEvent[]; connected: boolean } {
  const [events, setEvents] = useState<CollabStreamEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let active = true;
    let es: EventSource | undefined;

    (async () => {
      const token = await getSessionAccessToken().catch(() => null);
      if (!active) return;
      const url = `/dx/a2a/collaboration/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      es = new EventSource(url);
      es.onopen = () => active && setConnected(true);
      es.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data) as CollabStreamEvent;
          setEvents((prev) => [evt, ...prev].slice(0, max));
        } catch { /* ignore malformed frame */ }
      };
      es.onerror = () => active && setConnected(false); // EventSource retries automatically
    })();

    return () => {
      active = false;
      setConnected(false);
      es?.close();
    };
  }, [max]);

  return { events, connected };
}

export function useTransitionAssignment(squadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, memberId, status }: { taskId: string; memberId: string; status: AssignmentStatus }) =>
      dx<SquadTask>(`/a2a/squad-tasks/${taskId}/assignments/${memberId}`, { method: 'POST', body: JSON.stringify({ status }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['squad-tasks', squadId] });
      qc.invalidateQueries({ queryKey: squadKeys.detail(squadId) });
    },
  });
}
