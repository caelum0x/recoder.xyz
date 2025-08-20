/**
 * Unified Session Management Service
 * Manages authentication sessions across web, CLI, and router platforms
 * Enables users to auth once on recoder.xyz and have seamless experience everywhere
 */
import { Logger } from '@recoder/shared';
import { backendClient } from './backend-client';
import { webCLIAuthBridge } from './web-cli-auth-bridge';
import EventEmitter from 'events';

export interface UnifiedSessionData {
  sessionId: string;
  userId: string;
  email: string;
  deviceId: string;
  platforms: {
    web: {
      active: boolean;
      lastSeen: Date;
      sessionData?: any;
    };
    cli: {
      active: boolean;
      lastSeen: Date;
      version?: string;
      sessionData?: any;
    };
    router: {
      active: boolean;
      lastSeen: Date;
      version?: string;
      sessionData?: any;
    };
    extension: {
      active: boolean;
      lastSeen: Date;
      version?: string;
      sessionData?: any;
    };
  };
  subscription: {
    plan: string;
    status: 'active' | 'cancelled' | 'past_due' | 'trialing';
    quotas: {
      used: number;
      limit: number;
      resetDate: Date;
    };
  };
  preferences: {
    defaultModel?: string;
    costOptimization: boolean;
    notifications: boolean;
  };
  security: {
    riskLevel: 'low' | 'medium' | 'high';
    lastAuthTime: Date;
    failedAttempts: number;
    lockedUntil?: Date;
  };
  metadata: {
    createdAt: Date;
    lastSync: Date;
    syncVersion: number;
  };
}

export interface SessionSyncEvent {
  type: 'session_updated' | 'platform_connected' | 'platform_disconnected' | 'quota_updated' | 'subscription_changed';
  platform: 'web' | 'cli' | 'router' | 'extension';
  userId: string;
  data: any;
  timestamp: Date;
}

export class UnifiedSessionManager extends EventEmitter {
  private logger = new Logger();
  private localSession: UnifiedSessionData | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private websocketConnection: WebSocket | null = null;

  constructor() {
    super();
    this.startBackgroundSync();
    this.setupEventHandlers();
  }

  /**
   * Initialize session from web authentication
   */
  async initializeFromWebAuth(webToken: any): Promise<UnifiedSessionData> {
    try {
      this.logger.info('🔄 Initializing unified session from web authentication');

      // Create unified session with web auth data
      const sessionData: UnifiedSessionData = {
        sessionId: this.generateSessionId(),
        userId: webToken.userId,
        email: webToken.email,
        deviceId: this.getOrCreateDeviceId(),
        platforms: {
          web: {
            active: true,
            lastSeen: new Date(),
            sessionData: { token: webToken.accessToken }
          },
          cli: {
            active: true,
            lastSeen: new Date(),
            version: this.getCLIVersion()
          },
          router: {
            active: false,
            lastSeen: new Date()
          },
          extension: {
            active: false,
            lastSeen: new Date()
          }
        },
        subscription: {
          plan: webToken.plan || 'free',
          status: 'active',
          quotas: {
            used: 0,
            limit: this.getQuotaLimit(webToken.plan),
            resetDate: this.getNextResetDate()
          }
        },
        preferences: {
          costOptimization: true,
          notifications: true
        },
        security: {
          riskLevel: 'low',
          lastAuthTime: new Date(),
          failedAttempts: 0
        },
        metadata: {
          createdAt: new Date(),
          lastSync: new Date(),
          syncVersion: 1
        }
      };

      // Sync with backend
      await this.syncWithBackend(sessionData);

      // Store locally
      this.localSession = sessionData;
      await this.persistLocalSession();

      // Start real-time sync
      this.establishWebSocketConnection();

      this.emit('session_initialized', sessionData);
      this.logger.info('✅ Unified session initialized successfully');

      return sessionData;

    } catch (error: any) {
      this.logger.error('Failed to initialize unified session:', error);
      throw error;
    }
  }

  /**
   * Restore session from local storage
   */
  async restoreSession(): Promise<UnifiedSessionData | null> {
    try {
      // Load from local storage
      const storedSession = await this.loadLocalSession();
      if (!storedSession) {
        return null;
      }

      // Validate with backend
      const isValid = await this.validateSessionWithBackend(storedSession.sessionId);
      if (!isValid) {
        await this.clearLocalSession();
        return null;
      }

      // Sync latest data from backend
      const syncedSession = await this.syncFromBackend(storedSession.sessionId);
      
      this.localSession = syncedSession || storedSession;
      this.establishWebSocketConnection();

      // Update CLI platform status
      await this.updatePlatformStatus('cli', true);

      this.emit('session_restored', this.localSession);
      return this.localSession;

    } catch (error: any) {
      this.logger.error('Failed to restore session:', error);
      return null;
    }
  }

  /**
   * Get current unified session
   */
  getCurrentSession(): UnifiedSessionData | null {
    return this.localSession;
  }

  /**
   * Update platform status (active/inactive)
   */
  async updatePlatformStatus(platform: keyof UnifiedSessionData['platforms'], active: boolean, metadata?: any): Promise<void> {
    if (!this.localSession) {
      throw new Error('No active session');
    }

    const now = new Date();
    
    this.localSession.platforms[platform] = {
      ...this.localSession.platforms[platform],
      active,
      lastSeen: now,
      ...(metadata && { sessionData: metadata })
    };

    this.localSession.metadata.lastSync = now;
    this.localSession.metadata.syncVersion++;

    // Sync with backend
    await this.syncWithBackend(this.localSession);
    await this.persistLocalSession();

    this.emit('platform_status_updated', {
      platform,
      active,
      userId: this.localSession.userId,
      timestamp: now
    });

    this.logger.info(`📱 Platform ${platform} status updated: ${active ? 'active' : 'inactive'}`);
  }

  /**
   * Update subscription data from billing changes
   */
  async updateSubscription(subscriptionData: any): Promise<void> {
    if (!this.localSession) {
      throw new Error('No active session');
    }

    this.localSession.subscription = {
      ...this.localSession.subscription,
      ...subscriptionData
    };

    this.localSession.metadata.lastSync = new Date();
    this.localSession.metadata.syncVersion++;

    await this.syncWithBackend(this.localSession);
    await this.persistLocalSession();

    this.emit('subscription_updated', subscriptionData);
  }

  /**
   * Update usage quotas
   */
  async updateQuotas(used: number, limit?: number): Promise<void> {
    if (!this.localSession) {
      throw new Error('No active session');
    }

    this.localSession.subscription.quotas.used = used;
    if (limit !== undefined) {
      this.localSession.subscription.quotas.limit = limit;
    }

    this.localSession.metadata.lastSync = new Date();
    this.localSession.metadata.syncVersion++;

    await this.syncWithBackend(this.localSession);
    await this.persistLocalSession();

    this.emit('quotas_updated', this.localSession.subscription.quotas);
  }

  /**
   * Logout from all platforms or specific platform
   */
  async logout(platforms: string[] = ['all']): Promise<void> {
    if (!this.localSession) {
      return;
    }

    try {
      const userId = this.localSession.userId;
      const sessionId = this.localSession.sessionId;

      if (platforms.includes('all')) {
        // Logout from all platforms
        this.logger.info('🚪 Logging out from all platforms');

        // Update all platform statuses to inactive
        Object.keys(this.localSession.platforms).forEach(platform => {
          (this.localSession!.platforms as any)[platform].active = false;
        });

        // Invalidate session on backend
        await this.invalidateSessionOnBackend(sessionId);

        // Clear local data
        await this.clearLocalSession();
        this.localSession = null;

        // Close WebSocket
        if (this.websocketConnection) {
          this.websocketConnection.close();
          this.websocketConnection = null;
        }

        this.emit('session_ended', { userId, platforms: 'all' });

      } else {
        // Logout from specific platforms only
        platforms.forEach(platform => {
          if (this.localSession && (this.localSession.platforms as any)[platform]) {
            (this.localSession.platforms as any)[platform].active = false;
          }
        });

        await this.syncWithBackend(this.localSession);
        await this.persistLocalSession();

        this.emit('platforms_disconnected', { userId, platforms });
      }

    } catch (error: any) {
      this.logger.error('Logout failed:', error);
      throw error;
    }
  }

  /**
   * Check if user is authenticated on any platform
   */
  isAuthenticated(): boolean {
    if (!this.localSession) {
      return false;
    }

    // Check if any platform is active
    return Object.values(this.localSession.platforms).some(platform => platform.active);
  }

  /**
   * Get platforms where user is currently active
   */
  getActivePlatforms(): string[] {
    if (!this.localSession) {
      return [];
    }

    return Object.entries(this.localSession.platforms)
      .filter(([_, platform]) => platform.active)
      .map(([name]) => name);
  }

  /**
   * Connect to router with shared session
   */
  async connectRouter(routerApiKey?: string): Promise<void> {
    if (!this.localSession) {
      throw new Error('No active session to connect router');
    }

    // Enable router in unified session
    await this.updatePlatformStatus('router', true, {
      apiKey: routerApiKey ? '***' : undefined, // Don't store full API key
      connectionTime: new Date()
    });

    this.logger.info('🔄 Router connected to unified session');
  }

  /**
   * Sync session data with backend
   */
  private async syncWithBackend(sessionData: UnifiedSessionData): Promise<void> {
    try {
      await (backendClient as any).client.put('/api/sessions/unified', {
        sessionId: sessionData.sessionId,
        sessionData: sessionData
      });
    } catch (error: any) {
      this.logger.warn('Backend sync failed:', error.message);
      // Continue working offline
    }
  }

  /**
   * Sync session from backend
   */
  private async syncFromBackend(sessionId: string): Promise<UnifiedSessionData | null> {
    try {
      const response = await (backendClient as any).client.get(`/api/sessions/unified/${sessionId}`);
      return response.data.sessionData;
    } catch (error: any) {
      this.logger.warn('Backend session sync failed:', error.message);
      return null;
    }
  }

  /**
   * Validate session with backend
   */
  private async validateSessionWithBackend(sessionId: string): Promise<boolean> {
    try {
      const response = await (backendClient as any).client.get(`/api/sessions/validate/${sessionId}`);
      return response.data.valid;
    } catch (error: any) {
      this.logger.warn('Session validation failed:', error.message);
      return false;
    }
  }

  /**
   * Invalidate session on backend
   */
  private async invalidateSessionOnBackend(sessionId: string): Promise<void> {
    try {
      await (backendClient as any).client.delete(`/api/sessions/unified/${sessionId}`);
    } catch (error: any) {
      this.logger.warn('Session invalidation failed:', error.message);
    }
  }

  /**
   * Establish WebSocket connection for real-time sync
   */
  private establishWebSocketConnection(): void {
    if (!this.localSession || this.websocketConnection) {
      return;
    }

    try {
      const wsUrl = process.env.RECODER_WS_URL || 'ws://localhost:3001';
      this.websocketConnection = new WebSocket(`${wsUrl}/ws/sessions/${this.localSession.sessionId}`);

      this.websocketConnection.onopen = () => {
        this.logger.info('📡 Real-time session sync connected');
      };

      this.websocketConnection.onmessage = (event) => {
        try {
          const syncEvent: SessionSyncEvent = JSON.parse(event.data);
          this.handleRemoteSync(syncEvent);
        } catch (error) {
          this.logger.warn('Invalid WebSocket message:', error);
        }
      };

      this.websocketConnection.onclose = () => {
        this.logger.info('📡 Real-time session sync disconnected');
        this.websocketConnection = null;
        
        // Attempt reconnect after delay
        setTimeout(() => {
          if (this.localSession) {
            this.establishWebSocketConnection();
          }
        }, 30000);
      };

    } catch (error: any) {
      this.logger.warn('Failed to establish WebSocket connection:', error.message);
    }
  }

  /**
   * Handle remote session sync events
   */
  private handleRemoteSync(event: SessionSyncEvent): void {
    if (!this.localSession || event.userId !== this.localSession.userId) {
      return;
    }

    switch (event.type) {
      case 'platform_connected':
      case 'platform_disconnected':
        this.handleRemotePlatformUpdate(event);
        break;
      case 'subscription_changed':
        this.handleRemoteSubscriptionUpdate(event);
        break;
      case 'quota_updated':
        this.handleRemoteQuotaUpdate(event);
        break;
      case 'session_updated':
        this.handleRemoteSessionUpdate(event);
        break;
    }

    this.emit('remote_sync', event);
  }

  private handleRemotePlatformUpdate(event: SessionSyncEvent): void {
    if (!this.localSession) return;

    const platform = event.platform;
    const isConnected = event.type === 'platform_connected';

    this.localSession.platforms[platform] = {
      ...this.localSession.platforms[platform],
      active: isConnected,
      lastSeen: new Date(event.timestamp),
      ...(event.data.sessionData && { sessionData: event.data.sessionData })
    };

    this.persistLocalSession();
    this.emit('platform_sync_updated', { platform, active: isConnected });
  }

  private handleRemoteSubscriptionUpdate(event: SessionSyncEvent): void {
    if (!this.localSession) return;

    this.localSession.subscription = {
      ...this.localSession.subscription,
      ...event.data
    };

    this.persistLocalSession();
    this.emit('subscription_sync_updated', event.data);
  }

  private handleRemoteQuotaUpdate(event: SessionSyncEvent): void {
    if (!this.localSession) return;

    this.localSession.subscription.quotas = {
      ...this.localSession.subscription.quotas,
      ...event.data
    };

    this.persistLocalSession();
    this.emit('quotas_sync_updated', event.data);
  }

  private handleRemoteSessionUpdate(event: SessionSyncEvent): void {
    if (!this.localSession) return;

    // Merge remote changes with local session
    this.localSession = {
      ...this.localSession,
      ...event.data,
      metadata: {
        ...this.localSession.metadata,
        lastSync: new Date(),
        syncVersion: Math.max(this.localSession.metadata.syncVersion, event.data.metadata?.syncVersion || 0)
      }
    };

    this.persistLocalSession();
    this.emit('session_sync_updated', event.data);
  }

  /**
   * Start background sync processes
   */
  private startBackgroundSync(): void {
    // Sync with backend every 5 minutes
    this.syncInterval = setInterval(async () => {
      if (this.localSession) {
        await this.syncWithBackend(this.localSession);
      }
    }, 5 * 60 * 1000);

    // Send heartbeat every minute
    this.heartbeatInterval = setInterval(async () => {
      if (this.localSession) {
        await this.updatePlatformStatus('cli', true);
      }
    }, 60 * 1000);
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Handle process termination
    process.on('SIGTERM', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
    process.on('beforeExit', () => this.cleanup());
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.websocketConnection) {
      this.websocketConnection.close();
    }
  }

  /**
   * Helper methods
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getOrCreateDeviceId(): string {
    // This would use a more sophisticated device fingerprinting in production
    return `device_${require('os').hostname()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  private getCLIVersion(): string {
    try {
      const packageJson = require('../../../package.json');
      return packageJson.version || '1.0.0';
    } catch {
      return '1.0.0';
    }
  }

  private getQuotaLimit(plan: string): number {
    const limits = {
      free: 500,
      pro: 5000,
      team: 15000,
      enterprise: -1 // unlimited
    };
    return limits[plan as keyof typeof limits] || 500;
  }

  private getNextResetDate(): Date {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  /**
   * Local storage methods
   */
  private async persistLocalSession(): Promise<void> {
    if (!this.localSession) return;

    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');

      const sessionFile = path.join(os.homedir(), '.recoder', 'unified-session.json');
      const sessionDir = path.dirname(sessionFile);

      await fs.mkdir(sessionDir, { recursive: true });
      await fs.writeFile(sessionFile, JSON.stringify(this.localSession, null, 2), { mode: 0o600 });

    } catch (error: any) {
      this.logger.warn('Failed to persist session locally:', error.message);
    }
  }

  private async loadLocalSession(): Promise<UnifiedSessionData | null> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');

      const sessionFile = path.join(os.homedir(), '.recoder', 'unified-session.json');
      const sessionData = await fs.readFile(sessionFile, 'utf8');
      return JSON.parse(sessionData);

    } catch {
      return null;
    }
  }

  private async clearLocalSession(): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');

      const sessionFile = path.join(os.homedir(), '.recoder', 'unified-session.json');
      await fs.unlink(sessionFile);

    } catch {
      // File might not exist, ignore
    }
  }
}

export const unifiedSessionManager = new UnifiedSessionManager();