/**
 * Unified Session Management for Cross-Platform Synchronization
 * Handles session state across web, mobile, desktop, CLI, and VS Code extension
 */

import { Redis } from 'ioredis';
import { WebSocket } from 'ws';
import { createHash } from 'crypto';

export interface PlatformSession {
  id: string;
  userId: string;
  platform: 'web' | 'mobile' | 'desktop' | 'cli' | 'vscode' | 'api';
  deviceId: string;
  deviceName: string;
  userAgent?: string;
  ipAddress: string;
  location?: {
    country?: string;
    city?: string;
    timezone: string;
  };
  capabilities: string[]; // Features available on this platform
  lastActivity: string;
  expiresAt: string;
  metadata: Record<string, any>;
}

export interface SessionSyncEvent {
  type: 'session_created' | 'session_updated' | 'session_destroyed' | 'session_activity';
  sessionId: string;
  userId: string;
  platform: string;
  timestamp: string;
  data: any;
}

export class UnifiedSessionManager {
  private redis: Redis;
  private wsConnections: Map<string, WebSocket> = new Map();
  private sessionTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_SESSION_DB || '0'),
      keyPrefix: 'recoder:session:',
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });
  }

  /**
   * Create a new platform session
   */
  async createSession(
    userId: string,
    platform: PlatformSession['platform'],
    deviceInfo: {
      deviceId: string;
      deviceName: string;
      userAgent?: string;
      ipAddress: string;
      location?: PlatformSession['location'];
      capabilities: string[];
    }
  ): Promise<PlatformSession> {
    const sessionId = this.generateSessionId(userId, platform, deviceInfo.deviceId);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    const session: PlatformSession = {
      id: sessionId,
      userId,
      platform,
      deviceId: deviceInfo.deviceId,
      deviceName: deviceInfo.deviceName,
      userAgent: deviceInfo.userAgent,
      ipAddress: deviceInfo.ipAddress,
      location: deviceInfo.location,
      capabilities: deviceInfo.capabilities,
      lastActivity: new Date().toISOString(),
      expiresAt,
      metadata: {},
    };

    // Store session in Redis
    await this.redis.setex(
      `active:${sessionId}`,
      24 * 60 * 60, // 24 hours TTL
      JSON.stringify(session)
    );

    // Add to user's active sessions
    await this.redis.sadd(`user:${userId}:sessions`, sessionId);

    // Set session timeout
    this.setSessionTimeout(sessionId, 24 * 60 * 60 * 1000);

    // Broadcast session creation event
    await this.broadcastSessionEvent({
      type: 'session_created',
      sessionId,
      userId,
      platform,
      timestamp: new Date().toISOString(),
      data: { session },
    });

    return session;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<PlatformSession | null> {
    const sessionData = await this.redis.get(`active:${sessionId}`);
    if (!sessionData) return null;

    try {
      return JSON.parse(sessionData);
    } catch (error) {
      console.error('Failed to parse session data:', error);
      return null;
    }
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionId: string, metadata?: Record<string, any>): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;

    session.lastActivity = new Date().toISOString();
    if (metadata) {
      session.metadata = { ...session.metadata, ...metadata };
    }

    // Update Redis
    await this.redis.setex(
      `active:${sessionId}`,
      24 * 60 * 60, // Reset TTL
      JSON.stringify(session)
    );

    // Reset timeout
    this.setSessionTimeout(sessionId, 24 * 60 * 60 * 1000);

    // Broadcast activity event
    await this.broadcastSessionEvent({
      type: 'session_activity',
      sessionId,
      userId: session.userId,
      platform: session.platform,
      timestamp: new Date().toISOString(),
      data: { lastActivity: session.lastActivity, metadata },
    });
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string): Promise<PlatformSession[]> {
    const sessionIds = await this.redis.smembers(`user:${userId}:sessions`);
    const sessions: PlatformSession[] = [];

    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId);
      if (session) {
        sessions.push(session);
      } else {
        // Clean up invalid session reference
        await this.redis.srem(`user:${userId}:sessions`, sessionId);
      }
    }

    return sessions.sort((a, b) => 
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );
  }

  /**
   * Destroy a session
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;

    // Remove from Redis
    await this.redis.del(`active:${sessionId}`);
    await this.redis.srem(`user:${session.userId}:sessions`, sessionId);

    // Clear timeout
    const timeout = this.sessionTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.sessionTimeouts.delete(sessionId);
    }

    // Close WebSocket connection if exists
    const ws = this.wsConnections.get(sessionId);
    if (ws) {
      ws.close();
      this.wsConnections.delete(sessionId);
    }

    // Broadcast session destruction event
    await this.broadcastSessionEvent({
      type: 'session_destroyed',
      sessionId,
      userId: session.userId,
      platform: session.platform,
      timestamp: new Date().toISOString(),
      data: { reason: 'manual_logout' },
    });
  }

  /**
   * Destroy all sessions for a user
   */
  async destroyUserSessions(userId: string, excludeSessionId?: string): Promise<void> {
    const sessions = await this.getUserSessions(userId);
    
    for (const session of sessions) {
      if (excludeSessionId && session.id === excludeSessionId) continue;
      await this.destroySession(session.id);
    }
  }

  /**
   * Register WebSocket connection for real-time session updates
   */
  registerWebSocketConnection(sessionId: string, ws: WebSocket): void {
    this.wsConnections.set(sessionId, ws);

    ws.on('close', () => {
      this.wsConnections.delete(sessionId);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error for session', sessionId, error);
      this.wsConnections.delete(sessionId);
    });
  }

  /**
   * Broadcast session event to all relevant connections
   */
  private async broadcastSessionEvent(event: SessionSyncEvent): Promise<void> {
    // Store event in Redis for replay
    await this.redis.lpush(
      `events:${event.userId}`,
      JSON.stringify(event)
    );
    
    // Keep only last 100 events per user
    await this.redis.ltrim(`events:${event.userId}`, 0, 99);

    // Broadcast to all user's active WebSocket connections
    const userSessions = await this.getUserSessions(event.userId);
    
    for (const session of userSessions) {
      const ws = this.wsConnections.get(session.id);
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(event));
        } catch (error) {
          console.error('Failed to send WebSocket message:', error);
          this.wsConnections.delete(session.id);
        }
      }
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(userId: string, platform: string, deviceId: string): string {
    const timestamp = Date.now().toString();
    const randomBytes = Math.random().toString(36).substring(2);
    const input = `${userId}:${platform}:${deviceId}:${timestamp}:${randomBytes}`;
    
    return createHash('sha256').update(input).digest('hex').substring(0, 32);
  }

  /**
   * Set session timeout for automatic cleanup
   */
  private setSessionTimeout(sessionId: string, ttl: number): void {
    // Clear existing timeout
    const existingTimeout = this.sessionTimeouts.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(async () => {
      await this.destroySession(sessionId);
    }, ttl);

    this.sessionTimeouts.set(sessionId, timeout);
  }

  /**
   * Get session events for a user
   */
  async getSessionEvents(userId: string, limit: number = 50): Promise<SessionSyncEvent[]> {
    const events = await this.redis.lrange(`events:${userId}`, 0, limit - 1);
    return events.map(event => JSON.parse(event));
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    const now = new Date();
    
    // Get all session keys
    const sessionKeys = await this.redis.keys('active:*');
    
    for (const key of sessionKeys) {
      const sessionData = await this.redis.get(key);
      if (sessionData) {
        try {
          const session: PlatformSession = JSON.parse(sessionData);
          
          if (new Date(session.expiresAt) < now) {
            await this.destroySession(session.id);
          }
        } catch (error) {
          // Invalid session data, remove it
          await this.redis.del(key);
        }
      }
    }
  }

  /**
   * Get platform capabilities for cross-platform feature detection
   */
  getPlatformCapabilities(platform: PlatformSession['platform']): string[] {
    const capabilities: Record<string, string[]> = {
      web: [
        'project_management',
        'ai_consensus',
        'code_generation',
        'file_upload',
        'real_time_collaboration',
        'video_call',
        'screen_sharing',
        'advanced_analytics',
        'team_management',
        'integrations',
        'notifications',
        'settings_sync'
      ],
      mobile: [
        'project_management',
        'ai_consensus',
        'code_generation',
        'file_upload',
        'notifications',
        'settings_sync',
        'offline_mode',
        'camera_integration',
        'biometric_auth'
      ],
      desktop: [
        'project_management',
        'ai_consensus',
        'code_generation',
        'file_upload',
        'real_time_collaboration',
        'advanced_analytics',
        'integrations',
        'notifications',
        'settings_sync',
        'file_system_access',
        'native_notifications'
      ],
      cli: [
        'project_management',
        'ai_consensus',
        'code_generation',
        'file_upload',
        'batch_operations',
        'automation',
        'ci_cd_integration'
      ],
      vscode: [
        'project_management',
        'ai_consensus',
        'code_generation',
        'file_upload',
        'real_time_collaboration',
        'integrations',
        'editor_integration',
        'debugging',
        'git_integration'
      ],
      api: [
        'project_management',
        'ai_consensus',
        'code_generation',
        'file_upload',
        'batch_operations',
        'automation',
        'webhook_integration'
      ]
    };

    return capabilities[platform] || [];
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    await this.redis.disconnect();
  }
}

// Export singleton instance
export const sessionManager = new UnifiedSessionManager();
