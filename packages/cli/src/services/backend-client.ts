/**
 * Enhanced Backend Client Service
 * Integrates with unified authentication system for cross-platform session management,
 * device flow authentication, API key support, and enhanced security
 */

import axios, { AxiosInstance } from 'axios';
import { Logger } from '@recoder/shared';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { unifiedSessionManager } from './unified-session-manager';

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

export interface UnifiedSession {
  userId: string;
  platform: 'web' | 'cli' | 'extension' | 'router';
  deviceId?: string;
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  expiresAt: Date;
  createdAt: Date;
  lastUsed: Date;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  metadata: Record<string, any>;
}

export interface DeviceFlowResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export interface APIKeyInfo {
  keyId: string;
  name: string;
  scopes: string[];
  restrictions: any;
  lastUsed?: Date;
  createdAt: Date;
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
  private unifiedSessionFile: string;
  private currentSession: UserSession | null = null;
  private unifiedSession: UnifiedSession | null = null;
  private deviceId: string;

  constructor() {
    // Use the web API URL for unified authentication
    this.baseUrl = process.env.RECODER_BACKEND_URL || process.env.NEXTAUTH_URL || 'http://localhost:3020';
    this.sessionFile = path.join(os.homedir(), '.recoder', 'session.json');
    this.unifiedSessionFile = path.join(os.homedir(), '.recoder', 'unified-session.json');
    this.deviceId = this.getOrCreateDeviceId();
    
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
      // Prefer unified session token over legacy session
      if (this.unifiedSession?.accessToken) {
        config.headers.Authorization = `Bearer ${this.unifiedSession.accessToken}`;
      } else if (this.currentSession?.token) {
        config.headers.Authorization = `Bearer ${this.currentSession.token}`;
      }
      return config;
    });

    // Add response interceptor for token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401 && this.unifiedSession?.refreshToken) {
          try {
            await this.refreshUnifiedSession();
            // Retry the original request
            return this.client.request(error.config);
          } catch (refreshError) {
            Logger.warn('Token refresh failed, user needs to re-authenticate');
            this.clearUnifiedSession();
          }
        }
        return Promise.reject(error);
      }
    );

    // Load existing sessions
    this.loadSession();
    this.loadUnifiedSession();
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

      // Try to restore unified session if available
      const unifiedSession = await unifiedSessionManager.restoreSession();
      if (unifiedSession) {
        Logger.info('🔄 Unified session restored');
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

  // ========================================
  // ENHANCED ANALYTICS METHODS
  // ========================================

  /**
   * Start analytics session
   */
  async startAnalyticsSession(): Promise<string | null> {
    try {
      const session = this.getSession();
      if (!session) {
        return null;
      }

      const deviceInfo = this.getDeviceInfo();
      const sessionData = {
        userId: session.userId,
        deviceId: this.getDeviceId(),
        platform: 'cli',
        device: deviceInfo,
        metadata: {
          version: process.env.npm_package_version || '1.0.0',
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          timestamp: new Date().toISOString()
        }
      };

      const response = await this.client.post('/api/analytics/session/start', sessionData);
      return response.data.sessionId;
    } catch (error) {
      Logger.warn('Failed to start analytics session:', error);
      return null;
    }
  }

  /**
   * End analytics session
   */
  async endAnalyticsSession(sessionId: string): Promise<void> {
    try {
      await this.client.post('/api/analytics/session/end', { sessionId });
    } catch (error) {
      Logger.warn('Failed to end analytics session:', error);
    }
  }

  /**
   * Track user activity
   */
  async trackActivity(activity: {
    sessionId?: string;
    userId?: string;
    type: 'page_view' | 'feature_use' | 'api_call' | 'interaction' | 'conversion' | 'error';
    category: 'navigation' | 'ai_interaction' | 'code_generation' | 'authentication' | 'settings' | 'deployment';
    action: string;
    target?: string;
    properties?: Record<string, any>;
  }): Promise<void> {
    try {
      const session = this.getSession();
      const activityData = {
        ...activity,
        userId: activity.userId || session?.userId,
        timestamp: new Date()
      };

      await this.client.post('/api/analytics/activity', activityData);
    } catch (error) {
      Logger.warn('Failed to track activity:', error);
    }
  }

  /**
   * Track feature usage
   */
  async trackFeatureUsage(feature: {
    featureName: string;
    context?: string;
    sessionId?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      const session = this.getSession();
      const featureData = {
        userId: session?.userId,
        platform: 'cli',
        ...feature,
        metadata: {
          ...feature.metadata,
          timestamp: new Date().toISOString(),
          version: process.env.npm_package_version || '1.0.0'
        }
      };

      await this.client.post('/api/analytics/feature', featureData);
    } catch (error) {
      Logger.warn('Failed to track feature usage:', error);
    }
  }

  /**
   * Track AI usage
   */
  async trackAIUsage(aiUsage: {
    model: string;
    provider: string;
    prompt?: {
      length: number;
      type: string;
    };
    completion?: {
      length: number;
      responseTime: number;
      tokens: number;
    };
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      const session = this.getSession();
      const aiData = {
        userId: session?.userId,
        ...aiUsage,
        metadata: {
          ...aiUsage.metadata,
          timestamp: new Date().toISOString(),
          platform: 'cli',
          version: process.env.npm_package_version || '1.0.0'
        }
      };

      await this.client.post('/api/analytics/ai', aiData);
    } catch (error) {
      Logger.warn('Failed to track AI usage:', error);
    }
  }

  /**
   * Get device information for analytics
   */
  private getDeviceInfo() {
    return {
      type: 'server' as const,
      os: `${process.platform} ${process.arch}`,
      screen: { width: 0, height: 0 } // CLI doesn't have screen
    };
  }

  /**
   * Get device ID for analytics
   */
  private getDeviceId(): string {
    return this.deviceId;
  }

  /**
   * Get current session for analytics
   */
  private getSession() {
    return this.unifiedSession || this.currentSession;
  }

  // ========================================
  // LEGACY TRACKING METHODS
  // ========================================

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
    // Check unified session manager first, then fall back to local sessions
    const unifiedSession = unifiedSessionManager.getCurrentSession();
    return unifiedSession !== null || this.unifiedSession !== null || this.currentSession !== null;
  }

  // ========================================
  // UNIFIED AUTHENTICATION METHODS
  // ========================================

  /**
   * Get or create unique device ID for this CLI instance
   */
  private getOrCreateDeviceId(): string {
    const deviceFile = path.join(os.homedir(), '.recoder', 'device-id');
    try {
      if (fs.existsSync(deviceFile)) {
        return fs.readFileSync(deviceFile, 'utf8').trim();
      }
    } catch (error) {
      // Ignore read errors, create new device ID
    }

    const newDeviceId = crypto.randomBytes(16).toString('hex');
    try {
      fs.ensureDirSync(path.dirname(deviceFile));
      fs.writeFileSync(deviceFile, newDeviceId);
    } catch (error) {
      Logger.warn('Could not save device ID');
    }
    return newDeviceId;
  }

  /**
   * Load unified session from local file
   */
  private async loadUnifiedSession(): Promise<void> {
    try {
      if (await fs.pathExists(this.unifiedSessionFile)) {
        const sessionData = await fs.readJson(this.unifiedSessionFile);
        // Convert date strings back to Date objects
        sessionData.expiresAt = new Date(sessionData.expiresAt);
        sessionData.createdAt = new Date(sessionData.createdAt);
        sessionData.lastUsed = new Date(sessionData.lastUsed);
        
        // Check if session is still valid
        if (sessionData.expiresAt > new Date()) {
          this.unifiedSession = sessionData;
          Logger.info('✅ Unified session loaded');
        } else {
          Logger.info('🔄 Unified session expired, will attempt refresh');
          await this.refreshUnifiedSession();
        }
      }
    } catch (error) {
      Logger.warn('Could not load unified session file');
    }
  }

  /**
   * Save unified session to local file
   */
  private async saveUnifiedSession(): Promise<void> {
    try {
      if (this.unifiedSession) {
        await fs.ensureDir(path.dirname(this.unifiedSessionFile));
        await fs.writeJson(this.unifiedSessionFile, this.unifiedSession, { spaces: 2 });
      }
    } catch (error) {
      Logger.error('Could not save unified session file:', error);
    }
  }

  /**
   * Clear unified session
   */
  private async clearUnifiedSession(): Promise<void> {
    this.unifiedSession = null;
    try {
      if (await fs.pathExists(this.unifiedSessionFile)) {
        await fs.remove(this.unifiedSessionFile);
      }
    } catch (error) {
      Logger.warn('Could not remove unified session file');
    }
  }

  /**
   * Initiate device flow authentication
   */
  async initiateDeviceFlow(): Promise<DeviceFlowResponse> {
    try {
      const response = await this.client.post('/api/auth/device');
      Logger.info('🔐 Device flow initiated');
      return response.data;
    } catch (error: any) {
      throw new Error(`Device flow initiation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Poll device authorization status
   */
  async pollDeviceAuthorization(deviceCode: string): Promise<{
    status: 'pending' | 'authorized' | 'denied' | 'expired';
    accessToken?: string;
    refreshToken?: string;
  }> {
    try {
      const response = await this.client.get(`/api/auth/device?device_code=${deviceCode}`);
      
      if (response.data.status === 'authorized') {
        // Store the unified session
        this.unifiedSession = {
          userId: response.data.userId || 'unknown',
          platform: 'cli',
          deviceId: this.deviceId,
          accessToken: response.data.accessToken,
          refreshToken: response.data.refreshToken,
          scopes: response.data.scopes || ['basic'],
          expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
          createdAt: new Date(),
          lastUsed: new Date(),
          riskLevel: 'low',
          metadata: {}
        };
        
        await this.saveUnifiedSession();
        Logger.info('✅ Device authorized and session stored');
      }
      
      return response.data;
    } catch (error: any) {
      throw new Error(`Device authorization polling failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Authenticate with API key
   */
  async authenticateWithAPIKey(apiKey: string): Promise<boolean> {
    try {
      const response = await this.client.post('/api/auth/validate', { apiKey });
      
      if (response.data.valid) {
        // Create a minimal unified session for API key auth
        this.unifiedSession = {
          userId: response.data.userId,
          platform: 'cli',
          deviceId: this.deviceId,
          accessToken: apiKey, // Use API key as access token
          refreshToken: '', // API keys don't have refresh tokens
          scopes: response.data.scopes || ['basic'],
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year for API keys
          createdAt: new Date(),
          lastUsed: new Date(),
          riskLevel: 'low',
          metadata: { type: 'api_key' }
        };
        
        await this.saveUnifiedSession();
        Logger.info('✅ Authenticated with API key');
        return true;
      }
      
      return false;
    } catch (error: any) {
      throw new Error(`API key authentication failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Refresh unified session using refresh token
   */
  async refreshUnifiedSession(): Promise<boolean> {
    if (!this.unifiedSession?.refreshToken) {
      return false;
    }

    try {
      const response = await this.client.put('/api/auth/validate', {
        refreshToken: this.unifiedSession.refreshToken
      });

      if (response.data.accessToken) {
        this.unifiedSession.accessToken = response.data.accessToken;
        this.unifiedSession.refreshToken = response.data.refreshToken;
        this.unifiedSession.expiresAt = new Date(response.data.expiresAt);
        this.unifiedSession.lastUsed = new Date();

        await this.saveUnifiedSession();
        Logger.info('🔄 Unified session refreshed');
        return true;
      }

      return false;
    } catch (error) {
      Logger.warn('Could not refresh unified session');
      return false;
    }
  }

  /**
   * Generate API key for user
   */
  async generateAPIKey(options: {
    scopes?: string[];
    restrictions?: any;
    name?: string;
  } = {}): Promise<{ keyId: string; apiKey: string }> {
    try {
      const response = await this.client.post('/api/auth/unified', options);
      Logger.info(`🔑 API key generated: ${response.data.keyId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(`API key generation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get user's API keys
   */
  async getAPIKeys(): Promise<APIKeyInfo[]> {
    try {
      const response = await this.client.get('/api/auth/unified');
      return response.data.apiKeys || [];
    } catch (error: any) {
      throw new Error(`Failed to fetch API keys: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Revoke API key
   */
  async revokeAPIKey(keyId: string): Promise<boolean> {
    try {
      await this.client.delete(`/api/auth/unified?keyId=${keyId}`);
      Logger.info(`🗑️ API key revoked: ${keyId}`);
      return true;
    } catch (error: any) {
      throw new Error(`API key revocation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get current unified session
   */
  getUnifiedSession(): UnifiedSession | null {
    return this.unifiedSession;
  }

  /**
   * Get all active sessions for user
   */
  async getActiveSessions(): Promise<UnifiedSession[]> {
    try {
      const response = await this.client.get('/api/user/sessions');
      return response.data.sessions || [];
    } catch (error) {
      Logger.warn('Could not fetch active sessions');
      return [];
    }
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(deviceId: string): Promise<boolean> {
    try {
      await this.client.delete(`/api/user/sessions/${deviceId}`);
      
      // If we're revoking our own session, clear it locally
      if (deviceId === this.deviceId) {
        await this.clearUnifiedSession();
      }
      
      Logger.info(`🗑️ Session revoked: ${deviceId}`);
      return true;
    } catch (error: any) {
      throw new Error(`Session revocation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Enhanced logout with session cleanup
   */
  async logoutUnified(): Promise<void> {
    try {
      // Revoke current session on server
      if (this.unifiedSession?.deviceId) {
        await this.revokeSession(this.unifiedSession.deviceId);
      }
    } catch (error) {
      // Continue with local cleanup even if server request fails
      Logger.warn('Could not revoke session on server, cleaning up locally');
    } finally {
      await this.clearUnifiedSession();
      this.currentSession = null;
      if (await fs.pathExists(this.sessionFile)) {
        await fs.remove(this.sessionFile);
      }
      Logger.info('👋 Logged out successfully');
    }
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

  /**
   * Make AI request through recoder.xyz backend (like Claude Code)
   * This routes all AI requests through our infrastructure
   */
  async makeAIRequest(request: {
    messages: Array<{ role: string; content: string }>;
    type: string;
    options: any;
  }): Promise<{
    content: string;
    model: string;
    usage: { inputTokens: number; outputTokens: number; cost: number };
    provider: string;
  }> {
    if (!this.currentSession) {
      throw new Error('Authentication required');
    }

    try {
      const response = await this.client.post('/api/ai/chat', {
        messages: request.messages,
        type: request.type,
        options: request.options,
        userId: this.currentSession.userId
      }, {
        headers: {
          'Authorization': `Bearer ${this.currentSession.token}`
        }
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        // Token expired, clear session
        await this.clearUnifiedSession();
        this.currentSession = null;
      }
      throw error;
    }
  }
}

// Export singleton instance
export const backendClient = new BackendClient();
export default backendClient;