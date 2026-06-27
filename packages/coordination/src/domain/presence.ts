/**
 * AgentPresence — online/busy/idle + last-seen, derived from heartbeats.
 * MERGED from `docker-backend/src/a2a/heartbeat-tracker.service.ts`
 * (`HEARTBEAT_TIMEOUT_MS` online/offline). The coherence `stale-presence` check
 * marks an agent offline when its heartbeat is older than the timeout.
 */

export type PresenceStatus = 'online' | 'busy' | 'idle' | 'offline';

export const PRESENCE_STATUSES: readonly PresenceStatus[] = [
  'online',
  'busy',
  'idle',
  'offline',
] as const;

export type AgentPresence = {
  agentId: string;
  status: PresenceStatus;
  /** ISO time of the last heartbeat. */
  lastSeen: string;
  /** Task the agent reports it is currently working, if busy. */
  currentTaskId?: string;
};

/** Derive offline status from heartbeat age vs the configured timeout. */
export function isHeartbeatStale(
  presence: AgentPresence,
  now: string,
  timeoutMs: number,
): boolean {
  return Date.parse(now) - Date.parse(presence.lastSeen) > timeoutMs;
}
