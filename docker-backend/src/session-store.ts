/**
 * Terminal Session Store
 * Persists terminal sessions in Redis for recovery after container/backend restarts
 */

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const SESSION_TTL = 24 * 60 * 60; // 24 hours

export interface TerminalSession {
  projectId: string;
  terminalId: string;
  userId?: string;
  createdAt: number;
  lastActive: number;
  history: string[]; // Command history
  cwd: string;
  env: Record<string, string>;
}

export interface ChatSession {
  projectId: string;
  userId?: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    source?: 'web' | 'cli';
  }>;
  createdAt: number;
  lastActive: number;
}

class SessionStore {
  private redis: Redis | null = null;
  private connected = false;
  private memoryFallback = new Map<string, any>();

  async connect(): Promise<boolean> {
    if (this.connected) return true;

    try {
      this.redis = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 100, 3000);
        },
        lazyConnect: true,
      });

      await this.redis.connect();
      this.connected = true;
      console.log('[SessionStore] Connected to Redis');
      return true;
    } catch (error: any) {
      console.warn('[SessionStore] Redis not available, using memory fallback:', error.message);
      this.redis = null;
      this.connected = false;
      return false;
    }
  }

  // Terminal Session Methods

  async saveTerminalSession(session: TerminalSession): Promise<void> {
    const key = `terminal:${session.projectId}:${session.terminalId}`;
    const data = JSON.stringify(session);

    if (this.redis && this.connected) {
      await this.redis.setex(key, SESSION_TTL, data);
    } else {
      this.memoryFallback.set(key, session);
    }
  }

  async getTerminalSession(projectId: string, terminalId: string): Promise<TerminalSession | null> {
    const key = `terminal:${projectId}:${terminalId}`;

    if (this.redis && this.connected) {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } else {
      return this.memoryFallback.get(key) || null;
    }
  }

  async updateTerminalActivity(projectId: string, terminalId: string): Promise<void> {
    const session = await this.getTerminalSession(projectId, terminalId);
    if (session) {
      session.lastActive = Date.now();
      await this.saveTerminalSession(session);
    }
  }

  async addCommandToHistory(projectId: string, terminalId: string, command: string): Promise<void> {
    const session = await this.getTerminalSession(projectId, terminalId);
    if (session) {
      session.history.push(command);
      // Keep last 100 commands
      if (session.history.length > 100) {
        session.history = session.history.slice(-100);
      }
      session.lastActive = Date.now();
      await this.saveTerminalSession(session);
    }
  }

  async getTerminalSessions(projectId: string): Promise<TerminalSession[]> {
    const pattern = `terminal:${projectId}:*`;
    const sessions: TerminalSession[] = [];

    if (this.redis && this.connected) {
      const keys = await this.redis.keys(pattern);
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          sessions.push(JSON.parse(data));
        }
      }
    } else {
      for (const [key, value] of this.memoryFallback) {
        if (key.startsWith(`terminal:${projectId}:`)) {
          sessions.push(value);
        }
      }
    }

    return sessions;
  }

  async deleteTerminalSession(projectId: string, terminalId: string): Promise<void> {
    const key = `terminal:${projectId}:${terminalId}`;

    if (this.redis && this.connected) {
      await this.redis.del(key);
    } else {
      this.memoryFallback.delete(key);
    }
  }

  // Chat Session Methods (for CLI-Web sync)

  async saveChatSession(session: ChatSession): Promise<void> {
    const key = `chat:${session.projectId}`;
    const data = JSON.stringify(session);

    if (this.redis && this.connected) {
      await this.redis.setex(key, SESSION_TTL, data);
    } else {
      this.memoryFallback.set(key, session);
    }
  }

  async getChatSession(projectId: string): Promise<ChatSession | null> {
    const key = `chat:${projectId}`;

    if (this.redis && this.connected) {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } else {
      return this.memoryFallback.get(key) || null;
    }
  }

  async addChatMessage(
    projectId: string,
    message: ChatSession['messages'][0]
  ): Promise<void> {
    let session = await this.getChatSession(projectId);
    
    if (!session) {
      session = {
        projectId,
        messages: [],
        createdAt: Date.now(),
        lastActive: Date.now(),
      };
    }

    session.messages.push(message);
    session.lastActive = Date.now();

    // Keep last 200 messages
    if (session.messages.length > 200) {
      session.messages = session.messages.slice(-200);
    }

    await this.saveChatSession(session);
  }

  async getChatMessages(projectId: string, limit = 50): Promise<ChatSession['messages']> {
    const session = await this.getChatSession(projectId);
    if (!session) return [];
    return session.messages.slice(-limit);
  }

  // Offline Queue Methods

  async queueOfflineChange(projectId: string, change: {
    type: 'create' | 'modify' | 'delete';
    path: string;
    content?: string;
    timestamp: number;
  }): Promise<void> {
    const key = `offline:${projectId}`;
    
    if (this.redis && this.connected) {
      await this.redis.rpush(key, JSON.stringify(change));
      await this.redis.expire(key, SESSION_TTL);
    } else {
      const queue = this.memoryFallback.get(key) || [];
      queue.push(change);
      this.memoryFallback.set(key, queue);
    }
  }

  async getOfflineChanges(projectId: string): Promise<any[]> {
    const key = `offline:${projectId}`;

    if (this.redis && this.connected) {
      const changes = await this.redis.lrange(key, 0, -1);
      return changes.map(c => JSON.parse(c));
    } else {
      return this.memoryFallback.get(key) || [];
    }
  }

  async clearOfflineChanges(projectId: string): Promise<void> {
    const key = `offline:${projectId}`;

    if (this.redis && this.connected) {
      await this.redis.del(key);
    } else {
      this.memoryFallback.delete(key);
    }
  }

  // Connection status
  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.connected = false;
    }
  }
}

export const sessionStore = new SessionStore();
