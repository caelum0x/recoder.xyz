/**
 * @module squad-dispatch.service
 *
 * Makes squads actionable: dispatch a task to a squad and fan it out to member
 * agents by a strategy. Each assignment is durable and observable, and the
 * dispatch wires into the rest of the collaboration layer:
 *   - presence: members move queued → working → idle as assignments progress
 *   - skill profiles: completion/failure records an outcome (compounds skills)
 *   - squad activity: every dispatch + transition is logged on the squad
 *
 * Strategies: all (every agent member), leader (the squad leader), round-robin
 * (rotate through agent members), best-match (skill-profile ranked).
 */

import { loadStore, debouncedSave } from '../persistence';
import { createLogger } from '../logger';

const logger = createLogger('squad-dispatch.service');

const STORE_NAME = 'squad-tasks';
const RR_STORE_NAME = 'squad-roundrobin';

export type DispatchStrategy = 'all' | 'leader' | 'round-robin' | 'best-match';
export type AssignmentStatus = 'queued' | 'in_progress' | 'completed' | 'failed';

export interface SquadAssignment {
  memberId: string;
  status: AssignmentStatus;
  updatedAt: string;
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
}

type TaskStore = Record<string, SquadTask>;
type RoundRobinStore = Record<string, number>;

let store: TaskStore | null = null;
let rr: RoundRobinStore | null = null;

function getStore(): TaskStore {
  if (store === null) store = loadStore<TaskStore>(STORE_NAME, {});
  return store;
}
function getRr(): RoundRobinStore {
  if (rr === null) rr = loadStore<RoundRobinStore>(RR_STORE_NAME, {});
  return rr;
}

function skillFromTask(task: string): string {
  const t = task.toLowerCase();
  if (/\btest|spec|coverage\b/.test(t)) return 'test';
  if (/\bbug|fix|error|crash\b/.test(t)) return 'bug-fix';
  if (/\bdoc|readme|comment\b/.test(t)) return 'doc';
  if (/\brefactor|cleanup|rename\b/.test(t)) return 'refactor';
  if (/\bui|css|style|design|component\b/.test(t)) return 'visual';
  return 'feature';
}

async function selectTargets(
  squad: { members: Array<{ id: string; kind: string }>; leaderId?: string },
  strategy: DispatchStrategy,
  squadId: string,
  task: string,
): Promise<string[]> {
  const agents = squad.members.filter((m) => m.kind === 'agent').map((m) => m.id);
  if (agents.length === 0) return [];

  switch (strategy) {
    case 'leader':
      return squad.leaderId && agents.includes(squad.leaderId) ? [squad.leaderId] : [agents[0]];
    case 'round-robin': {
      const current = getRr();
      const idx = (current[squadId] ?? 0) % agents.length;
      rr = { ...current, [squadId]: idx + 1 };
      debouncedSave(RR_STORE_NAME, rr);
      return [agents[idx]];
    }
    case 'best-match': {
      try {
        const { rankAgentsForSkills } = await import('../agent-skill-profile.js');
        // Member skill profiles are keyed by the raw agent id (recordTaskOutcome
        // in transitionAssignment), so rank by raw ids — not `runtime:` prefixed.
        const ranked = rankAgentsForSkills(agents, [skillFromTask(task)]);
        const best = ranked[0]?.agentId;
        return best && agents.includes(best) ? [best] : [agents[0]];
      } catch {
        return [agents[0]];
      }
    }
    case 'all':
    default:
      return agents;
  }
}

function rollUpStatus(assignments: SquadAssignment[]): SquadTask['status'] {
  if (assignments.length === 0) return 'assigned';
  const statuses = assignments.map((a) => a.status);
  if (statuses.every((s) => s === 'completed')) return 'completed';
  if (statuses.every((s) => s === 'failed')) return 'failed';
  if (statuses.some((s) => s === 'completed' || s === 'failed') && statuses.some((s) => s === 'queued' || s === 'in_progress')) return 'partial';
  if (statuses.some((s) => s === 'in_progress')) return 'in_progress';
  if (statuses.some((s) => s === 'completed' || s === 'failed')) return 'partial';
  return 'assigned';
}

export async function dispatchToSquad(params: {
  squadId: string;
  task: string;
  strategy?: DispatchStrategy;
  createdBy: string;
}): Promise<{ ok: boolean; reason?: string; squadTask?: SquadTask; deliveredTo?: string[] }> {
  const { getSquad, logSquadActivity } = await import('./squad.service.js');
  const squad = getSquad(params.squadId);
  if (!squad) return { ok: false, reason: 'squad not found' };

  const strategy = params.strategy ?? 'all';
  const targets = await selectTargets(squad, strategy, params.squadId, params.task);
  if (targets.length === 0) return { ok: false, reason: 'squad has no agent members to dispatch to' };

  const now = new Date().toISOString();
  const squadTask: SquadTask = {
    id: `stask_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    squadId: params.squadId,
    task: params.task,
    strategy,
    status: 'assigned',
    assignments: targets.map((memberId) => ({ memberId, status: 'queued', updatedAt: now })),
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  save({ ...getStore(), [squadTask.id]: squadTask });

  // Reflect queued load in presence + log on the squad.
  try {
    const { markQueued } = await import('./presence.service.js');
    targets.forEach((id) => markQueued(id, 1));
  } catch (err) {
    logger.warn({ err }, 'presence update on dispatch failed');
  }

  // Real execution hand-off: deliver the task to each target agent's A2A inbox
  // (agents that poll their inbox pick it up). Best-effort — never blocks dispatch.
  const deliveredTo: string[] = [];
  try {
    const { getAgentMessagingService } = await import('./agent-messaging.service.js');
    const messaging = getAgentMessagingService();
    for (const target of targets) {
      try {
        messaging.sendMessage({
          fromAgentId: `squad:${params.squadId}`,
          toAgentId: target,
          type: 'request',
          subject: `Squad task: ${squad.name}`,
          body: params.task,
          priority: 'normal',
          metadata: { squadTaskId: squadTask.id, squadId: params.squadId, dispatchedBy: params.createdBy },
        });
        deliveredTo.push(target);
      } catch (err) {
        logger.warn({ err, target }, 'squad task delivery to agent inbox failed');
      }
    }
  } catch (err) {
    logger.warn({ err }, 'agent messaging unavailable; assignments recorded without inbox delivery');
  }

  logSquadActivity(params.squadId, {
    actor: params.createdBy,
    action: 'task_dispatched',
    detail: `${strategy} → ${targets.length} member(s) (${deliveredTo.length} delivered): ${params.task.slice(0, 70)}`,
  });

  logger.info({ squadTaskId: squadTask.id, squadId: params.squadId, targets: targets.length, delivered: deliveredTo.length, strategy }, 'dispatched task to squad');
  return { ok: true, squadTask, deliveredTo };
}

function save(next: TaskStore): void {
  store = next;
  debouncedSave(STORE_NAME, next);
}

export function listSquadTasks(squadId: string): SquadTask[] {
  return Object.values(getStore())
    .filter((t) => t.squadId === squadId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getSquadTask(id: string): SquadTask | undefined {
  return getStore()[id];
}

export interface SquadStats {
  totalTasks: number;
  byStatus: Record<string, number>;
  assignments: { total: number; completed: number; failed: number; inProgress: number; queued: number };
  completionRate: number;
  byMember: Record<string, { total: number; completed: number; failed: number }>;
}

/** Aggregate dispatch metrics for a squad: task statuses, completion rate, per-member contribution. */
export function getSquadStats(squadId: string): SquadStats {
  const tasks = listSquadTasks(squadId);
  const byStatus: Record<string, number> = {};
  const byMember: Record<string, { total: number; completed: number; failed: number }> = {};
  const assignments = { total: 0, completed: 0, failed: 0, inProgress: 0, queued: 0 };

  for (const task of tasks) {
    byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
    for (const a of task.assignments) {
      assignments.total += 1;
      if (a.status === 'completed') assignments.completed += 1;
      else if (a.status === 'failed') assignments.failed += 1;
      else if (a.status === 'in_progress') assignments.inProgress += 1;
      else assignments.queued += 1;

      const m = byMember[a.memberId] ?? { total: 0, completed: 0, failed: 0 };
      m.total += 1;
      if (a.status === 'completed') m.completed += 1;
      if (a.status === 'failed') m.failed += 1;
      byMember[a.memberId] = m;
    }
  }

  const terminal = assignments.completed + assignments.failed;
  return {
    totalTasks: tasks.length,
    byStatus,
    assignments,
    completionRate: terminal > 0 ? Number((assignments.completed / terminal).toFixed(4)) : 0,
    byMember,
  };
}

export async function transitionAssignment(
  squadTaskId: string,
  memberId: string,
  status: AssignmentStatus,
  actor: string,
): Promise<{ ok: boolean; reason?: string; squadTask?: SquadTask }> {
  const current = getStore();
  const existing = current[squadTaskId];
  if (!existing) return { ok: false, reason: 'squad task not found' };
  const assignment = existing.assignments.find((a) => a.memberId === memberId);
  if (!assignment) return { ok: false, reason: 'member not assigned to this task' };

  const prevStatus = assignment.status;
  const now = new Date().toISOString();
  const assignments = existing.assignments.map((a) =>
    a.memberId === memberId ? { ...a, status, updatedAt: now } : a,
  );
  const next: SquadTask = { ...existing, assignments, status: rollUpStatus(assignments), updatedAt: now };
  save({ ...current, [squadTaskId]: next });

  // Update presence counters across the transition.
  try {
    const presence = await import('./presence.service.js');
    if (prevStatus === 'queued' && status === 'in_progress') {
      presence.markQueued(memberId, -1);
      presence.markActive(memberId, 1);
    } else if (status === 'completed' || status === 'failed') {
      if (prevStatus === 'in_progress') presence.markActive(memberId, -1);
      if (prevStatus === 'queued') presence.markQueued(memberId, -1);
    }
  } catch (err) {
    logger.warn({ err }, 'presence update on transition failed');
  }

  // Feed the skill profile on terminal transitions (compound skills).
  if (status === 'completed' || status === 'failed') {
    try {
      const { recordTaskOutcome } = await import('../agent-skill-profile.js');
      recordTaskOutcome({ agentId: memberId, skills: [skillFromTask(existing.task)], success: status === 'completed' });
    } catch { /* best-effort */ }
  }

  try {
    const { logSquadActivity } = await import('./squad.service.js');
    logSquadActivity(existing.squadId, { actor, action: 'assignment_' + status, detail: `${memberId}` });
  } catch { /* best-effort */ }

  return { ok: true, squadTask: next };
}
