/**
 * Session Management for Unified Auth
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { UserSession, AuthConfig, Platform } from './types';

export class SessionManager {
  private sessionsFile: string;
  private currentSession: UserSession | null = null;
  
  constructor(private config: AuthConfig) {
    this.sessionsFile = join(homedir(), '.recoder', 'sessions.json');
  }

  /**
   * Create a new user session
   */
  async createSession(session: UserSession): Promise<void> {
    try {
      // Store current session in memory
      this.currentSession = session;
      
      // Store session persistently
      await this.persistSession(session);
      
      console.log(`Session created for ${session.email} on ${session.platform}`);
    } catch (error) {
      console.error('Failed to create session:', error);
      throw new Error('Session creation failed');
    }
  }

  /**
   * Get current active session
   */
  async getCurrentSession(): Promise<UserSession | null> {
    if (this.currentSession && this.isSessionActive(this.currentSession)) {
      return this.currentSession;
    }

    // Try to load from persistent storage
    try {
      const sessions = await this.loadSessions();
      const activeSession = sessions.find(s => 
        s.platform === this.config.platform && 
        s.isActive && 
        this.isSessionActive(s)
      );

      if (activeSession) {
        this.currentSession = activeSession;
        return activeSession;
      }
    } catch (error) {
      console.error('Failed to load current session:', error);
    }

    return null;
  }

  /**
   * Update existing session
   */
  async updateSession(session: UserSession): Promise<void> {
    try {
      this.currentSession = session;
      await this.persistSession(session);
    } catch (error) {
      console.error('Failed to update session:', error);
      throw new Error('Session update failed');
    }
  }

  /**
   * End user session
   */
  async endSession(sessionId: string): Promise<void> {
    try {
      const sessions = await this.loadSessions();
      const sessionIndex = sessions.findIndex(s => s.id === sessionId);
      
      if (sessionIndex >= 0) {
        sessions[sessionIndex].isActive = false;
        await this.saveSessions(sessions);
      }

      if (this.currentSession?.id === sessionId) {
        this.currentSession = null;
      }

      console.log(`Session ${sessionId} ended`);
    } catch (error) {
      console.error('Failed to end session:', error);
      throw new Error('Session termination failed');
    }
  }

  /**
   * Get all sessions for current user
   */
  async getUserSessions(userId: string): Promise<UserSession[]> {
    try {
      const sessions = await this.loadSessions();
      return sessions.filter(s => s.userId === userId);
    } catch (error) {
      console.error('Failed to get user sessions:', error);
      return [];
    }
  }

  /**
   * Get sessions by platform
   */
  async getSessionsByPlatform(platform: Platform): Promise<UserSession[]> {
    try {
      const sessions = await this.loadSessions();
      return sessions.filter(s => s.platform === platform && s.isActive);
    } catch (error) {
      console.error('Failed to get platform sessions:', error);
      return [];
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    try {
      const sessions = await this.loadSessions();
      const activeSessions = sessions.filter(s => this.isSessionActive(s));
      
      if (activeSessions.length !== sessions.length) {
        await this.saveSessions(activeSessions);
        console.log(`Cleaned up ${sessions.length - activeSessions.length} expired sessions`);
      }
    } catch (error) {
      console.error('Failed to cleanup expired sessions:', error);
    }
  }

  /**
   * Check if session is active and not expired
   */
  private isSessionActive(session: UserSession): boolean {
    return session.isActive && new Date() < session.expiresAt;
  }

  /**
   * Persist session to storage
   */
  private async persistSession(session: UserSession): Promise<void> {
    try {
      const sessions = await this.loadSessions();
      
      // Remove any existing session for this user on this platform
      const filteredSessions = sessions.filter(s => 
        !(s.userId === session.userId && s.platform === session.platform)
      );
      
      // Add the new session
      filteredSessions.push(session);
      
      await this.saveSessions(filteredSessions);
    } catch (error) {
      console.error('Failed to persist session:', error);
      throw error;
    }
  }

  /**
   * Load sessions from persistent storage
   */
  private async loadSessions(): Promise<UserSession[]> {
    try {
      // Ensure config directory exists
      const configDir = join(homedir(), '.recoder');
      await fs.mkdir(configDir, { recursive: true });

      const data = await fs.readFile(this.sessionsFile, 'utf8');
      const sessionsData = JSON.parse(data);
      
      // Convert date strings back to Date objects
      return sessionsData.map((s: any) => ({
        ...s,
        createdAt: new Date(s.createdAt),
        expiresAt: new Date(s.expiresAt),
      }));
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return []; // File doesn't exist yet
      }
      throw error;
    }
  }

  /**
   * Save sessions to persistent storage
   */
  private async saveSessions(sessions: UserSession[]): Promise<void> {
    try {
      const configDir = join(homedir(), '.recoder');
      await fs.mkdir(configDir, { recursive: true });

      // Convert Date objects to strings for JSON storage
      const sessionsData = sessions.map(s => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      }));

      await fs.writeFile(
        this.sessionsFile, 
        JSON.stringify(sessionsData, null, 2),
        { mode: 0o600 } // Secure permissions
      );
    } catch (error) {
      console.error('Failed to save sessions:', error);
      throw error;
    }
  }
}