/**
 * Backend Client Service
 * Connects CLI to the recoder.xyz backend for unified user management,
 * quota tracking, and cross-platform synchronization
 */

import axios, { AxiosInstance } from 'axios';
import { Logger } from '@recoder/shared';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

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

export class BackendClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private sessionFile: string;
  private currentSession: UserSession | null = null;

  constructor() {
    this.baseUrl = process.env.RECODER_BACKEND_URL || 'http://localhost:3001';
    this.sessionFile = path.join(os.homedir(), '.recoder', 'session.json');
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'recoder-cli/1.0.0'
      }
    });

    // Add auth interceptor
    this.client.interceptors.request.use((config) => {
      if (this.currentSession?.token) {
        config.headers.Authorization = `Bearer ${this.currentSession.token}`;
      }
      return config;
    });

    // Load existing session
    this.loadSession();
  }

  /**
   * Check if backend is available
   */
  async isBackendAvailable(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      Logger.warn('Backend not available, running in offline mode');
      return false;
    }
  }

  /**
   * Load session from local file
   */
  private async loadSession(): Promise<void> {
    try {
      if (await fs.pathExists(this.sessionFile)) {
        const sessionData = await fs.readJson(this.sessionFile);
        this.currentSession = sessionData;
        Logger.info('✅ User session loaded');
      }
    } catch (error) {
      Logger.warn('Could not load session file');
    }
  }

  /**
   * Save session to local file
   */
  private async saveSession(): Promise<void> {
    try {
      if (this.currentSession) {
        await fs.ensureDir(path.dirname(this.sessionFile));
        await fs.writeJson(this.sessionFile, this.currentSession, { spaces: 2 });
      }
    } catch (error) {
      Logger.error('Could not save session file:', error);
    }
  }

  /**
   * Authenticate user with email/password or token
   */
  async authenticate(credentials: { email: string; password: string } | { token: string }): Promise<UserSession> {
    try {
      const response = await this.client.post('/api/auth/login', credentials);
      this.currentSession = response.data.user;
      await this.saveSession();
      
      Logger.info(`✅ Authenticated as ${this.currentSession?.email}`);
      return this.currentSession!;
    } catch (error: any) {
      throw new Error(`Authentication failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Register new user
   */
  async register(userData: { email: string; password: string; name: string }): Promise<UserSession> {
    try {
      const response = await this.client.post('/api/auth/register', userData);
      this.currentSession = response.data.user;
      await this.saveSession();
      
      Logger.info(`✅ Registered and authenticated as ${this.currentSession?.email}`);
      return this.currentSession!;
    } catch (error: any) {
      throw new Error(`Registration failed: ${error.response?.data?.message || error.message}`);
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
      Logger.warn('No user session - requests may be limited');
      return true; // Allow offline usage
    }

    try {
      const response = await this.client.get('/api/user/quota');
      const quota = response.data;
      
      this.currentSession.quotas = quota;
      await this.saveSession();

      const available = quota.totalRequests - quota.usedRequests;
      
      if (available <= 0) {
        Logger.error(`❌ Quota exceeded. Used ${quota.usedRequests}/${quota.totalRequests} requests`);
        Logger.info(`Quota resets on ${new Date(quota.resetDate).toLocaleDateString()}`);
        return false;
      }

      if (available < 10) {
        Logger.warn(`⚠️ Low quota: ${available} requests remaining`);
      }

      return true;
    } catch (error: any) {
      Logger.warn('Could not check quota, proceeding with request');
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
      await this.client.post('/api/user/usage', {
        userId: this.currentSession.userId,
        platform: usage.platform,
        command: usage.command,
        tokens: usage.tokens,
        model: usage.model,
        timestamp: usage.timestamp
      });

      // Update local quota
      if (this.currentSession.quotas) {
        this.currentSession.quotas.usedRequests += 1;
        await this.saveSession();
      }

      Logger.debug(`📊 Tracked usage: ${usage.platform} - ${usage.command}`);
    } catch (error) {
      Logger.warn('Could not track usage to backend');
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
      const response = await this.client.get('/api/user/session');
      this.currentSession = { ...this.currentSession, ...response.data };
      await this.saveSession();
      
      Logger.info('🔄 Session synced across platforms');
      return this.currentSession;
    } catch (error) {
      Logger.warn('Could not sync session');
      return this.currentSession;
    }
  }

  /**
   * Get user's project history
   */
  async getProjectHistory(): Promise<any[]> {
    if (!this.currentSession) {
      return [];
    }

    try {
      const response = await this.client.get('/api/user/projects');
      return response.data.projects || [];
    } catch (error) {
      Logger.warn('Could not load project history');
      return [];
    }
  }

  /**
   * Save generated project to backend
   */
  async saveProject(project: {
    name: string;
    description: string;
    type: string;
    files: Array<{ path: string; content: string }>;
    metadata: any;
  }): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    try {
      await this.client.post('/api/user/projects', {
        userId: this.currentSession.userId,
        platform: 'cli',
        ...project
      });
      
      Logger.info(`💾 Project "${project.name}" saved to backend`);
    } catch (error) {
      Logger.warn('Could not save project to backend');
    }
  }

  /**
   * Get analytics and usage stats
   */
  async getAnalytics(): Promise<any> {
    if (!this.currentSession) {
      return {};
    }

    try {
      const response = await this.client.get('/api/user/analytics');
      return response.data;
    } catch (error) {
      Logger.warn('Could not load analytics');
      return {};
    }
  }

  /**
   * Update platform status (mark CLI as active)
   */
  async updatePlatformStatus(platform: 'cli' | 'web' | 'extension' | 'router', active: boolean): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    try {
      await this.client.patch('/api/user/platforms', {
        platform,
        active,
        lastUsed: new Date()
      });

      if (this.currentSession.platforms) {
        this.currentSession.platforms[platform] = active;
        await this.saveSession();
      }
    } catch (error) {
      Logger.warn('Could not update platform status');
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      if (this.currentSession) {
        await this.client.post('/api/auth/logout');
      }
    } catch (error) {
      // Ignore logout errors
    } finally {
      this.currentSession = null;
      if (await fs.pathExists(this.sessionFile)) {
        await fs.remove(this.sessionFile);
      }
      Logger.info('👋 Logged out successfully');
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
      cli: true,
      web: false,
      extension: false,
      router: false
    };
  }
}

// Export singleton instance
export const backendClient = new BackendClient();
export default backendClient;