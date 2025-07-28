/**
 * Backend Client Service for Recoder CLI Router
 * Connects router to the recoder.xyz backend for unified user management,
 * quota tracking, and cross-platform synchronization
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface UserSession {
  userId: string;
  token: string;
  email: string;
  plan: 'free' | 'pro' | 'enterprise';
  quotas: {
    totalRequests: number;
    usedRequests: number;
    resetDate: string;
  };
  platforms: {
    cli: boolean;
    web: boolean;
    extension: boolean;
    router: boolean;
  };
}

export interface RequestUsage {
  platform: 'cli' | 'web' | 'extension' | 'router';
  command: string;
  tokens: number;
  model: string;
  timestamp: Date;
}

export class RouterBackendClient {
  private baseUrl: string;
  private sessionFile: string;
  private currentSession: UserSession | null = null;

  constructor() {
    this.baseUrl = process.env.RECODER_BACKEND_URL || 'http://localhost:3001';
    this.sessionFile = join(homedir(), '.recoder', 'session.json');
    
    // Load existing session
    this.loadSession();
  }

  /**
   * Check if backend is available
   */
  async isBackendAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'recoder-router/1.0.0'
        },
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch (error) {
      console.warn('Backend not available, running in offline mode');
      return false;
    }
  }

  /**
   * Load session from local file
   */
  private async loadSession(): Promise<void> {
    try {
      if (existsSync(this.sessionFile)) {
        const sessionData = await readFile(this.sessionFile, 'utf-8');
        this.currentSession = JSON.parse(sessionData);
        console.log('✅ User session loaded');
      }
    } catch (error) {
      console.warn('Could not load session file');
    }
  }

  /**
   * Save session to local file
   */
  private async saveSession(): Promise<void> {
    try {
      if (this.currentSession) {
        const sessionDir = join(homedir(), '.recoder');
        if (!existsSync(sessionDir)) {
          await mkdir(sessionDir, { recursive: true });
        }
        await writeFile(this.sessionFile, JSON.stringify(this.currentSession, null, 2));
      }
    } catch (error) {
      console.error('Could not save session file:', error);
    }
  }

  /**
   * Authenticate user with email/password or token
   */
  async authenticate(credentials: { email: string; password: string } | { token: string }): Promise<UserSession> {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'recoder-router/1.0.0'
        },
        body: JSON.stringify(credentials),
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Authentication failed`);
      }

      const data = await response.json();
      this.currentSession = data.user;
      await this.saveSession();
      
      console.log(`✅ Authenticated as ${this.currentSession.email}`);
      return this.currentSession;
    } catch (error: any) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Register new user
   */
  async register(userData: { email: string; password: string; name: string }): Promise<UserSession> {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'recoder-router/1.0.0'
        },
        body: JSON.stringify(userData),
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Registration failed`);
      }

      const data = await response.json();
      this.currentSession = data.user;
      await this.saveSession();
      
      console.log(`✅ Registered and authenticated as ${this.currentSession.email}`);
      return this.currentSession;
    } catch (error: any) {
      throw new Error(`Registration failed: ${error.message}`);
    }
  }

  /**
   * Get current user session
   */
  getCurrentSession(): UserSession | null {
    return this.currentSession;
  }

  /**
   * Check user quota before making request
   */
  async checkQuota(estimatedTokens: number = 1000): Promise<boolean> {
    if (!this.currentSession) {
      console.warn('No user session - requests may be limited');
      return true; // Allow offline usage
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/user/quota`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.currentSession.token}`,
          'User-Agent': 'recoder-router/1.0.0'
        },
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        console.warn('Could not check quota, proceeding with request');
        return true;
      }

      const quota = await response.json();
      this.currentSession.quotas = quota;
      await this.saveSession();

      const available = quota.totalRequests - quota.usedRequests;
      
      if (available <= 0) {
        console.error(`❌ Quota exceeded. Used ${quota.usedRequests}/${quota.totalRequests} requests`);
        console.info(`Quota resets on ${new Date(quota.resetDate).toLocaleDateString()}`);
        return false;
      }

      if (available < 10) {
        console.warn(`⚠️ Low quota: ${available} requests remaining`);
      }

      return true;
    } catch (error: any) {
      console.warn('Could not check quota, proceeding with request');
      return true;
    }
  }

  /**
   * Track request usage across platforms
   */
  async trackUsage(usage: RequestUsage): Promise<void> {
    if (!this.currentSession) {
      return; // Skip tracking if no session
    }

    try {
      await fetch(`${this.baseUrl}/api/user/usage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.currentSession.token}`,
          'User-Agent': 'recoder-router/1.0.0'
        },
        body: JSON.stringify({
          userId: this.currentSession.userId,
          platform: usage.platform,
          command: usage.command,
          tokens: usage.tokens,
          model: usage.model,
          timestamp: usage.timestamp
        }),
        signal: AbortSignal.timeout(15000)
      });

      // Update local quota
      if (this.currentSession.quotas) {
        this.currentSession.quotas.usedRequests += 1;
        await this.saveSession();
      }

      console.debug(`📊 Tracked usage: ${usage.platform} - ${usage.command}`);
    } catch (error) {
      console.warn('Could not track usage to backend');
    }
  }

  /**
   * Sync session across platforms
   */
  async syncSession(): Promise<UserSession | null> {
    if (!this.currentSession) {
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/user/session`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.currentSession.token}`,
          'User-Agent': 'recoder-router/1.0.0'
        },
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        console.warn('Could not sync session');
        return this.currentSession;
      }

      const data = await response.json();
      this.currentSession = { ...this.currentSession, ...data };
      await this.saveSession();
      
      console.info('🔄 Session synced across platforms');
      return this.currentSession;
    } catch (error) {
      console.warn('Could not sync session');
      return this.currentSession;
    }
  }

  /**
   * Update platform status (mark router as active)
   */
  async updatePlatformStatus(platform: 'cli' | 'web' | 'extension' | 'router', active: boolean): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    try {
      await fetch(`${this.baseUrl}/api/user/platforms`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.currentSession.token}`,
          'User-Agent': 'recoder-router/1.0.0'
        },
        body: JSON.stringify({
          platform,
          active,
          lastUsed: new Date()
        }),
        signal: AbortSignal.timeout(15000)
      });

      if (this.currentSession.platforms) {
        this.currentSession.platforms[platform] = active;
        await this.saveSession();
      }
    } catch (error) {
      console.warn('Could not update platform status');
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      if (this.currentSession) {
        await fetch(`${this.baseUrl}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.currentSession.token}`,
            'User-Agent': 'recoder-router/1.0.0'
          },
          signal: AbortSignal.timeout(15000)
        });
      }
    } catch (error) {
      // Ignore logout errors
    } finally {
      this.currentSession = null;
      if (existsSync(this.sessionFile)) {
        const fs = await import('fs/promises');
        await fs.unlink(this.sessionFile);
      }
      console.info('👋 Logged out successfully');
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.currentSession !== null;
  }

  /**
   * Get platform connection status
   */
  getPlatformStatus(): { cli: boolean; web: boolean; extension: boolean; router: boolean } {
    return this.currentSession?.platforms || {
      cli: false,
      web: false,
      extension: false,
      router: true
    };
  }

  /**
   * Get formatted session info for logging
   */
  getSessionInfo(): string {
    if (!this.currentSession) {
      return 'Not authenticated';
    }

    const quotaPercentage = Math.round((this.currentSession.quotas.usedRequests / this.currentSession.quotas.totalRequests) * 100);
    const platformStatus = Object.entries(this.currentSession.platforms)
      .map(([platform, connected]) => `${platform}:${connected ? '✅' : '❌'}`)
      .join(', ');

    return [
      `📧 ${this.currentSession.email} (${this.currentSession.plan})`,
      `📊 Quota: ${this.currentSession.quotas.usedRequests}/${this.currentSession.quotas.totalRequests} (${quotaPercentage}%)`,
      `🌐 Platforms: ${platformStatus}`
    ].join(' | ');
  }

  /**
   * Process LLM request with quota checking and usage tracking
   */
  async processRequest(prompt: string, model: string, command: string = 'code'): Promise<{ allowed: boolean; sessionInfo?: string }> {
    const sessionInfo = this.getSessionInfo();
    
    // Check quota if authenticated
    if (this.isAuthenticated()) {
      const hasQuota = await this.checkQuota();
      if (!hasQuota) {
        return { 
          allowed: false, 
          sessionInfo: `❌ Quota exceeded - ${sessionInfo}` 
        };
      }

      // Track usage after request (this should be called after the actual LLM request)
      await this.trackUsage({
        platform: 'router',
        command,
        tokens: Math.ceil(prompt.length / 4) + 500, // Rough estimate
        model,
        timestamp: new Date()
      });
    }

    return { 
      allowed: true, 
      sessionInfo: this.isAuthenticated() ? `✅ ${sessionInfo}` : '📴 Offline mode'
    };
  }
}

// Export singleton instance for easy use
export const routerBackendClient = new RouterBackendClient();
export default routerBackendClient;