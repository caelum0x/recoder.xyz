/**
 * Session Sync Service
 * Handles synchronization of session data across CLI, web dashboard, and router
 * Enables real-time updates when user makes changes on any platform
 */
import { Logger } from '@recoder/shared';
import { backendClient } from './backend-client';
import { unifiedSessionManager } from './unified-session-manager';
import { cliBillingRedirects } from './cli-billing-redirects';
import { EventEmitter } from 'events';

export interface SessionUpdate {
  type: 'billing' | 'quota' | 'platform' | 'preferences' | 'security';
  data: any;
  source: 'web' | 'cli' | 'router' | 'extension';
  timestamp: Date;
  userId: string;
}

export interface CrossPlatformSync {
  sessionId: string;
  platforms: {
    web: { active: boolean; lastSync: Date };
    cli: { active: boolean; lastSync: Date };
    router: { active: boolean; lastSync: Date };
    extension: { active: boolean; lastSync: Date };
  };
  lastGlobalSync: Date;
  conflicts: SessionUpdate[];
}

export class SessionSyncService extends EventEmitter {
  private logger = new Logger();
  private syncInterval: NodeJS.Timeout | null = null;
  private retryQueue: SessionUpdate[] = [];
  private maxRetries = 3;
  private syncInProgress = false;

  constructor() {
    super();
    this.startSyncServices();
    this.setupEventListeners();
  }

  /**
   * Initialize session sync after authentication
   */
  async initializeSync(userId: string): Promise<void> {
    try {
      this.logger.info('🔄 Initializing cross-platform session sync');

      // Register CLI as active platform
      await this.updatePlatformStatus('cli', true);

      // Sync any pending changes from other platforms
      await this.performFullSync();

      // Enable real-time sync
      this.enableRealtimeSync();

      this.emit('sync_initialized', { userId });
      this.logger.info('✅ Session sync initialized successfully');

    } catch (error: any) {
      this.logger.error('Failed to initialize session sync:', error);
      throw error;
    }
  }

  /**
   * Update platform status and sync across all platforms
   */
  async updatePlatformStatus(platform: 'web' | 'cli' | 'router' | 'extension', active: boolean): Promise<void> {
    try {
      // Update in unified session manager
      await unifiedSessionManager.updatePlatformStatus(platform, active);

      // Notify other platforms via backend
      const session = unifiedSessionManager.getCurrentSession();
      if (session) {
        await this.broadcastSessionUpdate({
          type: 'platform',
          data: { platform, active },
          source: 'cli',
          timestamp: new Date(),
          userId: session.userId
        });
      }

      this.logger.info(`📱 Platform ${platform} status synced: ${active ? 'active' : 'inactive'}`);

    } catch (error: any) {
      this.logger.error(`Failed to update platform status: ${error.message}`);
      // Add to retry queue
      this.retryQueue.push({
        type: 'platform',
        data: { platform, active },
        source: 'cli',
        timestamp: new Date(),
        userId: 'unknown'
      });
    }
  }

  /**
   * Sync billing/subscription changes across platforms
   */
  async syncBillingUpdate(billingData: any): Promise<void> {
    try {
      // Update local unified session
      await unifiedSessionManager.updateSubscription(billingData);

      // Broadcast to other platforms
      const session = unifiedSessionManager.getCurrentSession();
      if (session) {
        await this.broadcastSessionUpdate({
          type: 'billing',
          data: billingData,
          source: 'cli',
          timestamp: new Date(),
          userId: session.userId
        });

        this.emit('billing_synced', billingData);
        this.logger.info('💳 Billing update synced across platforms');
      }

    } catch (error: any) {
      this.logger.error('Failed to sync billing update:', error.message);
      throw error;
    }
  }

  /**
   * Sync quota changes (when user makes requests or upgrades)
   */
  async syncQuotaUpdate(quotaData: { used: number; limit?: number }): Promise<void> {
    try {
      // Update local unified session
      await unifiedSessionManager.updateQuotas(quotaData.used, quotaData.limit);

      // Broadcast quota update
      const session = unifiedSessionManager.getCurrentSession();
      if (session) {
        await this.broadcastSessionUpdate({
          type: 'quota',
          data: quotaData,
          source: 'cli',
          timestamp: new Date(),
          userId: session.userId
        });

        this.emit('quota_synced', quotaData);

        // Check if approaching limit and notify user
        if (session.subscription.quotas.limit > 0) {
          const usagePercentage = (quotaData.used / session.subscription.quotas.limit) * 100;
          
          if (usagePercentage >= 90) {
            this.notifyQuotaWarning(usagePercentage, session);
          }
        }
      }

    } catch (error: any) {
      this.logger.error('Failed to sync quota update:', error.message);
    }
  }

  /**
   * Handle incoming session updates from other platforms
   */
  async handleRemoteSessionUpdate(update: SessionUpdate): Promise<void> {
    try {
      this.logger.info(`📡 Received ${update.type} update from ${update.source}`);

      const session = unifiedSessionManager.getCurrentSession();
      if (!session || session.userId !== update.userId) {
        return; // Not for current user
      }

      switch (update.type) {
        case 'billing':
          await this.handleRemoteBillingUpdate(update.data);
          break;
        case 'quota':
          await this.handleRemoteQuotaUpdate(update.data);
          break;
        case 'platform':
          await this.handleRemotePlatformUpdate(update.data);
          break;
        case 'preferences':
          await this.handleRemotePreferencesUpdate(update.data);
          break;
        case 'security':
          await this.handleRemoteSecurityUpdate(update.data);
          break;
      }

      this.emit('remote_update_processed', update);

    } catch (error: any) {
      this.logger.error('Failed to handle remote session update:', error);
    }
  }

  /**
   * Perform full sync to resolve any conflicts or missed updates
   */
  async performFullSync(): Promise<void> {
    if (this.syncInProgress) {
      return; // Avoid concurrent syncs
    }

    try {
      this.syncInProgress = true;
      this.logger.info('🔄 Performing full session sync');

      const session = unifiedSessionManager.getCurrentSession();
      if (!session) {
        return;
      }

      // Fetch latest session state from backend
      const response = await (backendClient as any).client.get(`/api/sessions/sync/${session.sessionId}`);
      const serverSession = response.data;

      // Compare and merge changes
      const conflicts = this.detectConflicts(session, serverSession);
      
      if (conflicts.length > 0) {
        this.logger.warn(`⚠️ Found ${conflicts.length} sync conflicts, resolving...`);
        await this.resolveConflicts(conflicts);
      }

      // Update local session with latest data
      if (serverSession.subscription) {
        await unifiedSessionManager.updateSubscription(serverSession.subscription);
      }

      if (serverSession.quotas) {
        await unifiedSessionManager.updateQuotas(serverSession.quotas.used, serverSession.quotas.limit);
      }

      this.logger.info('✅ Full session sync completed');

    } catch (error: any) {
      this.logger.error('Full sync failed:', error.message);
      // Continue with local data
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Enable real-time sync via WebSockets or polling
   */
  private enableRealtimeSync(): void {
    // Listen to unified session manager events
    unifiedSessionManager.on('remote_sync', (event) => {
      this.handleRemoteSessionUpdate({
        type: event.type.replace('_updated', '') as any,
        data: event.data,
        source: event.platform,
        timestamp: event.timestamp,
        userId: event.userId
      });
    });

    // Listen to platform updates
    unifiedSessionManager.on('platform_status_updated', (event) => {
      this.emit('platform_sync', event);
    });

    // Listen to billing updates
    unifiedSessionManager.on('subscription_updated', (data) => {
      this.emit('billing_sync', data);
    });

    // Listen to quota updates
    unifiedSessionManager.on('quotas_updated', (data) => {
      this.emit('quota_sync', data);
    });
  }

  /**
   * Broadcast session update to all platforms via backend
   */
  private async broadcastSessionUpdate(update: SessionUpdate): Promise<void> {
    try {
      await (backendClient as any).client.post('/api/sessions/broadcast', {
        sessionUpdate: update,
        targetPlatforms: ['web', 'cli', 'router', 'extension'],
        excludeSource: true
      });
    } catch (error: any) {
      this.logger.warn('Failed to broadcast session update:', error.message);
      // Add to retry queue
      this.retryQueue.push(update);
    }
  }

  /**
   * Handle remote billing updates from web/other platforms
   */
  private async handleRemoteBillingUpdate(billingData: any): Promise<void> {
    await unifiedSessionManager.updateSubscription(billingData);
    this.emit('remote_billing_update', billingData);

    // Show user notification about billing change
    if (billingData.subscription?.name) {
      console.log(`💳 Subscription updated to ${billingData.subscription.name.toUpperCase()} on another platform`);
    }
  }

  /**
   * Handle remote quota updates
   */
  private async handleRemoteQuotaUpdate(quotaData: any): Promise<void> {
    await unifiedSessionManager.updateQuotas(quotaData.used, quotaData.limit);
    this.emit('remote_quota_update', quotaData);

    // Refresh local quota display
    this.logger.info(`📊 Quota synced: ${quotaData.used}/${quotaData.limit || '∞'} requests used`);
  }

  /**
   * Handle remote platform updates
   */
  private async handleRemotePlatformUpdate(platformData: any): Promise<void> {
    // Update platform status without triggering another broadcast
    const session = unifiedSessionManager.getCurrentSession();
    if (session) {
      session.platforms[platformData.platform].active = platformData.active;
      session.platforms[platformData.platform].lastSeen = new Date();
    }

    this.emit('remote_platform_update', platformData);

    if (platformData.active) {
      this.logger.info(`📱 User connected to ${platformData.platform} platform`);
    } else {
      this.logger.info(`📱 User disconnected from ${platformData.platform} platform`);
    }
  }

  /**
   * Handle remote preferences updates
   */
  private async handleRemotePreferencesUpdate(preferencesData: any): Promise<void> {
    const session = unifiedSessionManager.getCurrentSession();
    if (session) {
      session.preferences = { ...session.preferences, ...preferencesData };
    }

    this.emit('remote_preferences_update', preferencesData);
    this.logger.info('⚙️ Preferences synced from another platform');
  }

  /**
   * Handle remote security updates
   */
  private async handleRemoteSecurityUpdate(securityData: any): Promise<void> {
    const session = unifiedSessionManager.getCurrentSession();
    if (session) {
      session.security = { ...session.security, ...securityData };
    }

    this.emit('remote_security_update', securityData);
    
    if (securityData.riskLevel === 'high') {
      console.log('🔒 Security alert: High risk activity detected on your account');
    }
  }

  /**
   * Detect conflicts between local and server session state
   */
  private detectConflicts(localSession: any, serverSession: any): any[] {
    const conflicts = [];

    // Check for sync version differences
    if (localSession.metadata.syncVersion !== serverSession.metadata.syncVersion) {
      conflicts.push({
        type: 'version_mismatch',
        local: localSession.metadata.syncVersion,
        server: serverSession.metadata.syncVersion
      });
    }

    // Check for quota differences
    if (localSession.subscription.quotas.used !== serverSession.subscription.quotas.used) {
      conflicts.push({
        type: 'quota_conflict',
        local: localSession.subscription.quotas.used,
        server: serverSession.subscription.quotas.used
      });
    }

    return conflicts;
  }

  /**
   * Resolve sync conflicts with server-wins strategy
   */
  private async resolveConflicts(conflicts: any[]): Promise<void> {
    this.logger.info('🔧 Resolving sync conflicts with server-wins strategy');
    
    // For now, always prefer server state
    // In production, this could be more sophisticated based on conflict type
    for (const conflict of conflicts) {
      this.logger.info(`Resolving ${conflict.type}: server value wins`);
    }
  }

  /**
   * Notify user about quota warnings
   */
  private async notifyQuotaWarning(usagePercentage: number, session: any): Promise<void> {
    if (usagePercentage >= 95) {
      console.log('\n🚨 You\'re approaching your monthly quota limit!');
      console.log(`Usage: ${usagePercentage.toFixed(1)}% of your ${session.subscription.plan} plan`);
      console.log('💡 Run "recoder auth upgrade" to increase your quota');
      
      // Optionally redirect to upgrade flow
      const upgradeContext = {
        userId: session.userId,
        currentPlan: session.subscription.plan,
        reason: 'quota_exceeded' as const,
        currentUsage: session.subscription.quotas.used,
        quotaLimit: session.subscription.quotas.limit,
        recommendedPlan: 'pro'
      };

      setTimeout(async () => {
        try {
          await cliBillingRedirects.handleQuotaExceeded(upgradeContext);
        } catch (error) {
          // User declined upgrade, continue
        }
      }, 2000);
    }
  }

  /**
   * Start background sync services
   */
  private startSyncServices(): void {
    // Periodic full sync every 10 minutes
    this.syncInterval = setInterval(async () => {
      await this.performFullSync();
    }, 10 * 60 * 1000);

    // Process retry queue every minute
    setInterval(async () => {
      await this.processRetryQueue();
    }, 60 * 1000);
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Handle process termination
    process.on('SIGTERM', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
    process.on('beforeExit', () => this.cleanup());
  }

  /**
   * Process failed sync attempts
   */
  private async processRetryQueue(): Promise<void> {
    if (this.retryQueue.length === 0) {
      return;
    }

    const updates = this.retryQueue.splice(0, 5); // Process up to 5 at a time

    for (const update of updates) {
      try {
        await this.broadcastSessionUpdate(update);
        this.logger.info(`✅ Retried sync for ${update.type} update`);
      } catch (error) {
        // Add back to queue if not exceeded max retries
        if (!update.data._retryCount) update.data._retryCount = 0;
        if (update.data._retryCount < this.maxRetries) {
          update.data._retryCount++;
          this.retryQueue.push(update);
        } else {
          this.logger.warn(`❌ Gave up retrying ${update.type} update after ${this.maxRetries} attempts`);
        }
      }
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    this.logger.info('🔄 Session sync service cleaned up');
  }

  /**
   * Get sync status for debugging
   */
  getSyncStatus(): {
    isActive: boolean;
    lastSync: Date | null;
    retryQueueSize: number;
    conflicts: number;
  } {
    const session = unifiedSessionManager.getCurrentSession();
    return {
      isActive: session !== null,
      lastSync: session?.metadata.lastSync || null,
      retryQueueSize: this.retryQueue.length,
      conflicts: 0 // Would track actual conflicts in production
    };
  }
}

export const sessionSyncService = new SessionSyncService();