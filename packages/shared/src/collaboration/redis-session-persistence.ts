/**
 * Redis Session Persistence
 * Production-grade session storage for collaborative development
 */

import Redis from 'ioredis';
import { Logger } from '../utils/logger';
import { SessionPersistence } from './session-manager';
import { CollaborationSession, CodeChange } from './websocket-server';

export interface RedisSessionPersistenceOptions {
  redis?: Redis;
  redisUrl?: string;
  keyPrefix?: string;
  sessionTTL?: number; // seconds
  historyTTL?: number; // seconds
  maxHistoryItems?: number;
}

export class RedisSessionPersistence implements SessionPersistence {
  private redis: Redis;
  private keyPrefix: string;
  private sessionTTL: number;
  private historyTTL: number;
  private maxHistoryItems: number;

  constructor(options: RedisSessionPersistenceOptions = {}) {
    this.redis = options.redis || new Redis(options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
    this.keyPrefix = options.keyPrefix || 'recoder:sessions:';
    this.sessionTTL = options.sessionTTL || 24 * 60 * 60; // 24 hours
    this.historyTTL = options.historyTTL || 7 * 24 * 60 * 60; // 7 days
    this.maxHistoryItems = options.maxHistoryItems || 1000;

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      Logger.info('Connected to Redis for session persistence');
    });

    this.redis.on('error', (error) => {
      Logger.error('Redis session persistence error:', error);
    });

    this.redis.on('disconnect', () => {
      Logger.warn('Disconnected from Redis session persistence');
    });
  }

  async saveSession(session: CollaborationSession): Promise<void> {
    try {
      const key = this.getSessionKey(session.id);
      
      // Serialize the session with Maps converted to objects
      const serializedSession = {
        ...session,
        users: Array.from(session.users.entries()),
        aiAgents: Array.from(session.aiAgents.entries())
      };

      await this.redis.setex(
        key,
        this.sessionTTL,
        JSON.stringify(serializedSession)
      );

      // Also maintain a set of all session IDs for listing
      await this.redis.sadd(`${this.keyPrefix}all`, session.id);
      await this.redis.expire(`${this.keyPrefix}all`, this.sessionTTL);

      // Index by user for quick lookup
      for (const [userId] of session.users) {
        await this.redis.sadd(`${this.keyPrefix}user:${userId}`, session.id);
        await this.redis.expire(`${this.keyPrefix}user:${userId}`, this.sessionTTL);
      }

      Logger.debug(`Session ${session.id} saved to Redis`);
    } catch (error) {
      Logger.error(`Failed to save session ${session.id}:`, error);
      throw error;
    }
  }

  async loadSession(sessionId: string): Promise<CollaborationSession | null> {
    try {
      const key = this.getSessionKey(sessionId);
      const data = await this.redis.get(key);

      if (!data) {
        return null;
      }

      const parsed = JSON.parse(data);
      
      // Reconstruct the session with Maps
      const session: CollaborationSession = {
        ...parsed,
        users: new Map(parsed.users),
        aiAgents: new Map(parsed.aiAgents),
        createdAt: new Date(parsed.createdAt)
      };

      Logger.debug(`Session ${sessionId} loaded from Redis`);
      return session;
    } catch (error) {
      Logger.error(`Failed to load session ${sessionId}:`, error);
      return null;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      const key = this.getSessionKey(sessionId);
      
      // Load session first to get user IDs for cleanup
      const session = await this.loadSession(sessionId);
      
      // Delete the session
      await this.redis.del(key);
      
      // Remove from all sessions set
      await this.redis.srem(`${this.keyPrefix}all`, sessionId);
      
      // Remove from user indices
      if (session) {
        for (const [userId] of session.users) {
          await this.redis.srem(`${this.keyPrefix}user:${userId}`, sessionId);
        }
      }

      // Delete associated code history
      const historyKey = this.getHistoryKey(sessionId);
      await this.redis.del(historyKey);

      Logger.debug(`Session ${sessionId} deleted from Redis`);
    } catch (error) {
      Logger.error(`Failed to delete session ${sessionId}:`, error);
      throw error;
    }
  }

  async listSessions(userId?: string): Promise<CollaborationSession[]> {
    try {
      let sessionIds: string[];

      if (userId) {
        // Get sessions for specific user
        sessionIds = await this.redis.smembers(`${this.keyPrefix}user:${userId}`);
      } else {
        // Get all sessions
        sessionIds = await this.redis.smembers(`${this.keyPrefix}all`);
      }

      // Load all sessions
      const sessions: CollaborationSession[] = [];
      for (const sessionId of sessionIds) {
        const session = await this.loadSession(sessionId);
        if (session) {
          sessions.push(session);
        }
      }

      // Sort by creation date (newest first)
      sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      Logger.debug(`Listed ${sessions.length} sessions${userId ? ` for user ${userId}` : ''}`);
      return sessions;
    } catch (error) {
      Logger.error(`Failed to list sessions${userId ? ` for user ${userId}` : ''}:`, error);
      throw error;
    }
  }

  async saveCodeHistory(sessionId: string, change: CodeChange): Promise<void> {
    try {
      const key = this.getHistoryKey(sessionId);
      
      // Add the change to a sorted set with timestamp as score
      const score = change.timestamp.getTime();
      await this.redis.zadd(key, score, JSON.stringify(change));

      // Trim to max items (keep most recent)
      await this.redis.zremrangebyrank(key, 0, -(this.maxHistoryItems + 1));

      // Set expiration
      await this.redis.expire(key, this.historyTTL);

      Logger.debug(`Code change saved to history for session ${sessionId}`);
    } catch (error) {
      Logger.error(`Failed to save code history for session ${sessionId}:`, error);
      throw error;
    }
  }

  async getCodeHistory(sessionId: string, file?: string): Promise<CodeChange[]> {
    try {
      const key = this.getHistoryKey(sessionId);
      
      // Get all changes in reverse chronological order
      const changes = await this.redis.zrevrange(key, 0, -1);
      
      const parsedChanges: CodeChange[] = changes.map(change => {
        const parsed = JSON.parse(change);
        return {
          ...parsed,
          timestamp: new Date(parsed.timestamp)
        };
      });

      // Filter by file if specified
      const filteredChanges = file 
        ? parsedChanges.filter(change => change.file === file)
        : parsedChanges;

      Logger.debug(`Retrieved ${filteredChanges.length} code changes for session ${sessionId}${file ? ` file ${file}` : ''}`);
      return filteredChanges;
    } catch (error) {
      Logger.error(`Failed to get code history for session ${sessionId}:`, error);
      throw error;
    }
  }

  // Additional Redis-specific methods

  async getSessionStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    totalUsers: number;
    memoryUsage: string;
  }> {
    try {
      const totalSessions = await this.redis.scard(`${this.keyPrefix}all`);
      
      // Count active sessions (those with recent activity)
      const sessionIds = await this.redis.smembers(`${this.keyPrefix}all`);
      let activeSessions = 0;
      const uniqueUsers = new Set<string>();

      for (const sessionId of sessionIds) {
        const session = await this.loadSession(sessionId);
        if (session) {
          // Consider session active if any user was seen in last hour
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          const hasActiveUsers = Array.from(session.users.values())
            .some(user => user.lastSeen > oneHourAgo);
          
          if (hasActiveUsers) {
            activeSessions++;
          }

          // Count unique users
          for (const [userId] of session.users) {
            uniqueUsers.add(userId);
          }
        }
      }

      // Get memory usage
      const info = await this.redis.info('memory');
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1].trim() : 'unknown';

      return {
        totalSessions,
        activeSessions,
        totalUsers: uniqueUsers.size,
        memoryUsage
      };
    } catch (error) {
      Logger.error('Failed to get session stats:', error);
      throw error;
    }
  }

  async cleanupExpiredSessions(): Promise<number> {
    try {
      const sessionIds = await this.redis.smembers(`${this.keyPrefix}all`);
      let cleanedUp = 0;

      for (const sessionId of sessionIds) {
        const exists = await this.redis.exists(this.getSessionKey(sessionId));
        if (!exists) {
          // Session expired, clean up references
          await this.redis.srem(`${this.keyPrefix}all`, sessionId);
          cleanedUp++;
        }
      }

      Logger.info(`Cleaned up ${cleanedUp} expired sessions`);
      return cleanedUp;
    } catch (error) {
      Logger.error('Failed to cleanup expired sessions:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    Logger.info('Shutting down Redis session persistence...');
    await this.redis.quit();
    Logger.info('Redis session persistence shut down');
  }

  // Private helper methods

  private getSessionKey(sessionId: string): string {
    return `${this.keyPrefix}session:${sessionId}`;
  }

  private getHistoryKey(sessionId: string): string {
    return `${this.keyPrefix}history:${sessionId}`;
  }
}

// Export for use in other modules
export default RedisSessionPersistence;