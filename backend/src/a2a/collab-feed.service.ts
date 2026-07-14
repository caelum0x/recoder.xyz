/**
 * @module collab-feed.service
 *
 * Unified collaboration activity feed — a single time-sorted stream of what's
 * happening across all squads (creation, membership changes, task dispatches,
 * assignment transitions). Read-only aggregation over the existing squad +
 * squad-task stores, so it needs no extra event wiring and never drifts from
 * the source of truth.
 */

export interface CollabFeedEntry {
  at: string;
  squadId: string;
  squadName: string;
  actor: string;
  action: string;
  detail?: string;
}

/**
 * Merge every squad's activity log into one descending-time feed. Optionally
 * scope to a single owner (the squads they own).
 */
export async function getCollabFeed(params: { ownerId?: string; limit?: number } = {}): Promise<CollabFeedEntry[]> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 500);
  const { listSquads } = await import('./squad.service.js');
  const squads = listSquads(params.ownerId);

  const entries: CollabFeedEntry[] = [];
  for (const squad of squads) {
    for (const a of squad.activity) {
      entries.push({
        at: a.at,
        squadId: squad.id,
        squadName: squad.name,
        actor: a.actor,
        action: a.action,
        detail: a.detail,
      });
    }
  }

  entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return entries.slice(0, limit);
}

export interface RosterEntry {
  agentId: string;
  squads: Array<{ squadId: string; squadName: string; role: string }>;
  presence: import('./presence.service.js').AgentPresence;
}

/**
 * Cross-squad agent roster: every unique agent that's a member of any squad,
 * with the squads/roles it belongs to and its live presence. Backs the
 * collaboration command center. Single batched presence derivation.
 */
export async function getRoster(params: { ownerId?: string } = {}): Promise<RosterEntry[]> {
  const { listSquads } = await import('./squad.service.js');
  const squads = listSquads(params.ownerId);

  const bySquad = new Map<string, Array<{ squadId: string; squadName: string; role: string }>>();
  for (const squad of squads) {
    for (const m of squad.members) {
      if (m.kind !== 'agent') continue;
      const list = bySquad.get(m.id) ?? [];
      list.push({ squadId: squad.id, squadName: squad.name, role: m.role });
      bySquad.set(m.id, list);
    }
  }

  const agentIds = Array.from(bySquad.keys());
  const { buildPresenceMap } = await import('./presence.service.js');
  const presence = await buildPresenceMap(agentIds);

  return agentIds
    .map((agentId) => ({ agentId, squads: bySquad.get(agentId) ?? [], presence: presence[agentId] }))
    .sort((a, b) => b.squads.length - a.squads.length);
}

/** Lightweight summary for dashboards: counts by action over the feed window. */
export async function getCollabSummary(params: { ownerId?: string } = {}): Promise<{
  squads: number;
  totalActivity: number;
  byAction: Record<string, number>;
  lastActivityAt?: string;
}> {
  const { listSquads } = await import('./squad.service.js');
  const squads = listSquads(params.ownerId);
  const byAction: Record<string, number> = {};
  let total = 0;
  let last: string | undefined;
  for (const squad of squads) {
    for (const a of squad.activity) {
      byAction[a.action] = (byAction[a.action] ?? 0) + 1;
      total += 1;
      if (!last || a.at > last) last = a.at;
    }
  }
  return { squads: squads.length, totalActivity: total, byAction, lastActivityAt: last };
}
