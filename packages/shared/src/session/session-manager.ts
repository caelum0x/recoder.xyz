/**
 * Cross-Platform Session Manager for Recoder.xyz Ecosystem
 * 
 * Enables session sharing between CLI, Web Platform, and VS Code Extension
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import chokidar from 'chokidar';

export interface SessionMessage {
  id: string;
  timestamp: number;
  platform: 'cli' | 'web' | 'extension';
  type: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    provider?: string;
    model?: string;
    tokens?: number;
    confidence?: number;
    project?: string;
    language?: string;
  };
}

export interface SessionContext {
  projectPath?: string;
  workingDirectory?: string;
  openFiles?: Array<{
    path: string;
    content: string;
    language: string;
  }>;
  gitBranch?: string;
  packageManager?: string;
  framework?: string;
  dependencies?: Record<string, string>;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  platform: 'cli' | 'web' | 'extension';
  messages: SessionMessage[];
  context: SessionContext;
  metadata: {
    totalTokens: number;
    aiProviders: string[];
    codeGenerated: number;
    filesModified: string[];
  };
}

export class SessionManager extends EventEmitter {
  private static instance: SessionManager;
  private sessions: Map<string, Session> = new Map();
  private currentSessionId?: string;
  private sessionDir: string;
  private platform: 'cli' | 'web' | 'extension';
  private watchMode: boolean = false;

  private constructor(platform: 'cli' | 'web' | 'extension') {
    super();
    this.platform = platform;
    this.sessionDir = this.getSessionDirectory();
    this.loadSessions();
    this.setupFileWatcher();
  }

  static getInstance(platform: 'cli' | 'web' | 'extension'): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager(platform);
    }
    return SessionManager.instance;
  }

  /**
   * Get the session storage directory
   */
  private getSessionDirectory(): string {
    const homeDir = os.homedir();
    const sessionDir = path.join(homeDir, '.recoder', 'sessions');
    
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    
    return sessionDir;
  }

  /**
   * Setup file watcher for cross-platform synchronization
   */
  private setupFileWatcher(): void {
    if (this.watchMode) {
      try {
        const watcher = chokidar.watch(this.sessionDir, {
          ignored: /^\./, 
          persistent: true
        });

        watcher.on('change', (filePath: string) => {
          if (filePath.endsWith('.json')) {
            this.handleSessionFileChange(filePath);
          }
        });

        watcher.on('add', (filePath: string) => {
          if (filePath.endsWith('.json')) {
            this.handleSessionFileChange(filePath);
          }
        });
      } catch (error) {
        console.warn('File watching not available, cross-platform sync disabled');
      }
    }
  }

  /**
   * Handle session file changes from other platforms
   */
  private handleSessionFileChange(filePath: string): void {
    try {
      const sessionData = fs.readFileSync(filePath, 'utf8');
      const session: Session = JSON.parse(sessionData);
      
      // Only sync if the session was modified by another platform
      if (session.platform !== this.platform) {
        this.sessions.set(session.id, session);
        this.emit('sessionUpdated', session);
      }
    } catch (error) {
      console.warn('Failed to sync session:', error);
    }
  }

  /**
   * Load all sessions from disk
   */
  private loadSessions(): void {
    try {
      const sessionFiles = fs.readdirSync(this.sessionDir)
        .filter(file => file.endsWith('.json'));

      for (const file of sessionFiles) {
        try {
          const sessionPath = path.join(this.sessionDir, file);
          const sessionData = fs.readFileSync(sessionPath, 'utf8');
          const session: Session = JSON.parse(sessionData);
          this.sessions.set(session.id, session);
        } catch (error) {
          console.warn(`Failed to load session ${file}:`, error);
        }
      }
    } catch (error) {
      console.warn('Failed to load sessions:', error);
    }
  }

  /**
   * Save a session to disk
   */
  private saveSession(session: Session): void {
    try {
      const sessionPath = path.join(this.sessionDir, `${session.id}.json`);
      const sessionData = JSON.stringify(session, null, 2);
      fs.writeFileSync(sessionPath, sessionData, 'utf8');
    } catch (error) {
      console.error('Failed to save session:', error);
      throw new Error('Unable to save session');
    }
  }

  /**
   * Create a new session
   */
  createSession(title: string, context?: SessionContext): Session {
    const session: Session = {
      id: this.generateSessionId(),
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      platform: this.platform,
      messages: [],
      context: context || {},
      metadata: {
        totalTokens: 0,
        aiProviders: [],
        codeGenerated: 0,
        filesModified: []
      }
    };

    this.sessions.set(session.id, session);
    this.currentSessionId = session.id;
    this.saveSession(session);
    this.emit('sessionCreated', session);

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get current active session
   */
  getCurrentSession(): Session | undefined {
    if (!this.currentSessionId) {
      return undefined;
    }
    return this.sessions.get(this.currentSessionId);
  }

  /**
   * Set the current active session
   */
  setCurrentSession(sessionId: string): void {
    if (this.sessions.has(sessionId)) {
      this.currentSessionId = sessionId;
      this.emit('sessionChanged', sessionId);
    } else {
      throw new Error('Session not found');
    }
  }

  /**
   * Get all sessions
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Get sessions by platform
   */
  getSessionsByPlatform(platform: 'cli' | 'web' | 'extension'): Session[] {
    return this.getAllSessions()
      .filter(session => session.platform === platform);
  }

  /**
   * Add a message to the current session
   */
  addMessage(content: string, type: 'user' | 'assistant' | 'system', metadata?: SessionMessage['metadata']): SessionMessage {
    const currentSession = this.getCurrentSession();
    if (!currentSession) {
      throw new Error('No active session');
    }

    const message: SessionMessage = {
      id: this.generateMessageId(),
      timestamp: Date.now(),
      platform: this.platform,
      type,
      content,
      metadata
    };

    currentSession.messages.push(message);
    currentSession.updatedAt = Date.now();

    // Update metadata
    if (metadata?.tokens) {
      currentSession.metadata.totalTokens += metadata.tokens;
    }
    if (metadata?.provider && !currentSession.metadata.aiProviders.includes(metadata.provider)) {
      currentSession.metadata.aiProviders.push(metadata.provider);
    }

    this.saveSession(currentSession);
    this.emit('messageAdded', message, currentSession);

    return message;
  }

  /**
   * Update session context
   */
  updateContext(context: Partial<SessionContext>): void {
    const currentSession = this.getCurrentSession();
    if (!currentSession) {
      throw new Error('No active session');
    }

    currentSession.context = {
      ...currentSession.context,
      ...context
    };
    currentSession.updatedAt = Date.now();

    this.saveSession(currentSession);
    this.emit('contextUpdated', currentSession);
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Remove from memory
    this.sessions.delete(sessionId);

    // Remove from disk
    try {
      const sessionPath = path.join(this.sessionDir, `${sessionId}.json`);
      if (fs.existsSync(sessionPath)) {
        fs.unlinkSync(sessionPath);
      }
    } catch (error) {
      console.warn('Failed to delete session file:', error);
    }

    // Update current session if needed
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = undefined;
    }

    this.emit('sessionDeleted', sessionId);
  }

  /**
   * Export session for sharing
   */
  exportSession(sessionId: string, includeContext = true): string {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const exportData = {
      ...session,
      context: includeContext ? session.context : {}
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import session from exported data
   */
  importSession(sessionData: string): Session {
    try {
      const session: Session = JSON.parse(sessionData);
      
      // Generate new ID to avoid conflicts
      session.id = this.generateSessionId();
      session.platform = this.platform;
      session.updatedAt = Date.now();

      this.sessions.set(session.id, session);
      this.saveSession(session);
      this.emit('sessionImported', session);

      return session;
    } catch (error) {
      throw new Error('Invalid session data format');
    }
  }

  /**
   * Search sessions by content
   */
  searchSessions(query: string): Session[] {
    const lowerQuery = query.toLowerCase();
    
    return this.getAllSessions().filter(session => {
      // Search in title
      if (session.title.toLowerCase().includes(lowerQuery)) {
        return true;
      }
      
      // Search in message content
      return session.messages.some(message => 
        message.content.toLowerCase().includes(lowerQuery)
      );
    });
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): {
    messageCount: number;
    totalTokens: number;
    aiProviders: string[];
    duration: number;
    codeBlocks: number;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const codeBlocks = session.messages.reduce((count, message) => {
      const codeMatches = message.content.match(/```/g);
      return count + (codeMatches ? codeMatches.length / 2 : 0);
    }, 0);

    return {
      messageCount: session.messages.length,
      totalTokens: session.metadata.totalTokens,
      aiProviders: session.metadata.aiProviders,
      duration: session.updatedAt - session.createdAt,
      codeBlocks: Math.floor(codeBlocks)
    };
  }

  /**
   * Enable cross-platform synchronization
   */
  enableSync(): void {
    this.watchMode = true;
    this.setupFileWatcher();
  }

  /**
   * Disable cross-platform synchronization
   */
  disableSync(): void {
    this.watchMode = false;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }

  /**
   * Clean up old sessions (older than 30 days)
   */
  cleanupOldSessions(daysToKeep = 30): number {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    const sessionsToDelete: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (session.updatedAt < cutoffTime) {
        sessionsToDelete.push(sessionId);
      }
    }

    sessionsToDelete.forEach(sessionId => {
      try {
        this.deleteSession(sessionId);
      } catch (error) {
        console.warn(`Failed to delete old session ${sessionId}:`, error);
      }
    });

    return sessionsToDelete.length;
  }
}

// Export singleton instances for each platform
export const cliSessionManager = () => SessionManager.getInstance('cli');
export const webSessionManager = () => SessionManager.getInstance('web');
export const extensionSessionManager = () => SessionManager.getInstance('extension');

export default SessionManager;
