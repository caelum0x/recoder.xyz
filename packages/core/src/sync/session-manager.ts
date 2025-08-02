/**
 * Session Manager for Recoder.xyz Cross-Platform Sync
 * 
 * Manages user sessions across CLI, VS Code extension, and web interface
 * Provides real-time synchronization of state, preferences, and chat history
 */

import { EventEmitter } from 'events';
import { WebSocket, WebSocketServer } from 'ws';
import Redis from 'redis';

export interface UserSession { 
  sessionId: string;
  userId: string;
  platform: 'cli' | 'vscode' | 'web' | 'api';
  deviceId: string;
  createdAt: Date;
  lastActivity: Date;
  isActive: boolean;
  metadata: {
    version: string;
    os: string;
    clientInfo: string;
    ipAddress?: string;
    userAgent?: string;
  };
  state: SessionState;
}

export interface SessionState {
  lastActivity: any;
  currentProject?: {
    path: string;
    name: string;
    type: string;
    lastModified: Date;
  };
  chatHistory: ChatMessage[];
  preferences: UserPreferences;
  activeFiles: string[];
  workspaceState: Record<string, any>;
  aiProviderSettings: {
    preferredProvider: string;
    fallbackProviders: string[];
    customSettings: Record<string, any>;
  };
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  timestamp: Date;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: {
    provider?: string;
    model?: string;
    tokens?: number;
    cost?: number;
    responseTime?: number;
  };
  files?: string[];
  codeBlocks?: CodeBlock[];
}

export interface CodeBlock {
  id: string;
  language: string;
  code: string;
  fileName?: string;
  startLine?: number;
  endLine?: number;
}

export interface UserPreferences {
  theme: 'dark' | 'light' | 'auto';
  language: string;
  defaultAIProvider: string;
  codeGeneration: {
    includeComments: boolean;
    includeTests: boolean;
    strictTypes: boolean;
    preferredFrameworks: string[];
  };
  sync: {
    enabled: boolean;
    autoSync: boolean;
    syncChatHistory: boolean;
    syncPreferences: boolean;
    syncWorkspace: boolean;
  };
  privacy: {
    allowTelemetry: boolean;
    shareUsageData: boolean;
    localOnly: boolean;
  };
}

export interface SyncEvent {
  type: 'session-created' | 'session-updated' | 'session-deleted' | 'state-changed' | 'message-added' | 'conflict-detected';
  sessionId: string;
  userId: string;
  timestamp: Date;
  data: any;
  source: {
    platform: string;
    deviceId: string;
  };
}

export interface ConflictResolution {
  conflictId: string;
  type: 'merge' | 'overwrite' | 'manual';
  strategy: 'latest-wins' | 'user-choice' | 'auto-merge';
  resolvedData: any;
  timestamp: Date;
}

export class SessionManager extends EventEmitter {
  private static instance: SessionManager;
  private sessions: Map<string, UserSession> = new Map();
  private userSessions: Map<string, Set<string>> = new Map(); // userId -> sessionIds
  private wsConnections: Map<string, WebSocket> = new Map();
  private redis: Redis.RedisClientType;
  private wsServer?: WebSocketServer;
  private heartbeatInterval: NodeJS.Timeout;
  private cleanupInterval: NodeJS.Timeout;

  private constructor(redisUrl?: string) {
    super();
    this.redis = Redis.createClient({ url: redisUrl || process.env.REDIS_URL });
    this.initializeRedis();
    this.startHeartbeat();
    this.startCleanup();
  }

  static getInstance(redisUrl?: string): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager(redisUrl);
    }
    return SessionManager.instance;
  }

  /**
   * Initialize WebSocket server for real-time sync
   */
  initializeWebSocketServer(port: number = 8080): void {
    this.wsServer = new WebSocketServer({ port });
    
    this.wsServer.on('connection', (ws, request) => {
      const sessionId = this.extractSessionId(request.url);
      if (!sessionId) {
        ws.close(1008, 'Invalid session ID');
        return;
      }

      this.wsConnections.set(sessionId, ws);

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleWebSocketMessage(sessionId, message);
        } catch (error) {
          console.error('WebSocket message error:', error);
          ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
      });

      ws.on('close', () => {
        this.wsConnections.delete(sessionId);
        this.updateSessionActivity(sessionId, false);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.wsConnections.delete(sessionId);
      });

      // Send initial session state
      this.sendSessionState(sessionId);
    });

    console.log(`WebSocket server started on port ${port}`);
  }

  /**
   * Create a new user session
   */
  async createSession(userId: string, platform: UserSession['platform'], deviceId: string, metadata: UserSession['metadata']): Promise<UserSession> {
    const sessionId = this.generateSessionId(userId, deviceId);
    
    // Load existing user preferences from cache
    const existingPreferences = await this.loadUserPreferences(userId);
    
    const session: UserSession = {
      sessionId,
      userId,
      platform,
      deviceId,
      createdAt: new Date(),
      lastActivity: new Date(),
      isActive: true,
      metadata,
      state: {
        chatHistory: [],
        preferences: existingPreferences || this.getDefaultPreferences(),
        activeFiles: [],
        workspaceState: {},
        aiProviderSettings: {
          preferredProvider: 'claude',
          fallbackProviders: ['groq', 'gemini'],
          customSettings: {}
        },
        lastActivity: undefined
      }
    };

    // Store session locally and in Redis
    this.sessions.set(sessionId, session);
    await this.persistSession(session);

    // Track user sessions
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId)!.add(sessionId);

    // Sync with other user sessions
    await this.syncSessionAcrossDevices(userId, sessionId);

    this.emit('session-created', { sessionId, userId, platform });
    
    return session;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<UserSession | null> {
    // Try local cache first
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }

    // Try Redis cache
    const cached = await this.redis.get(`session:${sessionId}`);
    if (cached) {
      const session = JSON.parse(cached) as UserSession;
      this.sessions.set(sessionId, session);
      return session;
    }

    return null;
  }

  /**
   * Update session state
   */
  async updateSessionState(sessionId: string, stateUpdate: Partial<SessionState>): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Create sync event before updating
    const syncEvent: SyncEvent = {
      type: 'state-changed',
      sessionId,
      userId: session.userId,
      timestamp: new Date(),
      data: stateUpdate,
      source: {
        platform: session.platform,
        deviceId: session.deviceId
      }
    };

    // Update session state
    session.state = { ...session.state, ...stateUpdate };
    session.lastActivity = new Date();

    // Persist changes
    this.sessions.set(sessionId, session);
    await this.persistSession(session);

    // Broadcast to other sessions
    await this.broadcastSyncEvent(session.userId, syncEvent);

    this.emit('session-updated', { sessionId, userId: session.userId, stateUpdate });
  }

  /**
   * Add message to chat history
   */
  async addChatMessage(sessionId: string, message: Omit<ChatMessage, 'id' | 'sessionId'>): Promise<ChatMessage> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const chatMessage: ChatMessage = {
      id: this.generateMessageId(),
      sessionId,
      ...message
    };

    // Add to session state
    session.state.chatHistory.push(chatMessage);
    session.lastActivity = new Date();

    // Persist changes
    this.sessions.set(sessionId, session);
    await this.persistSession(session);
    await this.persistChatMessage(chatMessage);

    // Create sync event
    const syncEvent: SyncEvent = {
      type: 'message-added',
      sessionId,
      userId: session.userId,
      timestamp: new Date(),
      data: chatMessage,
      source: {
        platform: session.platform,
        deviceId: session.deviceId
      }
    };

    // Broadcast to other sessions
    await this.broadcastSyncEvent(session.userId, syncEvent);

    this.emit('message-added', { sessionId, message: chatMessage });

    return chatMessage;
  }

  /**
   * Get user's active sessions across all platforms
   */
  async getUserSessions(userId: string): Promise<UserSession[]> {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) {
      return [];
    }

    const sessions: UserSession[] = [];
    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId);
      if (session && session.isActive) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Sync session data across all user's devices
   */
  private async syncSessionAcrossDevices(userId: string, sourceSessionId: string): Promise<void> {
    const userSessions = await this.getUserSessions(userId);
    const sourceSession = await this.getSession(sourceSessionId);
    
    if (!sourceSession) return;

    // Find the most recent session to sync from
    const mostRecentSession = userSessions
      .filter(s => s.sessionId !== sourceSessionId)
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())[0];

    if (!mostRecentSession) return;

    // Merge state intelligently
    const mergedState = await this.mergeSessionStates(sourceSession.state, mostRecentSession.state);
    
    // Apply conflict resolution if needed
    if (this.hasConflicts(sourceSession.state, mostRecentSession.state)) {
      const resolution = await this.resolveStateConflicts(sourceSession.state, mostRecentSession.state);
      Object.assign(mergedState, resolution.resolvedData);
    }

    // Update source session with merged state
    await this.updateSessionState(sourceSessionId, mergedState);
  }

  /**
   * Merge two session states intelligently
   */
  private async mergeSessionStates(state1: SessionState, state2: SessionState): Promise<Partial<SessionState>> {
    const merged: Partial<SessionState> = {};

    // Merge chat history (combine and deduplicate)
    const allMessages = [...state1.chatHistory, ...state2.chatHistory];
    const uniqueMessages = allMessages.filter((msg, index, arr) => 
      arr.findIndex(m => m.id === msg.id) === index
    );
    merged.chatHistory = uniqueMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Merge preferences (use most recent)
    merged.preferences = state1.lastActivity > state2.lastActivity ? state1.preferences : state2.preferences;

    // Merge active files (union)
    merged.activeFiles = [...new Set([...state1.activeFiles, ...state2.activeFiles])];

    // Merge workspace state (deep merge)
    merged.workspaceState = { ...state2.workspaceState, ...state1.workspaceState };

    // Merge AI provider settings (prefer most recent)
    merged.aiProviderSettings = state1.lastActivity > state2.lastActivity ? 
      state1.aiProviderSettings : state2.aiProviderSettings;

    return merged;
  }

  /**
   * Check if there are conflicts between session states
   */
  private hasConflicts(state1: SessionState, state2: SessionState): boolean {
    // Check for preference conflicts
    if (JSON.stringify(state1.preferences) !== JSON.stringify(state2.preferences)) {
      return true;
    }

    // Check for workspace conflicts
    for (const key in state1.workspaceState) {
      if (state2.workspaceState[key] && 
          JSON.stringify(state1.workspaceState[key]) !== JSON.stringify(state2.workspaceState[key])) {
        return true;
      }
    }

    return false;
  }

  /**
   * Resolve conflicts between session states
   */
  private async resolveStateConflicts(state1: SessionState, state2: SessionState): Promise<ConflictResolution> {
    const conflictId = this.generateConflictId();
    
    // Default strategy: latest wins
    const resolvedData: Partial<SessionState> = {};
    
    // For preferences, use the most recently modified
    resolvedData.preferences = state1.lastActivity > state2.lastActivity ? state1.preferences : state2.preferences;
    
    // For workspace state, merge intelligently
    resolvedData.workspaceState = { ...state2.workspaceState, ...state1.workspaceState };

    const resolution: ConflictResolution = {
      conflictId,
      type: 'merge',
      strategy: 'latest-wins',
      resolvedData,
      timestamp: new Date()
    };

    // Store conflict resolution for audit
    await this.redis.set(`conflict:${conflictId}`, JSON.stringify(resolution), { EX: 7 * 24 * 60 * 60 }); // 7 days

    return resolution;
  }

  /**
   * Broadcast sync event to all user sessions
   */
  private async broadcastSyncEvent(userId: string, event: SyncEvent): Promise<void> {
    const userSessions = await this.getUserSessions(userId);
    
    for (const session of userSessions) {
      // Skip the source session
      if (session.sessionId === event.sessionId) continue;

      // Send via WebSocket if connected
      const ws = this.wsConnections.get(session.sessionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'sync-event', event }));
      }

      // Also store in Redis for offline sync
      await this.redis.lPush(`sync:${session.sessionId}`, JSON.stringify(event));
      await this.redis.expire(`sync:${session.sessionId}`, 24 * 60 * 60); // 24 hours
    }
  }

  /**
   * Handle WebSocket messages
   */
  private async handleWebSocketMessage(sessionId: string, message: any): Promise<void> {
    switch (message.type) {
      case 'ping':
        const ws = this.wsConnections.get(sessionId);
        if (ws) {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
        break;

      case 'sync-request':
        await this.sendSessionState(sessionId);
        break;

      case 'state-update':
        await this.updateSessionState(sessionId, message.data);
        break;

      case 'chat-message':
        await this.addChatMessage(sessionId, message.data);
        break;

      default:
        console.warn('Unknown WebSocket message type:', message.type);
    }
  }

  /**
   * Send current session state via WebSocket
   */
  private async sendSessionState(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    const ws = this.wsConnections.get(sessionId);
    
    if (session && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'session-state',
        data: session.state,
        timestamp: Date.now()
      }));
    }
  }

  /**
   * Initialize Redis connection
   */
  private async initializeRedis(): Promise<void> {
    try {
      await this.redis.connect();
      console.log('Redis connected successfully');
    } catch (error) {
      console.error('Redis connection failed:', error);
    }
  }

  /**
   * Persist session to Redis
   */
  private async persistSession(session: UserSession): Promise<void> {
    try {
      await this.redis.set(`session:${session.sessionId}`, JSON.stringify(session), {
        EX: 30 * 24 * 60 * 60 // 30 days
      });
      
      // Also add to user's session list
      await this.redis.sAdd(`user_sessions:${session.userId}`, session.sessionId);
    } catch (error) {
      console.error('Failed to persist session:', error);
    }
  }

  /**
   * Persist chat message to Redis
   */
  private async persistChatMessage(message: ChatMessage): Promise<void> {
    try {
      await this.redis.lPush(`chat:${message.sessionId}`, JSON.stringify(message));
      await this.redis.expire(`chat:${message.sessionId}`, 90 * 24 * 60 * 60); // 90 days
    } catch (error) {
      console.error('Failed to persist chat message:', error);
    }
  }

  /**
   * Load user preferences from cache
   */
  private async loadUserPreferences(userId: string): Promise<UserPreferences | null> {
    try {
      const cached = await this.redis.get(`preferences:${userId}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Failed to load user preferences:', error);
      return null;
    }
  }

  /**
   * Update session activity status
   */
  private async updateSessionActivity(sessionId: string, isActive: boolean): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      session.isActive = isActive;
      session.lastActivity = new Date();
      await this.persistSession(session);
    }
  }

  /**
   * Start heartbeat to keep sessions alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      for (const [sessionId, ws] of this.wsConnections) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
          await this.updateSessionActivity(sessionId, true);
        } else {
          this.wsConnections.delete(sessionId);
          await this.updateSessionActivity(sessionId, false);
        }
      }
    }, 30000); // 30 seconds
  }

  /**
   * Start cleanup of inactive sessions
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(async () => {
      const now = Date.now();
      const inactiveThreshold = 24 * 60 * 60 * 1000; // 24 hours

      for (const [sessionId, session] of this.sessions) {
        if (now - session.lastActivity.getTime() > inactiveThreshold) {
          await this.deactivateSession(sessionId);
        }
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Deactivate inactive session
   */
  private async deactivateSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isActive = false;
      await this.persistSession(session);
      this.sessions.delete(sessionId);
      
      const ws = this.wsConnections.get(sessionId);
      if (ws) {
        ws.close();
        this.wsConnections.delete(sessionId);
      }

      this.emit('session-deactivated', { sessionId, userId: session.userId });
    }
  }

  /**
   * Get default user preferences
   */
  private getDefaultPreferences(): UserPreferences {
    return {
      theme: 'dark',
      language: 'en',
      defaultAIProvider: 'claude',
      codeGeneration: {
        includeComments: true,
        includeTests: false,
        strictTypes: true,
        preferredFrameworks: ['react', 'express']
      },
      sync: {
        enabled: true,
        autoSync: true,
        syncChatHistory: true,
        syncPreferences: true,
        syncWorkspace: true
      },
      privacy: {
        allowTelemetry: true,
        shareUsageData: false,
        localOnly: false
      }
    };
  }

  // Utility methods
  private generateSessionId(userId: string, deviceId: string): string {
    return `session-${userId}-${deviceId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateConflictId(): string {
    return `conflict-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractSessionId(url?: string): string | null {
    if (!url) return null;
    const match = url.match(/sessionId=([^&]+)/);
    return match ? match[1] : null;
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    clearInterval(this.heartbeatInterval);
    clearInterval(this.cleanupInterval);
    
    if (this.wsServer) {
      this.wsServer.close();
    }
    
    for (const ws of this.wsConnections.values()) {
      ws.close();
    }
    
    await this.redis.quit();
  }
}

export default SessionManager;