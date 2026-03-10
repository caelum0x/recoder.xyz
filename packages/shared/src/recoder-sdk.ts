/**
 * Recoder.xyz Unified SDK
 * Cross-platform SDK for all Recoder platforms
 */

import { EventEmitter } from 'events';
import { AuthClient } from './auth-client';
import { WebSocketClient } from './websocket-client';
import { SyncClient } from './sync-client';
import { AIClient } from './ai-client';
import axios, { AxiosInstance } from 'axios';

export interface RecoderSDKConfig {
  baseURL?: string;
  webSocketURL?: string;
  platform: 'cli' | 'web' | 'mobile' | 'extension' | 'desktop';
  deviceName?: string;
  enableWebSocket?: boolean;
  enableAutoSync?: boolean;
  apiKey?: string;
  debug?: boolean;
}

export interface AIProvider {
  name: string;
  status: 'healthy' | 'degraded' | 'offline' | 'error';
  responseTime?: number;
  errorRate?: number;
  uptime?: number;
}

export interface AIProviderRecommendation {
  taskType: string;
  recommended: {
    provider: string;
    name: string;
    reason: string;
    status: string;
  };
  fallbacks: Array<{
    provider: string;
    name: string;
    status: string;
  }>;
}

export interface AnalyticsData {
  eventType: 'api_call' | 'code_generation' | 'authentication' | 'sync' | 'ai_request';
  provider?: string;
  tokens?: number;
  cost?: number;
  duration?: number;
  success?: boolean;
  metadata?: any;
}

export class RecoderSDK extends EventEmitter {
  private config: Required<RecoderSDKConfig>;
  private api: AxiosInstance;

  public auth: AuthClient;
  public websocket?: WebSocketClient;
  public sync?: SyncClient;
  public ai: AIClient;

  constructor(config: RecoderSDKConfig) {
    super();

    this.config = {
      baseURL: config.baseURL || 'http://localhost:3100',
      webSocketURL: config.webSocketURL || 'http://localhost:3100',
      platform: config.platform,
      deviceName: config.deviceName || `${config.platform}-${Date.now()}`,
      enableWebSocket: config.enableWebSocket ?? true,
      enableAutoSync: config.enableAutoSync ?? true,
      apiKey: config.apiKey || '',
      debug: config.debug || false
    };

    // Initialize API client
    this.api = axios.create({
      baseURL: `${this.config.baseURL}/api`,
      timeout: 10000,
      headers: {
        'User-Agent': `Recoder-${config.platform}/${this.getVersion()}`
      }
    });

    // Initialize auth client
    this.auth = new AuthClient(this.config.baseURL);

    // Initialize AI client
    this.ai = new AIClient(this.auth, {
      platform: this.config.platform,
      baseURL: this.config.baseURL,
      routingStrategy: 'balanced'
    });

    // Setup API interceptors
    this.setupAPIInterceptors();

    // Initialize other clients
    this.initializeClients();

    // Setup event forwarding
    this.setupEventForwarding();

    if (this.config.debug) {
      console.log('Recoder SDK initialized for platform:', this.config.platform);
    }
  }

  private setupAPIInterceptors(): void {
    this.api.interceptors.request.use((config) => {
      const tokens = this.auth.getTokens();
      if (tokens?.accessToken) {
        config.headers.Authorization = `Bearer ${tokens.accessToken}`;
      }
      return config;
    });

    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (this.config.debug) {
          console.error('API Error:', error.response?.data || error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  private initializeClients(): void {
    // Initialize WebSocket client
    if (this.config.enableWebSocket) {
      this.websocket = new WebSocketClient({
        url: this.config.webSocketURL,
        authClient: this.auth,
        platform: this.config.platform
      });
    }

    // Initialize sync client
    this.sync = new SyncClient({
      authClient: this.auth,
      webSocketClient: this.websocket,
      baseURL: this.config.baseURL,
      enableRealTimeSync: this.config.enableWebSocket
    });
  }

  private setupEventForwarding(): void {
    // Forward auth events
    this.auth.on('authenticated', (data) => {
      this.emit('authenticated', data);
      this.onAuthenticated();
    });

    this.auth.on('logout', () => {
      this.emit('logout');
      this.onLogout();
    });

    // Forward WebSocket events
    if (this.websocket) {
      this.websocket.on('connected', () => {
        this.emit('websocketConnected');
      });

      this.websocket.on('disconnected', () => {
        this.emit('websocketDisconnected');
      });

      this.websocket.on('notificationReceived', (notification) => {
        this.emit('notification', notification);
      });

      this.websocket.on('syncUpdated', (data) => {
        this.emit('syncUpdate', data);
      });
    }

    // Forward sync events
    if (this.sync) {
      this.sync.on('syncCompleted', (data) => {
        this.emit('syncCompleted', data);
      });

      this.sync.on('syncError', (data) => {
        this.emit('syncError', data);
      });
    }

    // Forward AI events
    this.ai.on('requestStarted', (data) => {
      this.emit('aiRequestStarted', data);
    });

    this.ai.on('responseReceived', (data) => {
      this.emit('aiResponseReceived', data);
    });

    this.ai.on('requestFailed', (data) => {
      this.emit('aiRequestFailed', data);
    });

    this.ai.on('providerError', (data) => {
      this.emit('aiProviderError', data);
    });
  }

  private async onAuthenticated(): Promise<void> {
    try {
      // Register device
      await this.auth.registerDevice({
        name: this.config.deviceName,
        deviceType: this.config.platform,
        platform: this.getPlatformDetails()
      });

      // Connect WebSocket
      if (this.websocket) {
        await this.websocket.connect();
      }

      // Start auto sync
      if (this.sync && this.config.enableAutoSync) {
        await this.sync.startAutoSync();
      }

      this.emit('ready');
      
      if (this.config.debug) {
        console.log('Recoder SDK ready for platform:', this.config.platform);
      }
    } catch (error) {
      console.error('SDK initialization after auth failed:', error);
      this.emit('initError', error);
    }
  }

  private onLogout(): void {
    // Disconnect WebSocket
    if (this.websocket) {
      this.websocket.disconnect();
    }

    // Stop auto sync
    if (this.sync) {
      this.sync.stopAutoSync();
    }
  }

  // Public API Methods

  async initialize(): Promise<void> {
    if (this.auth.isAuthenticated()) {
      await this.onAuthenticated();
    }
  }

  async connect(): Promise<void> {
    if (this.websocket && !this.websocket.connected) {
      await this.websocket.connect();
    }
  }

  disconnect(): void {
    if (this.websocket) {
      this.websocket.disconnect();
    }
  }

  // AI Provider Methods

  async getAIProviderStatus(): Promise<AIProvider[]> {
    try {
      const response = await this.api.get('/ai-providers/status');
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async healthCheckAIProviders(): Promise<{ providers: any; overall: any }> {
    try {
      const response = await this.api.post('/ai-providers/health-check');
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getAIProviderRecommendation(
    taskType: 'coding' | 'blockchain' | 'security' | 'analysis' | 'chat' | 'generation',
    priority: 'speed' | 'cost' | 'quality' = 'quality'
  ): Promise<AIProviderRecommendation> {
    try {
      const response = await this.api.post('/ai-providers/recommend', {
        taskType,
        priority
      });
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getAIProviderCosts(timeframe: 'hour' | 'day' | 'week' | 'month' = 'day'): Promise<any> {
    try {
      const response = await this.api.get('/ai-providers/costs', {
        params: { timeframe }
      });
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Analytics Methods

  async trackAnalytics(data: AnalyticsData): Promise<void> {
    try {
      await this.api.post('/analytics/track', {
        ...data,
        platform: this.config.platform
      });
    } catch (error) {
      if (this.config.debug) {
        console.error('Analytics tracking failed:', error);
      }
      // Don't throw - analytics failures shouldn't break the app
    }
  }

  async getAnalyticsDashboard(
    timeframe: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<any> {
    try {
      const response = await this.api.get('/analytics/dashboard', {
        params: { timeframe, platform: this.config.platform }
      });
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getPerformanceMetrics(): Promise<any> {
    try {
      const response = await this.api.get('/analytics/performance');
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getRealTimeAnalytics(): Promise<any> {
    try {
      const response = await this.api.get('/analytics/realtime');
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Notification Methods

  async sendNotification(
    type: 'info' | 'success' | 'warning' | 'error' | 'system',
    title: string,
    message: string,
    data?: any
  ): Promise<void> {
    try {
      await this.api.post('/notifications/send', {
        type,
        title,
        message,
        data
      });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async broadcastNotification(
    channel: string,
    event: string,
    type: 'info' | 'success' | 'warning' | 'error' | 'system',
    title: string,
    message: string,
    data?: any
  ): Promise<void> {
    try {
      await this.api.post('/notifications/broadcast', {
        channel,
        event,
        type,
        title,
        message,
        data
      });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Utility Methods

  isReady(): boolean {
    return this.auth.isAuthenticated() && 
           (!this.config.enableWebSocket || this.websocket?.connected || false);
  }

  getStatus(): any {
    return {
      authenticated: this.auth.isAuthenticated(),
      websocketConnected: this.websocket?.connected || false,
      autoSyncEnabled: this.sync?.autoSyncEnabled || false,
      platform: this.config.platform,
      user: this.auth.getUser(),
      device: this.auth.getDeviceInfo(),
      ai: this.ai.getStatus()
    };
  }

  // Platform Integration Helpers

  async switchToPlatform(targetPlatform: string, context?: any): Promise<void> {
    if (this.websocket) {
      await this.websocket.notifyPlatformSwitch(
        this.config.platform,
        targetPlatform,
        context
      );
    }
  }

  async startCollaboration(projectId: string): Promise<void> {
    if (this.websocket) {
      await this.websocket.joinCollaboration(projectId);
    }
  }

  async stopCollaboration(projectId: string): Promise<void> {
    if (this.websocket) {
      await this.websocket.leaveCollaboration(projectId);
    }
  }

  // Private helpers

  private getVersion(): string {
    return '2.0.0'; // SDK version
  }

  private getPlatformDetails(): string {
    if (typeof window !== 'undefined' && window && typeof navigator !== 'undefined' && navigator) {
      return navigator.userAgent;
    } else if (typeof process !== 'undefined' && process) {
      return `${process.platform} ${process.arch}`;
    }
    return 'unknown';
  }

  private handleError(error: any): Error {
    const message = error.response?.data?.error?.message || error.message || 'SDK operation failed';
    return new Error(message);
  }
}

// Convenience factory functions for different platforms

export function createWebSDK(config: Partial<RecoderSDKConfig> = {}): RecoderSDK {
  return new RecoderSDK({
    platform: 'web',
    deviceName: 'Web Browser',
    ...config
  });
}

export function createCLISDK(config: Partial<RecoderSDKConfig> = {}): RecoderSDK {
  return new RecoderSDK({
    platform: 'cli',
    deviceName: `CLI - ${require('os').hostname()}`,
    ...config
  });
}

export function createMobileSDK(config: Partial<RecoderSDKConfig> = {}): RecoderSDK {
  return new RecoderSDK({
    platform: 'mobile',
    deviceName: 'Mobile Device',
    ...config
  });
}

export function createDesktopSDK(config: Partial<RecoderSDKConfig> = {}): RecoderSDK {
  return new RecoderSDK({
    platform: 'desktop',
    deviceName: 'Desktop App',
    ...config
  });
}

export function createExtensionSDK(config: Partial<RecoderSDKConfig> = {}): RecoderSDK {
  return new RecoderSDK({
    platform: 'extension',
    deviceName: 'VS Code Extension',
    ...config
  });
}

export default RecoderSDK;