export type AgentSession = {
  sessionId: string;
  agentId: string;
  workspaceId: string;
  connectedAt: string;
  lastSeenAt: string;
  metadata?: Record<string, unknown>;
};

export class AgentSessionRegistry {
  private readonly sessions = new Map<string, AgentSession>();

  upsert(session: AgentSession): AgentSession {
    this.sessions.set(session.sessionId, session);
    return session;
  }

  list(): AgentSession[] {
    return [...this.sessions.values()];
  }

  remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
