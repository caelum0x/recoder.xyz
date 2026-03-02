/**
 * @module amb-client
 *
 * Lightweight HTTP client for the docker-backend AMB (Agent Messaging Bus) REST API.
 * Used by the Agency gateway to publish workflow events to AMB channels.
 *
 * All methods are non-blocking: if docker-backend is unavailable, errors are
 * logged and swallowed so they never block the agency workflow.
 */

const DEFAULT_BASE_URL = process.env.DOCKER_BACKEND_URL || 'http://localhost:7777';

export interface AMBChannel {
  id: string;
  name: string;
  scope: 'channel' | 'dm';
  memberAgentIds: string[];
  createdAt: string;
}

export interface AMBThread {
  id: string;
  channelId: string;
  title: string;
  createdBy: string;
  createdAt: string;
}

export interface AMBMessage {
  id: string;
  threadId: string;
  senderAgentId: string;
  text: string;
  mentions: string[];
  createdAt: string;
}

export class AMBClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  async createChannel(name: string, description?: string, createdBy = 'agency-gateway'): Promise<AMBChannel | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/a2a/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          scope: 'channel',
          memberAgentIds: [createdBy],
          metadata: description ? { description } : undefined,
        }),
      });

      if (!res.ok) {
        console.warn(`[AMBClient] createChannel failed: ${res.status} ${res.statusText}`);
        return null;
      }

      const json = await res.json() as { success: boolean; data: AMBChannel };
      return json.data ?? null;
    } catch (err) {
      console.warn(`[AMBClient] createChannel error:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  async createThread(channelId: string, title: string, createdBy = 'agency-gateway'): Promise<AMBThread | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/a2a/channels/${channelId}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, createdBy }),
      });

      if (!res.ok) {
        console.warn(`[AMBClient] createThread failed: ${res.status}`);
        return null;
      }

      const json = await res.json() as { success: boolean; data: AMBThread };
      return json.data ?? null;
    } catch (err) {
      console.warn(`[AMBClient] createThread error:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  async sendMessage(
    channelId: string,
    threadId: string,
    message: { senderAgentId: string; text: string },
  ): Promise<AMBMessage | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/a2a/channels/${channelId}/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      if (!res.ok) {
        console.warn(`[AMBClient] sendMessage failed: ${res.status}`);
        return null;
      }

      const json = await res.json() as { success: boolean; data: AMBMessage };
      return json.data ?? null;
    } catch (err) {
      console.warn(`[AMBClient] sendMessage error:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  async getOrCreateWorkflowChannel(workflowId: string): Promise<AMBChannel | null> {
    const name = `workflow-${workflowId}`;
    return this.createChannel(name, `Workflow ${workflowId} orchestration channel`);
  }
}
