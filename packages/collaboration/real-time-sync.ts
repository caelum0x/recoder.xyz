/**
 * Real-Time Synchronization System for Craft Code
 * Enables live coding sessions, collaborative editing, and real-time project sharing
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export class RealTimeSyncManager extends EventEmitter {
  private server?: WebSocketServer;
  private sessions: Map<string, CollaborationSession> = new Map();
  private userConnections: Map<string, UserConnection> = new Map();
  private documentProviders: Map<string, Y.Doc> = new Map();
  private conflictResolver: ConflictResolver;
  private permissions: PermissionManager;

  constructor(private config: RealTimeSyncConfig) {
    super();
    this.conflictResolver = new ConflictResolver();
    this.permissions = new PermissionManager();
    this.setupServer();
  }

  /**
   * Create a new collaboration session
   */
  async createSession(options: CreateSessionOptions): Promise<CollaborationSession> {
    const sessionId = this.generateSessionId();
    const session: CollaborationSession = {
      id: sessionId,
      name: options.name,
      description: options.description,
      ownerId: options.ownerId,
      projectId: options.projectId,
      participants: new Map(),
      documents: new Map(),
      settings: {
        maxParticipants: options.maxParticipants || 10,
        allowAnonymous: options.allowAnonymous || false,
        readOnly: options.readOnly || false,
        requireInvite: options.requireInvite || true,
        autoSave: options.autoSave !== false,
        conflictResolution: options.conflictResolution || 'operational-transform'
      },
      status: 'active',
      createdAt: new Date(),
      lastActivity: new Date()
    };

    // Initialize Yjs document for the session
    const yDoc = new Y.Doc();
    this.documentProviders.set(sessionId, yDoc);

    // Set up document persistence
    if (session.settings.autoSave) {
      this.setupDocumentPersistence(sessionId, yDoc);
    }

    this.sessions.set(sessionId, session);
    this.emit('sessionCreated', session);

    return session;
  }

  /**
   * Join an existing collaboration session
   */
  async joinSession(sessionId: string, user: SessionUser, options: JoinOptions = {}): Promise<SessionJoinResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Check permissions
    const canJoin = await this.permissions.canJoinSession(user, session);
    if (!canJoin.allowed) {
      throw new Error(`Permission denied: ${canJoin.reason}`);
    }

    // Check capacity
    if (session.participants.size >= session.settings.maxParticipants) {
      throw new Error('Session is at maximum capacity');
    }

    // Add participant
    const participant: SessionParticipant = {
      user,
      joinedAt: new Date(),
      role: this.determineUserRole(user, session),
      permissions: await this.permissions.getUserPermissions(user, session),
      cursor: null,
      status: 'active',
      lastActivity: new Date()
    };

    session.participants.set(user.id, participant);
    session.lastActivity = new Date();

    // Broadcast user joined event
    this.broadcastToSession(sessionId, {
      type: 'user-joined',
      user: user,
      participant: participant,
      timestamp: new Date()
    });

    this.emit('userJoined', { sessionId, user, participant });

    return {
      success: true,
      session,
      participant,
      documents: Array.from(session.documents.keys())
    };
  }

  /**
   * Leave a collaboration session
   */
  async leaveSession(sessionId: string, userId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.get(userId);
    if (!participant) return;

    // Remove participant
    session.participants.delete(userId);
    session.lastActivity = new Date();

    // Clean up user connection
    const connection = this.userConnections.get(userId);
    if (connection) {
      connection.ws.close();
      this.userConnections.delete(userId);
    }

    // Broadcast user left event
    this.broadcastToSession(sessionId, {
      type: 'user-left',
      userId,
      timestamp: new Date()
    });

    // Clean up session if empty and not persistent
    if (session.participants.size === 0 && !session.settings.autoSave) {
      await this.cleanupSession(sessionId);
    }

    this.emit('userLeft', { sessionId, userId });
  }

  /**
   * Share a document in the session
   */
  async shareDocument(sessionId: string, document: SharedDocument): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Initialize Yjs text for the document
    const yDoc = this.documentProviders.get(sessionId);
    if (!yDoc) {
      throw new Error('Session document provider not found');
    }

    const yText = yDoc.getText(document.id);
    if (document.content) {
      yText.insert(0, document.content);
    }

    session.documents.set(document.id, {
      ...document,
      yText,
      cursors: new Map(),
      lastModified: new Date(),
      version: 1
    });

    // Broadcast document shared event
    this.broadcastToSession(sessionId, {
      type: 'document-shared',
      document: {
        id: document.id,
        name: document.name,
        type: document.type,
        language: document.language
      },
      timestamp: new Date()
    });

    this.emit('documentShared', { sessionId, document });
  }

  /**
   * Apply operation to a shared document
   */
  async applyOperation(sessionId: string, operation: DocumentOperation): Promise<OperationResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const document = session.documents.get(operation.documentId);
    if (!document) {
      throw new Error(`Document ${operation.documentId} not found in session`);
    }

    // Check user permissions
    const participant = session.participants.get(operation.userId);
    if (!participant) {
      throw new Error('User not in session');
    }

    if (!this.permissions.canEditDocument(participant, document)) {
      throw new Error('Permission denied: cannot edit document');
    }

    try {
      // Apply operation to Yjs document
      const result = await this.applyYjsOperation(document, operation);

      // Update document metadata
      document.lastModified = new Date();
      document.version++;

      // Broadcast operation to other participants
      this.broadcastToSession(sessionId, {
        type: 'document-operation',
        operation,
        result,
        timestamp: new Date()
      }, operation.userId);

      this.emit('operationApplied', { sessionId, operation, result });

      return result;
    } catch (error) {
      // Handle conflicts
      const resolution = await this.conflictResolver.resolve(operation, document, error);
      
      this.emit('conflictResolved', { sessionId, operation, resolution });
      
      return {
        success: false,
        error: error.message,
        resolution
      };
    }
  }

  /**
   * Update user cursor position
   */
  async updateCursor(sessionId: string, userId: string, cursor: CursorPosition): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.get(userId);
    if (!participant) return;

    participant.cursor = cursor;
    participant.lastActivity = new Date();

    // Broadcast cursor update
    this.broadcastToSession(sessionId, {
      type: 'cursor-update',
      userId,
      cursor,
      timestamp: new Date()
    }, userId);
  }

  /**
   * Send chat message to session
   */
  async sendChatMessage(sessionId: string, message: ChatMessage): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const participant = session.participants.get(message.userId);
    if (!participant) {
      throw new Error('User not in session');
    }

    const chatMessage: ChatMessage = {
      ...message,
      id: this.generateMessageId(),
      timestamp: new Date()
    };

    // Broadcast chat message
    this.broadcastToSession(sessionId, {
      type: 'chat-message',
      message: chatMessage,
      timestamp: new Date()
    });

    this.emit('chatMessage', { sessionId, message: chatMessage });
  }

  /**
   * Get session analytics
   */
  async getSessionAnalytics(sessionId: string): Promise<SessionAnalytics> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const now = new Date();
    const participants = Array.from(session.participants.values());

    return {
      sessionId,
      totalParticipants: participants.length,
      activeParticipants: participants.filter(p => 
        now.getTime() - p.lastActivity.getTime() < 5 * 60 * 1000 // 5 minutes
      ).length,
      totalDocuments: session.documents.size,
      duration: now.getTime() - session.createdAt.getTime(),
      operationsCount: await this.getOperationsCount(sessionId),
      chatMessages: await this.getChatMessagesCount(sessionId),
      collaborationScore: await this.calculateCollaborationScore(session)
    };
  }

  /**
   * Create session snapshot
   */
  async createSnapshot(sessionId: string): Promise<SessionSnapshot> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const yDoc = this.documentProviders.get(sessionId);
    if (!yDoc) {
      throw new Error('Document provider not found');
    }

    const snapshot: SessionSnapshot = {
      id: this.generateSnapshotId(),
      sessionId,
      timestamp: new Date(),
      documents: new Map(),
      participants: Array.from(session.participants.values()),
      version: this.getSessionVersion(sessionId)
    };

    // Capture document states
    for (const [docId, document] of session.documents) {
      snapshot.documents.set(docId, {
        id: docId,
        name: document.name,
        content: document.yText.toString(),
        version: document.version,
        lastModified: document.lastModified
      });
    }

    return snapshot;
  }

  // Private methods

  private setupServer(): void {
    if (this.config.enableServer) {
      this.server = new WebSocketServer({ 
        port: this.config.port || 3001,
        host: this.config.host || 'localhost'
      });

      this.server.on('connection', (ws, request) => {
        this.handleConnection(ws, request);
      });

      this.server.on('error', (error) => {
        this.emit('serverError', error);
      });
    }
  }

  private handleConnection(ws: WebSocket, request: any): void {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');
    const userId = url.searchParams.get('userId');

    if (!sessionId || !userId) {
      ws.close(1008, 'Missing session or user ID');
      return;
    }

    const connection: UserConnection = {
      ws,
      userId,
      sessionId,
      connectedAt: new Date(),
      lastPing: new Date()
    };

    this.userConnections.set(userId, connection);

    ws.on('message', (data) => {
      this.handleMessage(userId, sessionId, data);
    });

    ws.on('close', () => {
      this.leaveSession(sessionId, userId);
    });

    ws.on('pong', () => {
      connection.lastPing = new Date();
    });

    // Set up ping interval
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);
  }

  private async handleMessage(userId: string, sessionId: string, data: any): Promise<void> {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'join-session':
          await this.joinSession(sessionId, message.user, message.options);
          break;
        case 'document-operation':
          await this.applyOperation(sessionId, message.operation);
          break;
        case 'cursor-update':
          await this.updateCursor(sessionId, userId, message.cursor);
          break;
        case 'chat-message':
          await this.sendChatMessage(sessionId, message.message);
          break;
        case 'share-document':
          await this.shareDocument(sessionId, message.document);
          break;
        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      const connection = this.userConnections.get(userId);
      if (connection) {
        connection.ws.send(JSON.stringify({
          type: 'error',
          error: error.message
        }));
      }
    }
  }

  private broadcastToSession(sessionId: string, message: any, excludeUserId?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    for (const [userId] of session.participants) {
      if (excludeUserId && userId === excludeUserId) continue;
      
      const connection = this.userConnections.get(userId);
      if (connection && connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.send(JSON.stringify(message));
      }
    }
  }

  private async applyYjsOperation(document: SessionDocument, operation: DocumentOperation): Promise<OperationResult> {
    const { yText } = document;
    
    switch (operation.type) {
      case 'insert':
        yText.insert(operation.index!, operation.content!);
        break;
      case 'delete':
        yText.delete(operation.index!, operation.length!);
        break;
      case 'replace':
        yText.delete(operation.index!, operation.length!);
        yText.insert(operation.index!, operation.content!);
        break;
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }

    return {
      success: true,
      newVersion: document.version + 1,
      transformedOperation: operation
    };
  }

  private setupDocumentPersistence(sessionId: string, yDoc: Y.Doc): void {
    // Set up periodic saving
    const saveInterval = setInterval(async () => {
      try {
        await this.saveSessionState(sessionId);
      } catch (error) {
        console.error('Error saving session state:', error);
      }
    }, this.config.autoSaveInterval || 30000);

    // Clean up on session end
    yDoc.on('destroy', () => {
      clearInterval(saveInterval);
    });
  }

  private async saveSessionState(sessionId: string): Promise<void> {
    const snapshot = await this.createSnapshot(sessionId);
    // Save to persistent storage (implementation depends on storage backend)
    this.emit('sessionSaved', { sessionId, snapshot });
  }

  private async cleanupSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Clean up Yjs document
    const yDoc = this.documentProviders.get(sessionId);
    if (yDoc) {
      yDoc.destroy();
      this.documentProviders.delete(sessionId);
    }

    // Remove session
    this.sessions.delete(sessionId);

    this.emit('sessionClosed', { sessionId, session });
  }

  private determineUserRole(user: SessionUser, session: CollaborationSession): 'owner' | 'admin' | 'collaborator' | 'viewer' {
    if (user.id === session.ownerId) return 'owner';
    // Additional role logic based on user permissions
    return 'collaborator';
  }

  private generateSessionId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private generateMessageId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  private generateSnapshotId(): string {
    return crypto.randomBytes(12).toString('hex');
  }

  private getSessionVersion(sessionId: string): number {
    // Implementation would track version changes
    return 1;
  }

  private async getOperationsCount(sessionId: string): Promise<number> {
    // Implementation would count operations
    return 0;
  }

  private async getChatMessagesCount(sessionId: string): Promise<number> {
    // Implementation would count chat messages
    return 0;
  }

  private async calculateCollaborationScore(session: CollaborationSession): Promise<number> {
    // Calculate collaboration effectiveness score
    const participantCount = session.participants.size;
    const documentCount = session.documents.size;
    const activityLevel = this.calculateActivityLevel(session);
    
    return Math.min(100, (participantCount * 10) + (documentCount * 5) + activityLevel);
  }

  private calculateActivityLevel(session: CollaborationSession): number {
    const now = new Date();
    const recentActivity = Array.from(session.participants.values()).filter(p => 
      now.getTime() - p.lastActivity.getTime() < 10 * 60 * 1000 // 10 minutes
    ).length;
    
    return (recentActivity / session.participants.size) * 50;
  }
}

// Supporting classes

class ConflictResolver {
  async resolve(operation: DocumentOperation, document: SessionDocument, error: any): Promise<ConflictResolution> {
    // Implement operational transform or other conflict resolution strategies
    return {
      strategy: 'operational-transform',
      resolvedOperation: operation,
      success: true
    };
  }
}

class PermissionManager {
  async canJoinSession(user: SessionUser, session: CollaborationSession): Promise<PermissionResult> {
    if (session.settings.requireInvite && !user.invited) {
      return { allowed: false, reason: 'Invitation required' };
    }
    
    if (!session.settings.allowAnonymous && !user.authenticated) {
      return { allowed: false, reason: 'Authentication required' };
    }
    
    return { allowed: true };
  }

  async getUserPermissions(user: SessionUser, session: CollaborationSession): Promise<UserPermissions> {
    const role = this.determineRole(user, session);
    
    return {
      canEdit: role !== 'viewer',
      canShare: role === 'owner' || role === 'admin',
      canInvite: role === 'owner' || role === 'admin',
      canModerate: role === 'owner' || role === 'admin',
      canExport: true
    };
  }

  canEditDocument(participant: SessionParticipant, document: SessionDocument): boolean {
    return participant.permissions.canEdit && !document.readOnly;
  }

  private determineRole(user: SessionUser, session: CollaborationSession): 'owner' | 'admin' | 'collaborator' | 'viewer' {
    if (user.id === session.ownerId) return 'owner';
    return 'collaborator';
  }
}

// Interfaces and types

export interface RealTimeSyncConfig {
  enableServer: boolean;
  port?: number;
  host?: string;
  autoSaveInterval?: number;
  maxSessions?: number;
  maxParticipantsPerSession?: number;
}

export interface CreateSessionOptions {
  name: string;
  description?: string;
  ownerId: string;
  projectId?: string;
  maxParticipants?: number;
  allowAnonymous?: boolean;
  readOnly?: boolean;
  requireInvite?: boolean;
  autoSave?: boolean;
  conflictResolution?: 'operational-transform' | 'last-write-wins' | 'manual';
}

export interface CollaborationSession {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  projectId?: string;
  participants: Map<string, SessionParticipant>;
  documents: Map<string, SessionDocument>;
  settings: SessionSettings;
  status: 'active' | 'paused' | 'closed';
  createdAt: Date;
  lastActivity: Date;
}

export interface SessionUser {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  authenticated: boolean;
  invited?: boolean;
}

export interface SessionParticipant {
  user: SessionUser;
  joinedAt: Date;
  role: 'owner' | 'admin' | 'collaborator' | 'viewer';
  permissions: UserPermissions;
  cursor: CursorPosition | null;
  status: 'active' | 'idle' | 'away';
  lastActivity: Date;
}

export interface SessionSettings {
  maxParticipants: number;
  allowAnonymous: boolean;
  readOnly: boolean;
  requireInvite: boolean;
  autoSave: boolean;
  conflictResolution: string;
}

export interface SharedDocument {
  id: string;
  name: string;
  type: 'text' | 'code' | 'markdown' | 'json';
  language?: string;
  content?: string;
  readOnly?: boolean;
}

export interface SessionDocument extends SharedDocument {
  yText: Y.Text;
  cursors: Map<string, CursorPosition>;
  lastModified: Date;
  version: number;
}

export interface DocumentOperation {
  id: string;
  documentId: string;
  userId: string;
  type: 'insert' | 'delete' | 'replace';
  index?: number;
  length?: number;
  content?: string;
  timestamp: Date;
}

export interface CursorPosition {
  documentId: string;
  line: number;
  column: number;
  selection?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

export interface ChatMessage {
  id?: string;
  userId: string;
  content: string;
  type: 'text' | 'code' | 'system';
  timestamp?: Date;
  replyTo?: string;
}

export interface UserConnection {
  ws: WebSocket;
  userId: string;
  sessionId: string;
  connectedAt: Date;
  lastPing: Date;
}

export interface UserPermissions {
  canEdit: boolean;
  canShare: boolean;
  canInvite: boolean;
  canModerate: boolean;
  canExport: boolean;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

export interface JoinOptions {
  readOnly?: boolean;
}

export interface SessionJoinResult {
  success: boolean;
  session: CollaborationSession;
  participant: SessionParticipant;
  documents: string[];
}

export interface OperationResult {
  success: boolean;
  newVersion?: number;
  transformedOperation?: DocumentOperation;
  error?: string;
  resolution?: ConflictResolution;
}

export interface ConflictResolution {
  strategy: string;
  resolvedOperation: DocumentOperation;
  success: boolean;
}

export interface SessionAnalytics {
  sessionId: string;
  totalParticipants: number;
  activeParticipants: number;
  totalDocuments: number;
  duration: number;
  operationsCount: number;
  chatMessages: number;
  collaborationScore: number;
}

export interface SessionSnapshot {
  id: string;
  sessionId: string;
  timestamp: Date;
  documents: Map<string, DocumentSnapshot>;
  participants: SessionParticipant[];
  version: number;
}

export interface DocumentSnapshot {
  id: string;
  name: string;
  content: string;
  version: number;
  lastModified: Date;
}