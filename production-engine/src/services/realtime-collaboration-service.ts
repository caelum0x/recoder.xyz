/**
 * Real-time Collaboration Service for Recoder.ai DaaS Platform
 * Handles live code editing, cursor positions, and real-time communication
 */

import { logger } from '../utils/logger';
import { teamCollaborationService } from './team-collaboration-service';

export interface RealtimeUser {
  id: string;
  username: string;
  avatar?: string;
  role: 'owner' | 'editor' | 'viewer';
  status: 'active' | 'idle' | 'away';
  cursor?: {
    file: string;
    line: number;
    column: number;
    selection?: {
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    };
  };
  joinedAt: Date;
  lastSeenAt: Date;
}

export interface CodeChange {
  id: string;
  userId: string;
  sessionId: string;
  type: 'insert' | 'delete' | 'replace' | 'format';
  file: string;
  position: {
    line: number;
    column: number;
  };
  range?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  content: string;
  timestamp: Date;
  applied: boolean;
}

export interface RealtimeMessage {
  id: string;
  userId: string;
  username: string;
  type: 'text' | 'code' | 'file' | 'system' | 'typing';
  content: string;
  metadata?: {
    file?: string;
    line?: number;
    language?: string;
    fileName?: string;
    fileSize?: number;
  };
  timestamp: Date;
  reactions?: Array<{
    userId: string;
    emoji: string;
    timestamp: Date;
  }>;
}

export interface RealtimeSession {
  id: string;
  projectId: string;
  teamId?: string;
  
  // Active users
  users: Map<string, RealtimeUser>;
  
  // File states
  files: Map<string, {
    content: string;
    version: number;
    lockedBy?: string; // userId who has exclusive edit access
    lastModified: Date;
    changeHistory: CodeChange[];
  }>;
  
  // Communication
  messages: RealtimeMessage[];
  typingUsers: Map<string, { file: string; timestamp: Date }>;
  
  // Session metadata
  activeFile?: string;
  settings: {
    allowConcurrentEditing: boolean;
    autoSave: boolean;
    autoSaveInterval: number; // seconds
    conflictResolution: 'last-write-wins' | 'operational-transform' | 'manual';
  };
  
  createdAt: Date;
  updatedAt: Date;
}

export class RealtimeCollaborationService {
  private sessions: Map<string, RealtimeSession> = new Map();
  private userSessions: Map<string, string[]> = new Map(); // userId -> sessionIds
  private changeBuffer: Map<string, CodeChange[]> = new Map(); // sessionId -> pending changes
  
  // WebSocket connections (in production, use Socket.IO or similar)
  private connections: Map<string, any> = new Map(); // userId -> connection

  constructor() {
    this.initializeRealtimeService();
  }

  private initializeRealtimeService(): void {
    logger.info('⚡ Initializing Real-time Collaboration Service...');
    
    // Start periodic cleanup
    this.startPeriodicCleanup();
    
    logger.info('✅ Real-time Collaboration Service initialized');
  }

  /**
   * Join a real-time collaboration session
   */
  async joinSession(
    sessionId: string,
    user: {
      id: string;
      username: string;
      avatar?: string;
      role: 'owner' | 'editor' | 'viewer';
    }
  ): Promise<{ success: boolean; session?: RealtimeSession; error?: string }> {
    try {
      let session = this.sessions.get(sessionId);
      
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      // Add user to session
      const realtimeUser: RealtimeUser = {
        ...user,
        status: 'active',
        joinedAt: new Date(),
        lastSeenAt: new Date()
      };

      session.users.set(user.id, realtimeUser);
      session.updatedAt = new Date();

      // Track user session
      if (!this.userSessions.has(user.id)) {
        this.userSessions.set(user.id, []);
      }
      this.userSessions.get(user.id)!.push(sessionId);

      // Broadcast user join event
      this.broadcastToSession(sessionId, {
        type: 'user-joined',
        data: {
          user: realtimeUser,
          totalUsers: session.users.size
        }
      });

      // Add system message
      session.messages.push({
        id: this.generateMessageId(),
        userId: 'system',
        username: 'System',
        type: 'system',
        content: `${user.username} joined the collaboration session`,
        timestamp: new Date()
      });

      logger.info(`👥 User joined session: ${user.username} -> ${sessionId}`);

      return { success: true, session };

    } catch (error: any) {
      logger.error('Join session failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Leave a collaboration session
   */
  async leaveSession(sessionId: string, userId: string): Promise<void> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) return;

      const user = session.users.get(userId);
      if (!user) return;

      // Remove user from session
      session.users.delete(userId);
      session.updatedAt = new Date();

      // Clear typing indicator
      session.typingUsers.delete(userId);

      // Release any file locks
      session.files.forEach((file, fileName) => {
        if (file.lockedBy === userId) {
          file.lockedBy = undefined;
        }
      });

      // Update user sessions
      const userSessionList = this.userSessions.get(userId);
      if (userSessionList) {
        const index = userSessionList.indexOf(sessionId);
        if (index > -1) {
          userSessionList.splice(index, 1);
        }
      }

      // Broadcast user leave event
      this.broadcastToSession(sessionId, {
        type: 'user-left',
        data: {
          userId,
          username: user.username,
          totalUsers: session.users.size
        }
      });

      // Add system message
      session.messages.push({
        id: this.generateMessageId(),
        userId: 'system',
        username: 'System',
        type: 'system',
        content: `${user.username} left the collaboration session`,
        timestamp: new Date()
      });

      // Clean up empty sessions
      if (session.users.size === 0) {
        this.sessions.delete(sessionId);
        this.changeBuffer.delete(sessionId);
        logger.info(`🗑️ Empty session cleaned up: ${sessionId}`);
      }

      logger.info(`👋 User left session: ${user.username} -> ${sessionId}`);

    } catch (error: any) {
      logger.error('Leave session failed:', error);
    }
  }

  /**
   * Apply code change to session
   */
  async applyCodeChange(
    sessionId: string,
    userId: string,
    change: Omit<CodeChange, 'id' | 'userId' | 'sessionId' | 'timestamp' | 'applied'>
  ): Promise<{ success: boolean; change?: CodeChange; error?: string }> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      const user = session.users.get(userId);
      if (!user) {
        return { success: false, error: 'User not in session' };
      }

      // Check permissions
      if (user.role === 'viewer') {
        return { success: false, error: 'Viewers cannot edit code' };
      }

      // Create change object
      const codeChange: CodeChange = {
        ...change,
        id: this.generateChangeId(),
        userId,
        sessionId,
        timestamp: new Date(),
        applied: false
      };

      // Get or create file state
      if (!session.files.has(change.file)) {
        session.files.set(change.file, {
          content: '',
          version: 1,
          lastModified: new Date(),
          changeHistory: []
        });
      }

      const fileState = session.files.get(change.file)!;

      // Check for conflicts if not allowing concurrent editing
      if (!session.settings.allowConcurrentEditing && fileState.lockedBy && fileState.lockedBy !== userId) {
        return { success: false, error: 'File is locked by another user' };
      }

      // Apply change based on conflict resolution strategy
      switch (session.settings.conflictResolution) {
        case 'last-write-wins':
          this.applyLastWriteWins(fileState, codeChange);
          break;
        case 'operational-transform':
          this.applyOperationalTransform(fileState, codeChange);
          break;
        case 'manual':
          // Store in buffer for manual resolution
          if (!this.changeBuffer.has(sessionId)) {
            this.changeBuffer.set(sessionId, []);
          }
          this.changeBuffer.get(sessionId)!.push(codeChange);
          return { success: true, change: codeChange };
      }

      // Update file state
      fileState.version += 1;
      fileState.lastModified = new Date();
      fileState.changeHistory.push(codeChange);
      codeChange.applied = true;

      // Broadcast change to other users
      this.broadcastToSession(sessionId, {
        type: 'code-change',
        data: {
          change: codeChange,
          fileState: {
            file: change.file,
            content: fileState.content,
            version: fileState.version
          }
        }
      }, userId); // Exclude the user who made the change

      session.updatedAt = new Date();

      logger.info(`✏️ Code change applied: ${change.file} by ${user.username}`);

      return { success: true, change: codeChange };

    } catch (error: any) {
      logger.error('Apply code change failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update cursor position
   */
  async updateCursor(
    sessionId: string,
    userId: string,
    cursor: RealtimeUser['cursor']
  ): Promise<void> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) return;

      const user = session.users.get(userId);
      if (!user) return;

      // Update cursor position
      user.cursor = cursor;
      user.lastSeenAt = new Date();
      user.status = 'active';

      // Broadcast cursor update
      this.broadcastToSession(sessionId, {
        type: 'cursor-update',
        data: {
          userId,
          cursor
        }
      }, userId);

    } catch (error: any) {
      logger.error('Update cursor failed:', error);
    }
  }

  /**
   * Send message to session
   */
  async sendMessage(
    sessionId: string,
    userId: string,
    message: Omit<RealtimeMessage, 'id' | 'userId' | 'username' | 'timestamp'>
  ): Promise<{ success: boolean; message?: RealtimeMessage; error?: string }> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      const user = session.users.get(userId);
      if (!user) {
        return { success: false, error: 'User not in session' };
      }

      const realtimeMessage: RealtimeMessage = {
        ...message,
        id: this.generateMessageId(),
        userId,
        username: user.username,
        timestamp: new Date()
      };

      // Add to session messages
      session.messages.push(realtimeMessage);
      
      // Keep only last 100 messages
      if (session.messages.length > 100) {
        session.messages = session.messages.slice(-100);
      }

      // Broadcast message
      this.broadcastToSession(sessionId, {
        type: 'chat-message',
        data: realtimeMessage
      });

      session.updatedAt = new Date();

      return { success: true, message: realtimeMessage };

    } catch (error: any) {
      logger.error('Send message failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set typing indicator
   */
  async setTyping(
    sessionId: string,
    userId: string,
    file: string,
    isTyping: boolean
  ): Promise<void> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) return;

      if (isTyping) {
        session.typingUsers.set(userId, {
          file,
          timestamp: new Date()
        });
      } else {
        session.typingUsers.delete(userId);
      }

      // Broadcast typing status
      this.broadcastToSession(sessionId, {
        type: 'typing-update',
        data: {
          userId,
          file,
          isTyping
        }
      }, userId);

    } catch (error: any) {
      logger.error('Set typing failed:', error);
    }
  }

  /**
   * Get session state
   */
  getSession(sessionId: string): RealtimeSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Create new realtime session
   */
  async createSession(
    projectId: string,
    initialFiles: Array<{ path: string; content: string }>,
    settings?: Partial<RealtimeSession['settings']>,
    teamId?: string
  ): Promise<{ success: boolean; session?: RealtimeSession; error?: string }> {
    try {
      const sessionId = this.generateSessionId();

      const session: RealtimeSession = {
        id: sessionId,
        projectId,
        teamId,
        users: new Map(),
        files: new Map(),
        messages: [],
        typingUsers: new Map(),
        settings: {
          allowConcurrentEditing: true,
          autoSave: true,
          autoSaveInterval: 30,
          conflictResolution: 'operational-transform',
          ...settings
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Initialize file states
      initialFiles.forEach(file => {
        session.files.set(file.path, {
          content: file.content,
          version: 1,
          lastModified: new Date(),
          changeHistory: []
        });
      });

      this.sessions.set(sessionId, session);

      logger.info(`🆕 Real-time session created: ${sessionId} for project ${projectId}`);

      return { success: true, session };

    } catch (error: any) {
      logger.error('Create session failed:', error);
      return { success: false, error: error.message };
    }
  }

  private applyLastWriteWins(fileState: any, change: CodeChange): void {
    // Simple last-write-wins strategy
    switch (change.type) {
      case 'insert':
        const lines = fileState.content.split('\n');
        lines.splice(change.position.line, 0, change.content);
        fileState.content = lines.join('\n');
        break;
      
      case 'delete':
        if (change.range) {
          const lines = fileState.content.split('\n');
          lines.splice(change.range.startLine, change.range.endLine - change.range.startLine + 1);
          fileState.content = lines.join('\n');
        }
        break;
      
      case 'replace':
        if (change.range) {
          const lines = fileState.content.split('\n');
          lines.splice(
            change.range.startLine,
            change.range.endLine - change.range.startLine + 1,
            change.content
          );
          fileState.content = lines.join('\n');
        }
        break;
    }
  }

  private applyOperationalTransform(fileState: any, change: CodeChange): void {
    // Simplified operational transform
    // In production, use a proper OT library like ShareJS or Yjs
    this.applyLastWriteWins(fileState, change);
  }

  private broadcastToSession(sessionId: string, event: any, excludeUserId?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.users.forEach((user, userId) => {
      if (excludeUserId && userId === excludeUserId) return;
      
      const connection = this.connections.get(userId);
      if (connection && connection.readyState === 1) { // WebSocket OPEN
        try {
          connection.send(JSON.stringify(event));
        } catch (error) {
          logger.error(`Failed to send to user ${userId}:`, error);
        }
      }
    });
  }

  private startPeriodicCleanup(): void {
    // Clean up inactive sessions every 5 minutes
    setInterval(() => {
      const now = new Date();
      const inactivityThreshold = 30 * 60 * 1000; // 30 minutes

      this.sessions.forEach((session, sessionId) => {
        const timeSinceUpdate = now.getTime() - session.updatedAt.getTime();
        
        if (timeSinceUpdate > inactivityThreshold || session.users.size === 0) {
          this.sessions.delete(sessionId);
          this.changeBuffer.delete(sessionId);
          logger.info(`🧹 Inactive session cleaned up: ${sessionId}`);
        }
      });

      // Clean up typing indicators older than 5 seconds
      this.sessions.forEach(session => {
        session.typingUsers.forEach((typing, userId) => {
          if (now.getTime() - typing.timestamp.getTime() > 5000) {
            session.typingUsers.delete(userId);
          }
        });
      });

    }, 5 * 60 * 1000); // 5 minutes
  }

  private generateSessionId(): string {
    return 'rt_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
  }

  private generateMessageId(): string {
    return 'msg_' + Math.random().toString(36).substring(2, 11);
  }

  private generateChangeId(): string {
    return 'chg_' + Math.random().toString(36).substring(2, 11);
  }
}

// Export singleton instance
export const realtimeCollaborationService = new RealtimeCollaborationService();