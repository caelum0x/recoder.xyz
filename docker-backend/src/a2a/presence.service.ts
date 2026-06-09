/**
 * @module presence.service
 *
 * Two-dimensional agent presence (inspired by multica): availability and
 * workload are independent axes, derived — never sticky.
 *   - availability: online | unstable | offline  (from registry reachability)
 *   - workload:     idle | queued | working        (from active/queued task counts)
 *
 * Batch-derivable: `buildPresenceMap(ids)` computes presence for a whole roster
 * in one pass (no per-agent HTTP), backing squad/list views cheaply. Workload
 * counters are updated by the task layer via setWorkload/markActive/markIdle.
 */

import { createLogger } from '../logger';

const logger = createLogger('presence.service');

export type Availability = 'online' | 'unstable' | 'offline';
export type Workload = 'idle' | 'queued' | 'working';

export interface AgentPresence {
  agentId: string;
  availability: Availability;
  workload: Workload;
  activeTasks: number;
  queuedTasks: number;
  lastSeenAt?: string;
}

interface WorkloadCounts {
  active: number;
  queued: number;
}

// Stale threshold: online but not seen within this window → "unstable".
const UNSTABLE_AFTER_MS = 60_000;

const workloadByAgent = new Map<string, WorkloadCounts>();

function getCounts(agentId: string): WorkloadCounts {
  return workloadByAgent.get(agentId) ?? { active: 0, queued: 0 };
}

function deriveWorkload(counts: WorkloadCounts): Workload {
  if (counts.active > 0) return 'working';
  if (counts.queued > 0) return 'queued';
  return 'idle';
}

async function deriveAvailability(agentId: string): Promise<{ availability: Availability; lastSeenAt?: string }> {
  try {
    const { getAgentRegistryService } = await import('./agent-registry.service.js');
    const health = getAgentRegistryService().getWithHealth(agentId) as
      | { online?: boolean; lastSeenAt?: string }
      | undefined;
    if (!health) return { availability: 'offline' };
    if (!health.online) return { availability: 'offline', lastSeenAt: health.lastSeenAt };
    const lastSeen = health.lastSeenAt ? Date.parse(health.lastSeenAt) : NaN;
    const stale = Number.isFinite(lastSeen) ? Date.now() - lastSeen > UNSTABLE_AFTER_MS : false;
    return { availability: stale ? 'unstable' : 'online', lastSeenAt: health.lastSeenAt };
  } catch (err) {
    logger.warn({ err, agentId }, 'availability lookup failed; treating as offline');
    return { availability: 'offline' };
  }
}

// ── Workload mutations (called by the task layer) ────────────────────────────

export function setWorkload(agentId: string, counts: Partial<WorkloadCounts>): void {
  const prev = getCounts(agentId);
  workloadByAgent.set(agentId, {
    active: Math.max(0, counts.active ?? prev.active),
    queued: Math.max(0, counts.queued ?? prev.queued),
  });
}

export function markActive(agentId: string, delta = 1): void {
  const prev = getCounts(agentId);
  workloadByAgent.set(agentId, { ...prev, active: Math.max(0, prev.active + delta) });
}

export function markQueued(agentId: string, delta = 1): void {
  const prev = getCounts(agentId);
  workloadByAgent.set(agentId, { ...prev, queued: Math.max(0, prev.queued + delta) });
}

export function clearWorkload(agentId: string): void {
  workloadByAgent.delete(agentId);
}

// ── Presence derivation ──────────────────────────────────────────────────────

export async function getPresence(agentId: string): Promise<AgentPresence> {
  const counts = getCounts(agentId);
  const { availability, lastSeenAt } = await deriveAvailability(agentId);
  return {
    agentId,
    availability,
    workload: deriveWorkload(counts),
    activeTasks: counts.active,
    queuedTasks: counts.queued,
    lastSeenAt,
  };
}

/** Derive presence for a roster in one pass. */
export async function buildPresenceMap(agentIds: string[]): Promise<Record<string, AgentPresence>> {
  const unique = Array.from(new Set(agentIds.filter((id) => typeof id === 'string' && id.trim())));
  const entries = await Promise.all(unique.map(async (id) => [id, await getPresence(id)] as const));
  return Object.fromEntries(entries);
}
