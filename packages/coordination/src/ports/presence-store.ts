/**
 * PresenceStorePort — heartbeats + online/busy/idle status. Backed by the A2A
 * heartbeat-tracker (`HEARTBEAT_TIMEOUT_MS`). The coherence `stale-presence`
 * check reads this and marks dead agents offline.
 */

import type { AgentPresence, PresenceStatus } from '../domain';

export interface PresenceStorePort {
  get(agentId: string): Promise<AgentPresence | undefined>;
  list(): Promise<AgentPresence[]>;
  /** Record a heartbeat, updating lastSeen + status. */
  heartbeat(agentId: string, status: PresenceStatus, at: string): Promise<void>;
  /** Force a status transition (e.g. coherence marking an agent offline). */
  setStatus(agentId: string, status: PresenceStatus, at: string): Promise<void>;
}
