/**
 * Real-time Collaboration Engine
 * Manages live collaboration sessions, user presence, and synchronized changes
 */

import { randomUUID } from 'crypto';

export interface User {
  id: string;
  name: string;
  email: string;
  cursor?: {
    line: number;
    column: number;
    selection?: {
      start: { line: number; column: number };
      end: { line: number; column: number };
    };
  };
  lastSeen: number;
}

export interface Change {
  id: string;
  userId: string;
  timestamp: number;
  type: 'insert' | 'delete' | 'replace';
  position: {
    line: number;
    column: number;
  };
  content: string;
  metadata?: {
    description?: string;
    aiGenerated?: boolean;
    model?: string;
  };
}

export interface AIGeneration {
  id: string;
  userId: string;
  timestamp: number;
  type: 'code' | 'suggestion' | 'completion';
  content: string;
  context: {
    prompt: string;
    model: string;
    language?: string;
    framework?: string;
  };
  approved: boolean;
  appliedAt?: number;
}

export interface CollaborationSession {
  id: string;
  name: string;
  createdBy: string;
  createdAt: number;
  lastActivity: number;
  participants: User[];
  changes: Change[];
  aiGenerations: AIGeneration[];
  settings: {
    maxParticipants: number;
    allowAISharing: boolean;
    requireApproval: boolean;
    autoSave: boolean;
  };
  metadata: {
    project?: string;
    repository?: string;
    branch?: string;
    files?: string[];
  };
}

class CollaborationEngine {
  private sessions: Map<string, CollaborationSession> = new Map();
  private userSessions: Map<string, Set<string>> = new Map(); // userId -> sessionIds
  private changeListeners: Map<string, Set<Function>> = new Map(); // sessionId -> listeners
  private maxSessions = 1000;
  private sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    // Cleanup inactive sessions every hour
    setInterval(() => this.cleanupInactiveSessions(), 60 * 60 * 1000);
  }

  /**
   * Create a new collaboration session
   */
  async createSession(userId: string, options: {
    name?: string;
    maxParticipants?: number;
    allowAISharing?: boolean;
    requireApproval?: boolean;
    autoSave?: boolean;
    metadata?: any;
  } = {}): Promise<string> {
    if (this.sessions.size >= this.maxSessions) {
      throw new Error('Maximum number of sessions reached');
    }

    const sessionId = randomUUID();
    const now = Date.now();

    const session: CollaborationSession = {
      id: sessionId,
      name: options.name || `Session ${sessionId.slice(0, 8)}`,
      createdBy: userId,
      createdAt: now,
      lastActivity: now,
      participants: [],
      changes: [],
      aiGenerations: [],
      settings: {
        maxParticipants: options.maxParticipants || 10,
        allowAISharing: options.allowAISharing !== false,
        requireApproval: options.requireApproval || false,
        autoSave: options.autoSave !== false,
      },
      metadata: options.metadata || {},
    };

    this.sessions.set(sessionId, session);
    this.changeListeners.set(sessionId, new Set());

    // Auto-join the creator
    await this.joinSession(sessionId, {
      id: userId,
      name: 'Creator',
      email: '',
    });

    return sessionId;
  }

  /**
   * Join an existing collaboration session
   */
  async joinSession(sessionId: string, user: Omit<User, 'lastSeen'>): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    if (session.participants.length >= session.settings.maxParticipants) {
      return false;
    }

    // Check if user is already in session
    const existingIndex = session.participants.findIndex(p => p.id === user.id);
    if (existingIndex >= 0) {
      // Update existing user
      session.participants[existingIndex] = {
        ...user,
        lastSeen: Date.now(),
      };
    } else {
      // Add new user
      session.participants.push({
        ...user,
        lastSeen: Date.now(),
      });
    }

    session.lastActivity = Date.now();

    // Track user sessions
    if (!this.userSessions.has(user.id)) {
      this.userSessions.set(user.id, new Set());
    }
    this.userSessions.get(user.id)!.add(sessionId);

    // Notify listeners
    this.notifyListeners(sessionId, {
      type: 'user_joined',
      user,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Leave a collaboration session
   */
  async leaveSession(sessionId: string, userId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const userIndex = session.participants.findIndex(p => p.id === userId);
    if (userIndex >= 0) {
      const user = session.participants[userIndex];
      session.participants.splice(userIndex, 1);
      session.lastActivity = Date.now();

      // Remove from user sessions tracking
      const userSessionSet = this.userSessions.get(userId);
      if (userSessionSet) {
        userSessionSet.delete(sessionId);
        if (userSessionSet.size === 0) {
          this.userSessions.delete(userId);
        }
      }

      // Notify listeners
      this.notifyListeners(sessionId, {
        type: 'user_left',
        user,
        timestamp: Date.now(),
      });

      // Delete session if empty and not the creator's session
      if (session.participants.length === 0 && session.createdBy !== userId) {
        this.sessions.delete(sessionId);
        this.changeListeners.delete(sessionId);
      }
    }
  }

  /**
   * Apply a code change to the session
   */
  async applyChange(sessionId: string, userId: string, changeData: {
    type: 'insert' | 'delete' | 'replace';
    position: { line: number; column: number };
    content: string;
    metadata?: any;
  }): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const user = session.participants.find(p => p.id === userId);
    if (!user) {
      return false;
    }

    const change: Change = {
      id: randomUUID(),
      userId,
      timestamp: Date.now(),
      ...changeData,
    };

    session.changes.push(change);
    session.lastActivity = Date.now();

    // Keep only last 1000 changes to prevent memory issues
    if (session.changes.length > 1000) {
      session.changes = session.changes.slice(-1000);
    }

    // Notify listeners
    this.notifyListeners(sessionId, {
      type: 'code_change',
      change,
      user,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Update user cursor position
   */
  updateCursor(sessionId: string, userId: string, cursor: User['cursor']): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const user = session.participants.find(p => p.id === userId);
    if (!user) {
      return;
    }

    user.cursor = cursor;
    user.lastSeen = Date.now();
    session.lastActivity = Date.now();

    // Notify listeners
    this.notifyListeners(sessionId, {
      type: 'cursor_update',
      userId,
      cursor,
      timestamp: Date.now(),
    });
  }

  /**
   * Share AI generation with the team
   */
  async shareAIGeneration(sessionId: string, userId: string, generation: {
    type: 'code' | 'suggestion' | 'completion';
    content: string;
    context: {
      prompt: string;
      model: string;
      language?: string;
      framework?: string;
    };
  }): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.settings.allowAISharing) {
      return;
    }

    const user = session.participants.find(p => p.id === userId);
    if (!user) {
      return;
    }

    const aiGeneration: AIGeneration = {
      id: randomUUID(),
      userId,
      timestamp: Date.now(),
      approved: !session.settings.requireApproval,
      ...generation,
    };

    session.aiGenerations.push(aiGeneration);
    session.lastActivity = Date.now();

    // Keep only last 100 AI generations
    if (session.aiGenerations.length > 100) {
      session.aiGenerations = session.aiGenerations.slice(-100);
    }

    // Notify listeners
    this.notifyListeners(sessionId, {
      type: 'ai_generation_shared',
      generation: aiGeneration,
      user,
      timestamp: Date.now(),
    });
  }

  /**
   * Get session information
   */
  getSession(sessionId: string): CollaborationSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get change history for a session
   */
  getChangeHistory(sessionId: string, fromTimestamp?: number): Change[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    if (fromTimestamp) {
      return session.changes.filter(change => change.timestamp >= fromTimestamp);
    }

    return [...session.changes];
  }

  /**
   * Get collaboration statistics
   */
  getStats(): {
    activeSessions: number;
    totalParticipants: number;
    totalChanges: number;
    totalAIGenerations: number;
    averageSessionSize: number;
  } {
    let totalParticipants = 0;
    let totalChanges = 0;
    let totalAIGenerations = 0;

    for (const session of this.sessions.values()) {
      totalParticipants += session.participants.length;
      totalChanges += session.changes.length;
      totalAIGenerations += session.aiGenerations.length;
    }

    return {
      activeSessions: this.sessions.size,
      totalParticipants,
      totalChanges,
      totalAIGenerations,
      averageSessionSize: this.sessions.size > 0 ? totalParticipants / this.sessions.size : 0,
    };
  }

  /**
   * Get all sessions for a user
   */
  getUserSessions(userId: string): CollaborationSession[] {
    const sessionIds = this.userSessions.get(userId) || new Set();
    return Array.from(sessionIds)
      .map(id => this.sessions.get(id))
      .filter(Boolean) as CollaborationSession[];
  }

  /**
   * Add a listener for session events
   */
  addListener(sessionId: string, listener: Function): void {
    if (!this.changeListeners.has(sessionId)) {
      this.changeListeners.set(sessionId, new Set());
    }
    this.changeListeners.get(sessionId)!.add(listener);
  }

  /**
   * Remove a listener for session events
   */
  removeListener(sessionId: string, listener: Function): void {
    const listeners = this.changeListeners.get(sessionId);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Notify all listeners of a session event
   */
  private notifyListeners(sessionId: string, event: any): void {
    const listeners = this.changeListeners.get(sessionId);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in collaboration listener:', error);
        }
      });
    }
  }

  /**
   * Clean up inactive sessions
   */
  private cleanupInactiveSessions(): void {
    const now = Date.now();
    const sessionsToDelete: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      // Remove inactive participants
      session.participants = session.participants.filter(
        participant => now - participant.lastSeen < this.sessionTimeout
      );

      // Delete empty sessions or sessions with no activity
      if (
        session.participants.length === 0 ||
        now - session.lastActivity > this.sessionTimeout
      ) {
        sessionsToDelete.push(sessionId);
      }
    }

    // Clean up sessions
    sessionsToDelete.forEach(sessionId => {
      this.sessions.delete(sessionId);
      this.changeListeners.delete(sessionId);
    });

    // Clean up user session tracking
    for (const [userId, sessionIds] of this.userSessions.entries()) {
      sessionsToDelete.forEach(sessionId => sessionIds.delete(sessionId));
      if (sessionIds.size === 0) {
        this.userSessions.delete(userId);
      }
    }

    if (sessionsToDelete.length > 0) {
      console.log(`Cleaned up ${sessionsToDelete.length} inactive collaboration sessions`);
    }
  }
}

// Export singleton instance
export const collaborationEngine = new CollaborationEngine();

// Types are already exported above with their declarations