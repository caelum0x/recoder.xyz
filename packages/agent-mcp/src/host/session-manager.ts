import type { AgentProfile } from '@recoder/agent-os';

export type McpSession = {
  sessionId: string;
  agentId: string;
  spaceId?: string;
  connectedAt: string;
  lastSeenAt: string;
  metadata?: Record<string, unknown>;
};

export class McpSessionManager {
  private readonly sessions = new Map<string, McpSession>();

  upsert(input: {
    sessionId: string;
    agent: AgentProfile;
    spaceId?: string;
    now?: string;
    metadata?: Record<string, unknown>;
  }): McpSession {
    const now = input.now ?? new Date().toISOString();
    const existing = this.sessions.get(input.sessionId);
    const session: McpSession = {
      sessionId: input.sessionId,
      agentId: input.agent.agentId,
      spaceId: input.spaceId,
      connectedAt: existing?.connectedAt ?? now,
      lastSeenAt: now,
      metadata: {
        ...(existing?.metadata ?? {}),
        ...(input.metadata ?? {}),
      },
    };
    this.sessions.set(input.sessionId, session);
    return session;
  }

  list(): McpSession[] {
    return [...this.sessions.values()];
  }

  get(sessionId: string): McpSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  remove(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }
}
