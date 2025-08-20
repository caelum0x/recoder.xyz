/**
 * Main Backend Connection Service
 * Connects CLI router to main recoder.xyz backend for shared API key pools
 * Enables centralized billing, analytics, and cost optimization
 */

import axios, { AxiosInstance } from 'axios';
import { Logger } from './logger';
import { EventEmitter } from 'events';

export interface RouterBackendConfig {
  backendUrl: string;
  apiKey?: string;
  userId?: string;
  enterpriseMode: boolean;
  syncInterval: number;
}

export interface SharedAPIKeyPool {
  provider: string;
  keys: Array<{
    id: string;
    key_masked: string;
    rate_limit: number;
    cost_per_token: number;
    current_usage: number;
    health_score: number;
    priority: number;
  }>;
  optimization_settings: {
    cost_threshold: number;
    quality_threshold: number;
    latency_threshold: number;
  };
}

export interface RouterSyncData {
  router_id: string;
  user_id?: string;
  version: string;
  uptime: number;
  requests_processed: number;
  cost_savings: {
    total_saved: number;
    percentage: number;
    period: string;
  };
  performance_metrics: {
    avg_response_time: number;
    success_rate: number;
    models_used: Record<string, number>;
  };
  last_sync: Date;
}

export class MainBackendConnection extends EventEmitter {
  private client: AxiosInstance;
  private logger: Logger;
  private config: RouterBackendConfig;
  private isConnected = false;
  private syncTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private routerId: string;

  constructor(config: RouterBackendConfig) {
    super();
    this.config = config;
    this.logger = new Logger('BackendConnection');
    this.routerId = this.generateRouterId();

    // Initialize HTTP client
    this.client = axios.create({
      baseURL: config.backendUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'recoder-cli-router/2.0.0',
        ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` })
      }
    });

    // Setup response interceptors
    this.setupInterceptors();
  }

  /**
   * Initialize connection to main backend
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('🔗 Connecting to main backend...', { url: this.config.backendUrl });

      // Test connection and register router
      await this.registerRouter();

      // Sync API key pools
      await this.syncAPIKeyPools();

      // Start periodic sync
      this.startSync();

      this.isConnected = true;
      this.emit('connected');
      
      this.logger.info('✅ Successfully connected to main backend');

    } catch (error: any) {
      this.logger.error('Failed to connect to main backend', error);
      this.emit('connection_failed', error);
      
      if (this.config.enterpriseMode) {
        throw error; // Fail hard in enterprise mode
      }
      
      // In individual mode, continue with local operation
      this.logger.warn('⚠️ Running in offline mode - using local API keys only');
    }
  }

  /**
   * Register router with main backend
   */
  private async registerRouter(): Promise<void> {
    const registrationData = {
      router_id: this.routerId,
      user_id: this.config.userId,
      version: this.getRouterVersion(),
      enterprise_mode: this.config.enterpriseMode,
      capabilities: [
        'api_key_sharing',
        'cost_optimization',
        'analytics_reporting',
        'real_time_sync'
      ],
      metadata: {
        platform: process.platform,
        node_version: process.version,
        started_at: new Date().toISOString()
      }
    };

    await this.client.post('/api/router/register', registrationData);
    this.logger.info('📋 Router registered successfully', { routerId: this.routerId });
  }

  /**
   * Sync API key pools from main backend
   */
  async syncAPIKeyPools(): Promise<SharedAPIKeyPool[]> {
    try {
      const response = await this.client.get(`/api/router/${this.routerId}/api-keys`);
      const pools: SharedAPIKeyPool[] = response.data.pools || [];

      this.logger.info(`🔑 Synced ${pools.length} API key pools from backend`);
      
      // Emit event for router to update local pools
      this.emit('api_keys_synced', pools);
      
      return pools;

    } catch (error: any) {
      this.logger.error('Failed to sync API key pools', error);
      return [];
    }
  }

  /**
   * Report usage and cost data to backend
   */
  async reportUsage(usageData: {
    requests: Array<{
      model: string;
      provider: string;
      tokens_used: number;
      cost: number;
      response_time: number;
      success: boolean;
      timestamp: Date;
    }>;
    period_start: Date;
    period_end: Date;
  }): Promise<void> {
    try {
      const reportData = {
        router_id: this.routerId,
        user_id: this.config.userId,
        usage_data: usageData,
        reported_at: new Date().toISOString()
      };

      await this.client.post('/api/router/usage', reportData);
      this.logger.debug('📊 Usage data reported to backend');

    } catch (error: any) {
      this.logger.error('Failed to report usage data', error);
    }
  }

  /**
   * Get cost optimization recommendations from backend
   */
  async getCostOptimizationRecommendations(): Promise<{
    recommendations: Array<{
      type: 'model_switch' | 'provider_switch' | 'rate_limit' | 'caching';
      description: string;
      potential_savings: number;
      confidence: number;
    }>;
    current_efficiency: number;
    projected_savings: number;
  }> {
    try {
      const response = await this.client.get(`/api/router/${this.routerId}/optimize`);
      return response.data;

    } catch (error: any) {
      this.logger.error('Failed to get optimization recommendations', error);
      return {
        recommendations: [],
        current_efficiency: 0,
        projected_savings: 0
      };
    }
  }

  /**
   * Sync router data with backend
   */
  private async syncWithBackend(): Promise<void> {
    try {
      const syncData: RouterSyncData = {
        router_id: this.routerId,
        user_id: this.config.userId,
        version: this.getRouterVersion(),
        uptime: process.uptime(),
        requests_processed: this.getRequestsProcessed(),
        cost_savings: await this.getCostSavingsData(),
        performance_metrics: await this.getPerformanceMetrics(),
        last_sync: new Date()
      };

      await this.client.post('/api/router/sync', syncData);
      this.logger.debug('🔄 Router data synced with backend');

      // Check for backend updates
      await this.checkForUpdates();

    } catch (error: any) {
      if (error.response?.status === 401) {
        this.logger.warn('⚠️ Authentication failed - check API key');
        this.emit('auth_failed');
      } else {
        this.logger.error('Failed to sync with backend', error);
      }
    }
  }

  /**
   * Start periodic sync with backend
   */
  private startSync(): void {
    // Main sync every 5 minutes
    this.syncTimer = setInterval(async () => {
      await this.syncWithBackend();
    }, this.config.syncInterval);

    // Heartbeat every minute
    this.heartbeatTimer = setInterval(async () => {
      await this.sendHeartbeat();
    }, 60 * 1000);

    this.logger.info('🔄 Started periodic sync with backend');
  }

  /**
   * Send heartbeat to maintain connection
   */
  private async sendHeartbeat(): Promise<void> {
    try {
      await this.client.post(`/api/router/${this.routerId}/heartbeat`, {
        timestamp: new Date().toISOString(),
        status: 'active'
      });
    } catch (error) {
      // Heartbeat failures are non-critical
      this.logger.debug('Heartbeat failed', error);
    }
  }

  /**
   * Check for router updates from backend
   */
  private async checkForUpdates(): Promise<void> {
    try {
      const response = await this.client.get(`/api/router/${this.routerId}/updates`);
      
      if (response.data.updates_available) {
        this.emit('updates_available', response.data.updates);
        this.logger.info('📦 Router updates available', response.data.updates);
      }

      // Check for configuration updates
      if (response.data.config_updates) {
        this.emit('config_updated', response.data.config_updates);
        this.logger.info('⚙️ Configuration updates received');
      }

    } catch (error) {
      this.logger.debug('Failed to check for updates', error);
    }
  }

  /**
   * Request shared API key for specific provider
   */
  async requestSharedAPIKey(provider: string, modelName?: string): Promise<{
    api_key: string;
    rate_limit: number;
    cost_per_token: number;
    expires_at?: Date;
  } | null> {
    try {
      const response = await this.client.post(`/api/router/${this.routerId}/request-key`, {
        provider,
        model: modelName,
        request_id: this.generateRequestId()
      });

      if (response.data.success) {
        return response.data.key_data;
      }

      return null;

    } catch (error: any) {
      this.logger.error(`Failed to request shared API key for ${provider}`, error);
      return null;
    }
  }

  /**
   * Report API key usage back to backend
   */
  async reportAPIKeyUsage(keyId: string, usage: {
    tokens_used: number;
    cost: number;
    success: boolean;
    error?: string;
  }): Promise<void> {
    try {
      await this.client.post(`/api/router/key-usage`, {
        router_id: this.routerId,
        key_id: keyId,
        usage: usage,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      this.logger.error('Failed to report API key usage', error);
    }
  }

  /**
   * Report usage data in bulk to backend
   */
  async reportUsage(data: {
    requests: Array<any>;
    period_start: Date;
    period_end: Date;
  }): Promise<void> {
    try {
      await this.client.post('/api/router/usage', {
        router_id: this.routerId,
        usage_data: data,
        reported_at: new Date().toISOString()
      });

      this.logger.debug(`📊 Reported ${data.requests.length} requests to backend`);

    } catch (error: any) {
      this.logger.error('Failed to report usage data', error);
    }
  }

  /**
   * Get billing information for user
   */
  async getBillingInfo(): Promise<any> {
    if (!this.config.userId) {
      return null;
    }

    try {
      const response = await this.client.get(`/api/billing/user/${this.config.userId}`);
      return response.data;

    } catch (error: any) {
      this.logger.error('Failed to get billing info', error);
      return null;
    }
  }

  /**
   * Setup HTTP interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        config.headers['X-Router-ID'] = this.routerId;
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401 && this.config.apiKey) {
          this.logger.warn('Authentication failed, attempting to refresh');
          this.emit('auth_failed');
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Helper methods
   */
  private generateRouterId(): string {
    return `router_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  private getRouterVersion(): string {
    try {
      const packageJson = require('../package.json');
      return packageJson.version;
    } catch {
      return '2.0.0';
    }
  }

  private getRequestsProcessed(): number {
    // This would be tracked by the router service
    return 0; // Placeholder
  }

  private async getCostSavingsData(): Promise<{
    total_saved: number;
    percentage: number;
    period: string;
  }> {
    // This would be calculated by the cost optimization service
    return {
      total_saved: 0,
      percentage: 0,
      period: 'monthly'
    };
  }

  private async getPerformanceMetrics(): Promise<{
    avg_response_time: number;
    success_rate: number;
    models_used: Record<string, number>;
  }> {
    // This would be tracked by the router service
    return {
      avg_response_time: 0,
      success_rate: 100,
      models_used: {}
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    this.isConnected = false;
    this.emit('disconnected');
    this.logger.info('🔌 Disconnected from main backend');
  }

  /**
   * Get connection status
   */
  getStatus(): {
    connected: boolean;
    router_id: string;
    last_sync?: Date;
    backend_url: string;
  } {
    return {
      connected: this.isConnected,
      router_id: this.routerId,
      backend_url: this.config.backendUrl
    };
  }

  /**
   * Get authentication token for web platform integration
   */
  getAuthToken(): string | null {
    return this.config.apiKey || this.generateRouterToken();
  }

  /**
   * Generate a router token for web platform authentication
   */
  private generateRouterToken(): string | null {
    if (this.config.userId) {
      // Generate a simple token based on user ID and router ID
      const tokenData = {
        user_id: this.config.userId,
        router_id: this.routerId,
        timestamp: Date.now()
      };
      return Buffer.from(JSON.stringify(tokenData)).toString('base64');
    }
    return null;
  }
}

export default MainBackendConnection;