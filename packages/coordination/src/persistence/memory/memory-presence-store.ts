/**
 * MemoryPresenceStore — Map-backed `PresenceStorePort`. Tracks heartbeats +
 * online/busy/idle/offline status, backing the coherence `stale-presence`
 * check. The Postgres adapter (wave-2) reads the A2A heartbeat-tracker table.
 */

import type { AgentPresence, PresenceStatus } from '../../domain';
import type { PresenceStorePort } from '../../ports';

export class MemoryPresenceStore implements PresenceStorePort {
  private readonly presence = new Map<string, AgentPresence>();

  async get(agentId: string): Promise<AgentPresence | undefined> {
    const found = this.presence.get(agentId);
    return found ? { ...found } : undefined;
  }

  async list(): Promise<AgentPresence[]> {
    return [...this.presence.values()].map((found) => ({ ...found }));
  }

  async heartbeat(agentId: string, status: PresenceStatus, at: string): Promise<void> {
    const existing = this.presence.get(agentId);
    this.presence.set(agentId, {
      ...existing,
      agentId,
      status,
      lastSeen: at,
    });
  }

  async setStatus(agentId: string, status: PresenceStatus, at: string): Promise<void> {
    const existing = this.presence.get(agentId);
    this.presence.set(agentId, {
      agentId,
      status,
      lastSeen: existing?.lastSeen ?? at,
      ...(existing?.currentTaskId ? { currentTaskId: existing.currentTaskId } : {}),
    });
  }
}
