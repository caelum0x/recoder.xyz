/**
 * Collaborative Session Manager
 * KILLER FEATURE: Multi-developer + AI agent session management with persistence
 * Cursor doesn't have session management - we do!
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import { 
  CollaborationSession, 
  CollaborationUser, 
  AISuggestion,
  CodeChange 
} from './websocket-server';

export interface SessionPersistence {
  saveSession(session: CollaborationSession): Promise<void>;
  loadSession(sessionId: string): Promise<CollaborationSession | null>;
  deleteSession(sessionId: string): Promise<void>;
  listSessions(userId?: string): Promise<CollaborationSession[]>;
  saveCodeHistory(sessionId: string, change: CodeChange): Promise<void>;
  getCodeHistory(sessionId: string, file?: string): Promise<CodeChange[]>;
}

export interface UserPresence {
  userId: string;
  sessionId: string;
  status: 'active' | 'idle' | 'away' | 'coding' | 'reviewing';
  lastActivity: Date;
  currentFile?: string;
  cursor?: {
    line: number;
    column: number;
    file: string;
  };
  isTyping?: boolean;
  typingIn?: string; // file path
}

export interface SessionInvite {
  id: string;
  sessionId: string;
  invitedBy: string;
  invitedUser: string;
  invitedEmail?: string;
  message?: string;
  expiresAt: Date;
  accepted?: boolean;
  acceptedAt?: Date;
}

export interface SessionAnalytics {
  sessionId: string;
  totalUsers: number;
  totalTime: number; // seconds
  codeChanges: number;
  aiSuggestions: number;
  aiAcceptanceRate: number;
  mostActiveUser: string;
  mostEditedFiles: string[];
  collaborationScore: number; // 0-100, based on interaction quality
}

export class SessionManager extends EventEmitter {
  private sessions: Map<string, CollaborationSession> = new Map();
  private userPresence: Map<string, UserPresence> = new Map();
  private sessionInvites: Map<string, SessionInvite> = new Map();
  private analytics: Map<string, SessionAnalytics> = new Map();
  private persistence: SessionPersistence | null = null;
  private presenceUpdateInterval: NodeJS.Timeout | null = null;

  constructor(persistence?: SessionPersistence) {
    super();
    this.persistence = persistence || null;
    this.startPresenceUpdates();
  }

  // Session Management
  
  async createSession(
    creator: CollaborationUser, 
    sessionData: Partial<CollaborationSession>
  ): Promise<CollaborationSession> {
    const sessionId = uuidv4();
    
    const session: CollaborationSession = {
      id: sessionId,
      name: sessionData.name || `${creator.name}'s Session`,
      projectPath: sessionData.projectPath || '',
      createdAt: new Date(),
      createdBy: creator.id,
      users: new Map([[creator.id, creator]]),
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
        language: 'typescript',
        description: '',
        tags: [],
        ...sessionData.metadata
      }
    };

    this.sessions.set(sessionId, session);
    
    // Initialize analytics
    this.analytics.set(sessionId, {
      sessionId,
      totalUsers: 1,
      totalTime: 0,
      codeChanges: 0,
      aiSuggestions: 0,
      aiAcceptanceRate: 0,
      mostActiveUser: creator.id,
      mostEditedFiles: [],
      collaborationScore: 0
    });

    // Initialize user presence
    this.updateUserPresence(creator.id, sessionId, {
      status: 'active',
      lastActivity: new Date()
    });

    // Persist session
    if (this.persistence) {
      await this.persistence.saveSession(session);
    }

    this.emit('session-created', { session, creator });
    Logger.info(`Session created: ${sessionId} by ${creator.name}`);

    return session;
  }

  async joinSession(sessionId: string, user: CollaborationUser): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      // Try to load from persistence
      if (this.persistence) {
        const persistedSession = await this.persistence.loadSession(sessionId);
        if (persistedSession) {
          this.sessions.set(sessionId, persistedSession);
          return this.joinSession(sessionId, user);
        }
      }
      throw new Error('Session not found');
    }

    // Check capacity
    if (session.users.size >= session.settings.maxUsers) {
      throw new Error('Session is full');
    }

    // Check if user is already in session
    if (session.users.has(user.id)) {
      Logger.warn(`User ${user.id} already in session ${sessionId}`);
      return true;
    }

    // Add user to session
    session.users.set(user.id, {
      ...user,
      isActive: true,
      lastSeen: new Date()
    });

    // Update analytics
    const analytics = this.analytics.get(sessionId);
    if (analytics) {
      analytics.totalUsers = Math.max(analytics.totalUsers, session.users.size);
    }

    // Update user presence
    this.updateUserPresence(user.id, sessionId, {
      status: 'active',
      lastActivity: new Date()
    });

    // Persist session
    if (this.persistence) {
      await this.persistence.saveSession(session);
    }

    this.emit('user-joined-session', { sessionId, user, session });
    Logger.info(`User ${user.name} joined session ${sessionId}`);

    return true;
  }

  async leaveSession(sessionId: string, userId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const user = session.users.get(userId);
    if (!user) {
      return false;
    }

    // Remove user from session
    session.users.delete(userId);
    this.userPresence.delete(userId);

    // Clean up empty sessions
    if (session.users.size === 0) {
      this.sessions.delete(sessionId);
      this.analytics.delete(sessionId);
      
      if (this.persistence) {
        await this.persistence.deleteSession(sessionId);
      }
      
      this.emit('session-ended', { sessionId, session });
      Logger.info(`Empty session ${sessionId} cleaned up`);
    } else {
      // Persist updated session
      if (this.persistence) {
        await this.persistence.saveSession(session);
      }
    }

    this.emit('user-left-session', { sessionId, userId, user, session });
    Logger.info(`User ${user.name} left session ${sessionId}`);

    return true;
  }

  // User Presence Management

  updateUserPresence(
    userId: string, 
    sessionId: string, 
    updates: Partial<UserPresence>
  ): void {
    const currentPresence = this.userPresence.get(userId);
    
    const presence: UserPresence = {
      userId,
      sessionId,
      status: 'active',
      lastActivity: new Date(),
      ...currentPresence,
      ...updates
    };

    this.userPresence.set(userId, presence);

    // Update user in session
    const session = this.sessions.get(sessionId);
    if (session && session.users.has(userId)) {
      const user = session.users.get(userId)!;
      user.isActive = presence.status !== 'away';
      user.lastSeen = presence.lastActivity;
      
      if (presence.cursor) {
        user.cursor = presence.cursor;
      }
    }

    this.emit('presence-updated', { userId, sessionId, presence });
  }

  getUserPresence(userId: string): UserPresence | null {
    return this.userPresence.get(userId) || null;
  }

  getSessionPresence(sessionId: string): UserPresence[] {
    return Array.from(this.userPresence.values())
      .filter(presence => presence.sessionId === sessionId);
  }

  // Session Invitations

  async createInvite(
    sessionId: string, 
    invitedBy: string, 
    invitedUser: string,
    options?: {
      email?: string;
      message?: string;
      expiresIn?: number; // hours
    }
  ): Promise<SessionInvite> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Check if inviter is in session
    if (!session.users.has(invitedBy)) {
      throw new Error('Only session members can invite others');
    }

    const inviteId = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (options?.expiresIn || 24));

    const invite: SessionInvite = {
      id: inviteId,
      sessionId,
      invitedBy,
      invitedUser,
      invitedEmail: options?.email,
      message: options?.message,
      expiresAt,
      accepted: false
    };

    this.sessionInvites.set(inviteId, invite);

    this.emit('invite-created', { invite, session });
    Logger.info(`Invite created: ${inviteId} for session ${sessionId}`);

    return invite;
  }

  async acceptInvite(inviteId: string, user: CollaborationUser): Promise<boolean> {
    const invite = this.sessionInvites.get(inviteId);
    if (!invite) {
      throw new Error('Invite not found');
    }

    if (invite.expiresAt < new Date()) {
      this.sessionInvites.delete(inviteId);
      throw new Error('Invite has expired');
    }

    if (invite.accepted) {
      throw new Error('Invite already accepted');
    }

    // Validate user (if email specified)
    if (invite.invitedEmail && user.email !== invite.invitedEmail) {
      throw new Error('Invite is for a different email address');
    }

    // Join the session
    await this.joinSession(invite.sessionId, user);

    // Mark invite as accepted
    invite.accepted = true;
    invite.acceptedAt = new Date();

    this.emit('invite-accepted', { invite, user });
    Logger.info(`Invite ${inviteId} accepted by ${user.name}`);

    return true;
  }

  // Analytics and Monitoring

  recordCodeChange(sessionId: string, change: CodeChange): void {
    const analytics = this.analytics.get(sessionId);
    if (!analytics) return;

    analytics.codeChanges++;
    
    // Track most edited files
    if (!analytics.mostEditedFiles.includes(change.file)) {
      analytics.mostEditedFiles.push(change.file);
    }

    // Update collaboration score based on change patterns
    this.updateCollaborationScore(sessionId, change);

    // Persist code change
    if (this.persistence) {
      this.persistence.saveCodeHistory(sessionId, change).catch(err => 
        Logger.error('Failed to save code history', err)
      );
    }
  }

  recordAISuggestion(sessionId: string, suggestion: AISuggestion): void {
    const analytics = this.analytics.get(sessionId);
    if (!analytics) return;

    analytics.aiSuggestions++;
    
    if (suggestion.accepted) {
      const acceptanceRate = analytics.aiSuggestions > 0 
        ? (analytics.aiSuggestions / (analytics.aiSuggestions + 1)) 
        : 1;
      analytics.aiAcceptanceRate = acceptanceRate;
    }
  }

  getSessionAnalytics(sessionId: string): SessionAnalytics | null {
    return this.analytics.get(sessionId) || null;
  }

  // Private Methods

  private startPresenceUpdates(): void {
    // Update presence every 30 seconds
    this.presenceUpdateInterval = setInterval(() => {
      this.cleanupInactiveUsers();
    }, 30000);
  }

  private cleanupInactiveUsers(): void {
    const now = new Date();
    const inactiveThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [userId, presence] of this.userPresence.entries()) {
      const timeSinceActivity = now.getTime() - presence.lastActivity.getTime();
      
      if (timeSinceActivity > inactiveThreshold && presence.status !== 'away') {
        this.updateUserPresence(userId, presence.sessionId, {
          status: 'away'
        });
      }
    }

    // Clean up expired invites
    for (const [inviteId, invite] of this.sessionInvites.entries()) {
      if (invite.expiresAt < now) {
        this.sessionInvites.delete(inviteId);
        Logger.info(`Expired invite cleaned up: ${inviteId}`);
      }
    }
  }

  private updateCollaborationScore(sessionId: string, _change: CodeChange): void {
    const analytics = this.analytics.get(sessionId);
    const session = this.sessions.get(sessionId);
    if (!analytics || !session) return;

    // Simple collaboration scoring based on:
    // - Number of active users
    // - Code change frequency
    // - File diversity
    
    const activeUsers = Array.from(session.users.values())
      .filter(user => user.isActive).length;
    
    const filesDiversity = analytics.mostEditedFiles.length;
    const changeFrequency = analytics.codeChanges / ((Date.now() - session.createdAt.getTime()) / 1000 / 60); // changes per minute

    analytics.collaborationScore = Math.min(100, Math.round(
      (activeUsers * 20) + 
      (filesDiversity * 10) + 
      (changeFrequency * 5)
    ));
  }

  // Public API Methods

  getSession(sessionId: string): CollaborationSession | null {
    return this.sessions.get(sessionId) || null;
  }

  getAllSessions(): CollaborationSession[] {
    return Array.from(this.sessions.values());
  }

  getUserSessions(userId: string): CollaborationSession[] {
    return Array.from(this.sessions.values())
      .filter(session => session.users.has(userId));
  }

  getActiveUsers(sessionId: string): CollaborationUser[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return Array.from(session.users.values())
      .filter(user => user.isActive);
  }

  async shutdown(): Promise<void> {
    Logger.info('Shutting down session manager...');
    
    if (this.presenceUpdateInterval) {
      clearInterval(this.presenceUpdateInterval);
    }

    // Save all sessions if persistence is enabled
    if (this.persistence) {
      const savePromises = Array.from(this.sessions.values())
        .map(session => this.persistence!.saveSession(session));
      await Promise.all(savePromises);
    }

    this.sessions.clear();
    this.userPresence.clear();
    this.sessionInvites.clear();
    this.analytics.clear();

    Logger.info('Session manager shut down');
  }
}

// Types are already exported as interfaces above
