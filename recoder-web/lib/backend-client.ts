/**
 * Backend Client Service for Recoder Web App
 * Connects web app to the recoder.xyz backend for unified user management,
 * quota tracking, and cross-platform synchronization
 */

import axios, { AxiosInstance } from 'axios';

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

export class WebBackendClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private currentSession: UserSession | null = null;

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_RECODER_BACKEND_URL || 'http://localhost:3001';
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'recoder-web/1.0.0'
      }
    });

    // Add auth interceptor
    this.client.interceptors.request.use((config) => {
      if (this.currentSession?.token) {
        config.headers.Authorization = `Bearer ${this.currentSession.token}`;
      }
      return config;
    });

    // Load session from localStorage on client side
    if (typeof window !== 'undefined') {
      this.loadSession();
    }
  }

  /**
   * Check if backend is available
   */
  async isBackendAvailable(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      console.warn('Backend not available, running in offline mode');
      return false;
    }
  }

  /**
   * Load session from localStorage (client-side only)
   */
  private loadSession(): void {
    try {
      const sessionData = localStorage.getItem('recoder-session');
      if (sessionData) {
        this.currentSession = JSON.parse(sessionData);
        console.log('✅ User session loaded from localStorage');
      }
    } catch (error) {
      console.warn('Could not load session from localStorage');
    }
  }

  /**
   * Save session to localStorage (client-side only)
   */
  private saveSession(): void {
    if (typeof window !== 'undefined' && this.currentSession) {
      try {
        localStorage.setItem('recoder-session', JSON.stringify(this.currentSession));
      } catch (error) {
        console.error('Could not save session to localStorage:', error);
      }
    }
  }

  /**
   * Authenticate user with email/password or token
   */
  async authenticate(credentials: { email: string; password: string } | { token: string }): Promise<UserSession> {
    try {
      const response = await this.client.post('/api/auth/login', credentials);
      this.currentSession = response.data.user;
      this.saveSession();
      
      console.log(`✅ Authenticated as ${this.currentSession.email}`);
      return this.currentSession;
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
      this.saveSession();
      
      console.log(`✅ Registered and authenticated as ${this.currentSession.email}`);
      return this.currentSession;
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
      console.warn('No user session - requests may be limited');
      return true; // Allow offline usage
    }

    try {
      const response = await this.client.get('/api/user/quota');
      const quota = response.data;
      
      this.currentSession.quotas = quota;
      this.saveSession();

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
        this.saveSession();
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
      const response = await this.client.get('/api/user/session');
      this.currentSession = { ...this.currentSession, ...response.data };
      this.saveSession();
      
      console.info('🔄 Session synced across platforms');
      return this.currentSession;
    } catch (error) {
      console.warn('Could not sync session');
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
      console.warn('Could not load project history');
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
        platform: 'web',
        ...project
      });
      
      console.info(`💾 Project "${project.name}" saved to backend`);
    } catch (error) {
      console.warn('Could not save project to backend');
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
      console.warn('Could not load analytics');
      return {};
    }
  }

  /**
   * Update platform status (mark web as active)
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
        this.saveSession();
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
        await this.client.post('/api/auth/logout');
      }
    } catch (error) {
      // Ignore logout errors
    } finally {
      this.currentSession = null;
      if (typeof window !== 'undefined') {
        localStorage.removeItem('recoder-session');
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
      web: true,
      extension: false,
      router: false
    };
  }

  /**
   * Get AI completion with usage tracking
   */
  async getCompletion(prompt: string, model: string = 'default'): Promise<string> {
    // Check quota before making request
    const hasQuota = await this.checkQuota();
    if (!hasQuota) {
      throw new Error('Request quota exceeded. Please upgrade your plan or wait for reset.');
    }

    try {
      // This would integrate with your existing AI completion logic
      const response = await this.client.post('/api/ai/completion', {
        prompt,
        model,
        userId: this.currentSession?.userId
      });

      // Track usage
      if (this.currentSession) {
        await this.trackUsage({
          platform: 'web',
          command: 'completion',
          tokens: response.data.tokensUsed || 1000,
          model,
          timestamp: new Date()
        });
      }

      return response.data.completion;
    } catch (error: any) {
      throw new Error(`AI completion failed: ${error.response?.data?.message || error.message}`);
    }
  }
}

// Export singleton instance for easy use across the web app
export const webBackendClient = new WebBackendClient();
export default webBackendClient;