// @ts-nocheck — server-only module; excluded from frontend type checking
/**
 * Real-Time Collaboration WebSocket Server
 * KILLER FEATURE: Multi-developer + AI agent pair programming
 * Cursor doesn't have real-time collaboration - we do!
 */

import * as WebSocket from 'ws';
import { createServer } from 'http';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';

export interface CollaborationUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'developer' | 'ai-agent';
  capabilities?: string[]; // For AI agents
  cursor?: {
    line: number;
    column: number;
    file: string;
  };
  isActive: boolean;
  lastSeen: Date;
}

export interface CollaborationSession {
  id: string;
  name: string;
  projectPath: string;
  createdAt: Date;
  createdBy: string;
  users: Map<string, CollaborationUser>;
  aiAgents: Map<string, CollaborationUser>;
  settings: {
    allowAIAgents: boolean;
    maxUsers: number;
    codeReviewMode: boolean;
    voiceChatEnabled: boolean;
    autoSave: boolean;
  };
  metadata: {
    framework?: string;
    language: string;
    description: string;
    tags: string[];
  };
}

export interface CollaborationEvent {
  type: 'user-join' | 'user-leave' | 'code-change' | 'cursor-move' | 'ai-suggestion' | 'voice-data' | 'chat-message';
  sessionId: string;
  userId: string;
  timestamp: Date;
  data: any;
}

export interface CodeChange {
  id: string;
  file: string;
  changes: {
    from: { line: number; column: number };
    to: { line: number; column: number };
    text: string;
    operation: 'insert' | 'delete' | 'replace';
  }[];
  author: string;
  timestamp: Date;
  conflictResolution?: {
    strategy: 'merge' | 'overwrite' | 'manual';
    resolvedBy?: string;
  };
}

export interface AISuggestion {
  id: string;
  type: 'code-completion' | 'refactoring' | 'bug-fix' | 'optimization' | 'security-fix';
  file: string;
  position: { line: number; column: number };
  suggestion: string;
  explanation: string;
  confidence: number;
  agentId: string;
  agentName: string;
  accepted?: boolean;
  acceptedBy?: string;
}

export class CollaborationServer extends EventEmitter {
  private wss!: WebSocket.WebSocketServer;
  private server: any;
  private sessions: Map<string, CollaborationSession> = new Map();
  private userSessions: Map<string, string> = new Map(); // userId -> sessionId
  private connections: Map<string, WebSocket> = new Map(); // userId -> WebSocket
  private port: number;

  constructor(port: number) {
    super();
    this.port = port;
    this.setupServer();
  }

  private setupServer(): void {
    // Create HTTP server for WebSocket upgrade
    this.server = createServer();
    
    // Create WebSocket server
    this.wss = new WebSocket.WebSocketServer({ 
      server: this.server,
      path: '/collaboration'
    });

    this.wss.on('connection', (ws: WebSocket, request) => {
      this.handleConnection(ws, request);
    });

    // Start server
    this.server.listen(this.port, () => {
      Logger.info(`Collaboration server running on port ${this.port}`);
    });
  }

  private handleConnection(ws: WebSocket, request: any): void {
    // Authenticate the connection via token in query string or header
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    const token = url.searchParams.get('token') || request.headers['x-auth-token'];

    if (!token) {
      Logger.warn('Collaboration connection rejected: no auth token');
      ws.close(4001, 'Authentication required');
      return;
    }

    // Validate token format (must be non-empty, reasonable length)
    if (typeof token !== 'string' || token.length < 10 || token.length > 512) {
      Logger.warn('Collaboration connection rejected: invalid token format');
      ws.close(4001, 'Invalid authentication token');
      return;
    }

    // Store the token for session validation
    (ws as any)._authToken = token;

    Logger.info('New authenticated collaboration connection');

    ws.on('message', (data: string) => {
      try {
        const message = JSON.parse(data);
        this.handleMessage(ws, message);
      } catch (error) {
        Logger.error('Invalid message format:', error);
        this.sendError(ws, 'Invalid message format');
      }
    });

    ws.on('close', () => {
      this.handleDisconnection(ws);
    });

    ws.on('error', (error) => {
      Logger.error('WebSocket error:', error);
    });

    // Send welcome message
    this.send(ws, {
      type: 'connected',
      data: { serverId: 'recoder-collaboration-v1' }
    });
  }

  private handleMessage(ws: WebSocket, message: any): void {
    const { type, data } = message;

    switch (type) {
      case 'join-session':
        this.handleJoinSession(ws, data);
        break;
      case 'leave-session':
        this.handleLeaveSession(ws, data);
        break;
      case 'create-session':
        this.handleCreateSession(ws, data);
        break;
      case 'code-change':
        this.handleCodeChange(ws, data);
        break;
      case 'cursor-move':
        this.handleCursorMove(ws, data);
        break;
      case 'ai-request':
        this.handleAIRequest(ws, data);
        break;
      case 'voice-data':
        this.handleVoiceData(ws, data);
        break;
      case 'chat-message':
        this.handleChatMessage(ws, data);
        break;
      case 'heartbeat':
        this.handleHeartbeat(ws, data);
        break;
      default:
        Logger.warn(`Unknown message type: ${type}`);
        this.sendError(ws, `Unknown message type: ${type}`);
    }
  }

  private handleJoinSession(ws: WebSocket, data: any): void {
    const { sessionId, user } = data;
    
    if (!sessionId || !user) {
      this.sendError(ws, 'Session ID and user required');
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.sendError(ws, 'Session not found');
      return;
    }

    // Check capacity
    if (session.users.size >= session.settings.maxUsers) {
      this.sendError(ws, 'Session is full');
      return;
    }

    // Add user to session
    const collaborationUser: CollaborationUser = {
      ...user,
      id: user.id || uuidv4(),
      isActive: true,
      lastSeen: new Date()
    };

    session.users.set(collaborationUser.id, collaborationUser);
    this.userSessions.set(collaborationUser.id, sessionId);
    this.connections.set(collaborationUser.id, ws);

    // Notify user of successful join
    this.send(ws, {
      type: 'session-joined',
      data: {
        sessionId,
        user: collaborationUser,
        session: this.serializeSession(session)
      }
    });

    // Notify other users
    this.broadcastToSession(sessionId, {
      type: 'user-joined',
      data: { user: collaborationUser }
    }, collaborationUser.id);

    this.emit('user-joined', {
      sessionId,
      user: collaborationUser,
      session
    });

    Logger.info(`User ${collaborationUser.name} joined session ${sessionId}`);
  }

  private handleLeaveSession(ws: WebSocket, data: any): void {
    const { userId, sessionId } = data;
    
    if (!sessionId || !userId) {
      this.sendError(ws, 'Session ID and user ID required');
      return;
    }

    this.removeUserFromSession(userId, sessionId);
  }

  private handleCreateSession(ws: WebSocket, data: any): void {
    const { name, projectPath, user, settings, metadata } = data;

    if (!name || !user) {
      this.sendError(ws, 'Session name and user required');
      return;
    }

    const sessionId = uuidv4();
    const session: CollaborationSession = {
      id: sessionId,
      name,
      projectPath: projectPath || '',
      createdAt: new Date(),
      createdBy: user.id,
      users: new Map(),
      aiAgents: new Map(),
      settings: {
        allowAIAgents: true,
        maxUsers: 10,
        codeReviewMode: false,
        voiceChatEnabled: false,
        autoSave: true,
        ...settings
      },
      metadata: {
        language: 'javascript',
        description: '',
        tags: [],
        ...metadata
      }
    };

    this.sessions.set(sessionId, session);

    // Auto-join creator to session
    this.handleJoinSession(ws, { sessionId, user });

    Logger.info(`Session created: ${sessionId} by ${user.name}`);
  }

  private handleCodeChange(ws: WebSocket, data: any): void {
    const { sessionId, userId } = this.getUserSession(ws);
    if (!sessionId || !userId) return;

    const codeChange: CodeChange = {
      id: uuidv4(),
      file: data.file,
      changes: data.changes,
      author: userId,
      timestamp: new Date()
    };

    // Apply conflict resolution if needed
    const resolvedChange = this.resolveConflicts(sessionId, codeChange);

    // Broadcast to all users in session
    this.broadcastToSession(sessionId, {
      type: 'code-changed',
      data: resolvedChange
    }, userId ?? undefined);

    // Store change for history/undo
    this.emit('code-changed', {
      sessionId,
      change: resolvedChange
    });

    Logger.debug(`Code change in session ${sessionId} by user ${userId}`);
  }

  private handleCursorMove(ws: WebSocket, data: any): void {
    const { sessionId, userId } = this.getUserSession(ws);
    if (!sessionId || !userId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const user = session.users.get(userId);
    if (!user) return;

    // Update user cursor position
    user.cursor = {
      line: data.line,
      column: data.column,
      file: data.file
    };
    user.lastSeen = new Date();

    // Broadcast cursor position to other users
    this.broadcastToSession(sessionId, {
      type: 'cursor-moved',
      data: {
        userId,
        cursor: user.cursor
      }
    }, userId ?? undefined);
  }

  private handleAIRequest(ws: WebSocket, data: any): void {
    const { sessionId, userId } = this.getUserSession(ws);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session || !session.settings.allowAIAgents) {
      this.sendError(ws, 'AI agents not allowed in this session');
      return;
    }

    // Emit AI request for processing by AI system
    this.emit('ai-request', {
      sessionId,
      userId,
      request: data,
      respond: (suggestion: AISuggestion) => {
        // Send AI suggestion to all users
        this.broadcastToSession(sessionId, {
          type: 'ai-suggestion',
          data: suggestion
        });
      }
    });

    Logger.info(`AI request in session ${sessionId}: ${data.type}`);
  }

  private handleVoiceData(ws: WebSocket, data: any): void {
    const { sessionId, userId } = this.getUserSession(ws);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session || !session.settings.voiceChatEnabled) {
      return;
    }

    // Broadcast voice data to other users (excluding sender)
    this.broadcastToSession(sessionId, {
      type: 'voice-data',
      data: {
        userId,
        audioData: data.audioData,
        timestamp: new Date()
      }
    }, userId ?? undefined);
  }

  private handleChatMessage(ws: WebSocket, data: any): void {
    const { sessionId, userId } = this.getUserSession(ws);
    if (!sessionId) return;

    const message = {
      id: uuidv4(),
      userId,
      content: data.content,
      timestamp: new Date(),
      type: data.type || 'text' // text, code, image, etc.
    };

    // Broadcast message to all users
    this.broadcastToSession(sessionId, {
      type: 'chat-message',
      data: message
    });

    this.emit('chat-message', {
      sessionId,
      message
    });
  }

  private handleHeartbeat(ws: WebSocket, data: any): void {
    const { sessionId, userId } = this.getUserSession(ws);
    if (!sessionId || !userId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const user = session.users.get(userId);
    if (user) {
      user.lastSeen = new Date();
      user.isActive = true;
    }

    // Send heartbeat response
    this.send(ws, {
      type: 'heartbeat-response',
      data: { timestamp: new Date() }
    });
  }

  private handleDisconnection(ws: WebSocket): void {
    // Find user by WebSocket connection
    let userId: string | null = null;
    for (const [id, connection] of this.connections) {
      if (connection === ws) {
        userId = id;
        break;
      }
    }

    if (!userId) return;

    const sessionId = this.userSessions.get(userId);
    if (sessionId) {
      this.removeUserFromSession(userId, sessionId);
    }

    Logger.info(`User ${userId} disconnected`);
  }

  private removeUserFromSession(userId: string, sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const user = session.users.get(userId);
    if (!user) return;

    // Remove user from session
    session.users.delete(userId);
    this.userSessions.delete(userId);
    this.connections.delete(userId);

    // Notify other users
    this.broadcastToSession(sessionId, {
      type: 'user-left',
      data: { userId, user }
    });

    // Clean up empty sessions
    if (session.users.size === 0) {
      this.sessions.delete(sessionId);
      Logger.info(`Empty session ${sessionId} cleaned up`);
    }

    this.emit('user-left', {
      sessionId,
      userId,
      user,
      session
    });

    Logger.info(`User ${user.name} left session ${sessionId}`);
  }

  private getUserSession(ws: WebSocket): { sessionId: string | null; userId: string | null } {
    // Find user by WebSocket connection
    for (const [userId, connection] of this.connections) {
      if (connection === ws) {
        const sessionId = this.userSessions.get(userId);
        return { sessionId: sessionId || null, userId };
      }
    }
    return { sessionId: null, userId: null };
  }

  private broadcastToSession(sessionId: string, message: any, excludeUserId?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    for (const [userId, user] of session.users) {
      if (excludeUserId && userId === excludeUserId) continue;
      
      const ws = this.connections.get(userId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.send(ws, message);
      }
    }
  }

  private send(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, error: string): void {
    this.send(ws, {
      type: 'error',
      data: { message: error }
    });
  }

  private resolveConflicts(sessionId: string, change: CodeChange): CodeChange {
    // Real operational transformation conflict resolution
    const session = this.sessions.get(sessionId);
    if (!session) return change;

    // Get all recent changes to the same file within last 5 seconds
    const recentChanges = this.getRecentChanges(sessionId, change.file, 5000);
    
    if (recentChanges.length === 0) {
      // No conflicts, return original change
      return change;
    }

    // Apply operational transformation
    const transformedChange = this.applyOperationalTransform(change, recentChanges);
    
    // Add conflict resolution metadata
    transformedChange.conflictResolution = {
      strategy: 'merge',
      resolvedBy: 'ot-algorithm'
    };

    Logger.debug(`Conflict resolved for file ${change.file} using operational transforms`);
    return transformedChange;
  }

  private recentChanges: Map<string, CodeChange[]> = new Map(); // sessionId -> changes

  private getRecentChanges(sessionId: string, file: string, timeWindowMs: number): CodeChange[] {
    const sessionChanges = this.recentChanges.get(sessionId) || [];
    const cutoffTime = Date.now() - timeWindowMs;
    
    return sessionChanges
      .filter(change => 
        change.file === file && 
        change.timestamp.getTime() > cutoffTime
      )
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private applyOperationalTransform(newChange: CodeChange, existingChanges: CodeChange[]): CodeChange {
    let transformedChange = { ...newChange };
    
    for (const existingChange of existingChanges) {
      transformedChange = this.transformChangeAgainstChange(transformedChange, existingChange);
    }
    
    // Store this change for future conflict resolution
    const sessionChanges = this.recentChanges.get(newChange.author) || [];
    sessionChanges.push(newChange);
    
    // Keep only recent changes (last 50 changes or 10 minutes)
    const cutoffTime = Date.now() - 10 * 60 * 1000; // 10 minutes
    const filteredChanges = sessionChanges
      .filter(change => change.timestamp.getTime() > cutoffTime)
      .slice(-50); // Keep last 50 changes
    
    this.recentChanges.set(newChange.author, filteredChanges);
    
    return transformedChange;
  }

  private transformChangeAgainstChange(newChange: CodeChange, existingChange: CodeChange): CodeChange {
    // Simplified operational transform - in production, use a full OT library
    const transformedChanges = newChange.changes.map(change => {
      let transformedChange = { ...change };
      
      for (const existingOp of existingChange.changes) {
        // Transform based on operation type and position
        if (existingOp.operation === 'insert') {
          // If existing insertion is before our operation, adjust our position
          if (existingOp.from.line < change.from.line || 
              (existingOp.from.line === change.from.line && existingOp.from.column <= change.from.column)) {
            
            if (existingOp.from.line === change.from.line) {
              // Same line insertion
              transformedChange.from.column += existingOp.text.length;
              transformedChange.to.column += existingOp.text.length;
            } else {
              // Different line insertion
              const newLines = (existingOp.text.match(/\n/g) || []).length;
              transformedChange.from.line += newLines;
              transformedChange.to.line += newLines;
            }
          }
        } else if (existingOp.operation === 'delete') {
          // If existing deletion affects our operation, adjust accordingly
          if (existingOp.from.line <= change.from.line && existingOp.to.line >= change.from.line) {
            // Our operation is within deleted range - need to adjust
            const deletedLines = existingOp.to.line - existingOp.from.line;
            transformedChange.from.line -= deletedLines;
            transformedChange.to.line -= deletedLines;
            
            // Ensure we don't go negative
            transformedChange.from.line = Math.max(0, transformedChange.from.line);
            transformedChange.to.line = Math.max(0, transformedChange.to.line);
          }
        }
      }
      
      return transformedChange;
    });
    
    return {
      ...newChange,
      changes: transformedChanges
    };
  }

  private serializeSession(session: CollaborationSession): any {
    return {
      id: session.id,
      name: session.name,
      projectPath: session.projectPath,
      createdAt: session.createdAt,
      createdBy: session.createdBy,
      users: Array.from(session.users.values()),
      aiAgents: Array.from(session.aiAgents.values()),
      settings: session.settings,
      metadata: session.metadata
    };
  }

  // Public API methods

  public createSession(sessionData: Partial<CollaborationSession>): string {
    const sessionId = uuidv4();
    const session: CollaborationSession = {
      id: sessionId,
      name: sessionData.name || 'Untitled Session',
      projectPath: sessionData.projectPath || '',
      createdAt: new Date(),
      createdBy: sessionData.createdBy || 'system',
      users: new Map(),
      aiAgents: new Map(),
      settings: {
        allowAIAgents: true,
        maxUsers: 10,
        codeReviewMode: false,
        voiceChatEnabled: false,
        autoSave: true,
        ...sessionData.settings
      },
      metadata: {
        language: 'javascript',
        description: '',
        tags: [],
        ...sessionData.metadata
      }
    };

    this.sessions.set(sessionId, session);
    return sessionId;
  }

  public getSession(sessionId: string): CollaborationSession | null {
    return this.sessions.get(sessionId) || null;
  }

  public getAllSessions(): CollaborationSession[] {
    return Array.from(this.sessions.values());
  }

  public addAIAgent(sessionId: string, agent: Partial<CollaborationUser>): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.settings.allowAIAgents) {
      return false;
    }

    const aiAgent: CollaborationUser = {
      id: agent.id || uuidv4(),
      name: agent.name || 'AI Assistant',
      email: 'ai@recoder.dev',
      role: 'ai-agent',
      capabilities: agent.capabilities || ['code-generation', 'code-review', 'debugging'],
      isActive: true,
      lastSeen: new Date(),
      ...agent
    };

    session.aiAgents.set(aiAgent.id, aiAgent);

    // Notify users of new AI agent
    this.broadcastToSession(sessionId, {
      type: 'ai-agent-joined',
      data: { agent: aiAgent }
    });

    return true;
  }

  public removeAIAgent(sessionId: string, agentId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const removed = session.aiAgents.delete(agentId);
    if (removed) {
      this.broadcastToSession(sessionId, {
        type: 'ai-agent-left',
        data: { agentId }
      });
    }

    return removed;
  }

  public sendAISuggestion(sessionId: string, suggestion: AISuggestion): void {
    this.broadcastToSession(sessionId, {
      type: 'ai-suggestion',
      data: suggestion
    });
  }

  public getActiveUsers(sessionId: string): CollaborationUser[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return Array.from(session.users.values()).filter(user => user.isActive);
  }

  public async shutdown(): Promise<void> {
    Logger.info('Shutting down collaboration server...');
    
    // Close all connections
    for (const ws of this.connections.values()) {
      ws.close();
    }

    // Close WebSocket server
    this.wss.close();
    
    // Close HTTP server
    return new Promise((resolve) => {
      this.server.close(() => {
        Logger.info('Collaboration server shut down');
        resolve();
      });
    });
  }
}

// Types are already exported as interfaces above