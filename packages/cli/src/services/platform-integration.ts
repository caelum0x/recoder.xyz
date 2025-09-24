/**
 * Platform Integration Service
 * Connects CLI with web and chat platforms for unified experience
 */

import { APIClient } from './api-client';
import { ConfigManager } from '../utils/config-manager';
import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';
import WebSocket from 'ws';

interface PlatformSession {
  id: string;
  platform: 'cli' | 'web' | 'chat' | 'mobile' | 'desktop';
  userId: string;
  isActive: boolean;
  lastActivity: Date;
  capabilities: string[];
  metadata: Record<string, any>;
}

interface CrossPlatformMessage {
  id: string;
  type: 'sync' | 'notification' | 'command' | 'response' | 'event';
  source: string;
  target?: string;
  payload: any;
  timestamp: Date;
}

interface SyncEvent {
  type: 'project_update' | 'generation_complete' | 'payment_update' | 'settings_change';
  data: any;
  sessionId?: string;
}

export class PlatformIntegration extends EventEmitter {
  private apiClient: APIClient;
  private config: ConfigManager;
  private logger: Logger;
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor() {
    super();
    this.apiClient = new APIClient();
    this.config = new ConfigManager();
    this.logger = new Logger('PlatformIntegration');
  }

  /**
   * Initialize platform integration
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing platform integration...');

      // Register CLI session
      await this.registerSession();

      // Connect to real-time sync
      await this.connectWebSocket();

      // Set up event handlers
      this.setupEventHandlers();

      this.logger.info('Platform integration initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize platform integration', { error });
      throw error;
    }
  }

  /**
   * Register CLI session with backend
   */
  private async registerSession(): Promise<void> {
    try {
      const deviceInfo = await this.getDeviceInfo();
      const cliVersion = require('../../package.json').version;

      const response = await this.apiClient.post('/api/platform/sessions', {
        platform: 'cli',
        capabilities: [
          'code_generation',
          'project_management',
          'ai_chat',
          'file_operations',
          'git_integration'
        ],
        deviceInfo,
        version: cliVersion,
        environment: process.env.NODE_ENV || 'development'
      });

      if (response.success) {
        this.sessionId = response.data.sessionId;
        this.logger.info('CLI session registered', { sessionId: this.sessionId });
      } else {
        throw new Error(response.error || 'Failed to register session');
      }
    } catch (error) {
      this.logger.error('Failed to register CLI session', { error });
      throw error;
    }
  }

  /**
   * Connect to WebSocket for real-time sync
   */
  private async connectWebSocket(): Promise<void> {
    try {
      const wsUrl = this.config.get('websocketUrl') || 'wss://api.recoder.xyz/ws';
      const token = this.config.get('authToken');

      if (!token) {
        throw new Error('Authentication token required for WebSocket connection');
      }

      this.ws = new WebSocket(`${wsUrl}?token=${token}&sessionId=${this.sessionId}`);

      this.ws.on('open', () => {
        this.logger.info('WebSocket connected');
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.emit('connected');
      });

      this.ws.on('message', (data) => {
        try {
          const message: CrossPlatformMessage = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          this.logger.error('Failed to parse WebSocket message', { error, data: data.toString() });
        }
      });

      this.ws.on('close', () => {
        this.logger.warn('WebSocket disconnected');
        this.stopHeartbeat();
        this.emit('disconnected');
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        this.logger.error('WebSocket error', { error });
        this.emit('error', error);
      });

    } catch (error) {
      this.logger.error('Failed to connect WebSocket', { error });
      throw error;
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(message: CrossPlatformMessage): void {
    this.logger.debug('Received message', { type: message.type, source: message.source });

    switch (message.type) {
      case 'sync':
        this.handleSyncMessage(message);
        break;
      case 'notification':
        this.handleNotification(message);
        break;
      case 'command':
        this.handleRemoteCommand(message);
        break;
      case 'response':
        this.handleResponse(message);
        break;
      case 'event':
        this.handleEvent(message);
        break;
      default:
        this.logger.warn('Unknown message type', { type: message.type });
    }
  }

  /**
   * Handle sync messages (project updates, etc.)
   */
  private handleSyncMessage(message: CrossPlatformMessage): void {
    const { payload } = message;

    switch (payload.event) {
      case 'project_update':
        this.emit('projectUpdate', payload.data);
        break;
      case 'generation_complete':
        this.emit('generationComplete', payload.data);
        break;
      case 'payment_update':
        this.emit('paymentUpdate', payload.data);
        break;
      case 'settings_change':
        this.emit('settingsChange', payload.data);
        break;
      default:
        this.logger.debug('Unknown sync event', { event: payload.event });
    }
  }

  /**
   * Handle notifications from other platforms
   */
  private handleNotification(message: CrossPlatformMessage): void {
    const { payload } = message;
    
    // Display notification in CLI
    console.log(`\n📱 ${payload.title}`);
    if (payload.message) {
      console.log(`   ${payload.message}`);
    }
    
    this.emit('notification', payload);
  }

  /**
   * Handle remote commands from web/chat platforms
   */
  private handleRemoteCommand(message: CrossPlatformMessage): void {
    const { payload } = message;
    
    this.logger.info('Received remote command', { command: payload.command });
    this.emit('remoteCommand', payload);
  }

  /**
   * Handle responses to CLI requests
   */
  private handleResponse(message: CrossPlatformMessage): void {
    this.emit('response', message.payload);
  }

  /**
   * Handle general events
   */
  private handleEvent(message: CrossPlatformMessage): void {
    this.emit('event', message.payload);
  }

  /**
   * Send message to other platforms
   */
  async sendMessage(type: string, payload: any, target?: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn('WebSocket not connected, cannot send message');
      return;
    }

    const message: CrossPlatformMessage = {
      id: this.generateId(),
      type: type as any,
      source: 'cli',
      target,
      payload,
      timestamp: new Date()
    };

    try {
      this.ws.send(JSON.stringify(message));
      this.logger.debug('Message sent', { type, target });
    } catch (error) {
      this.logger.error('Failed to send message', { error });
    }
  }

  /**
   * Sync project to web/chat platforms
   */
  async syncProject(projectData: any): Promise<void> {
    await this.sendMessage('sync', {
      event: 'project_update',
      data: projectData,
      sessionId: this.sessionId
    });
  }

  /**
   * Notify about generation completion
   */
  async notifyGenerationComplete(result: any): Promise<void> {
    await this.sendMessage('sync', {
      event: 'generation_complete',
      data: result,
      sessionId: this.sessionId
    });
  }

  /**
   * Get active sessions across platforms
   */
  async getActiveSessions(): Promise<PlatformSession[]> {
    try {
      const response = await this.apiClient.get('/api/platform/sessions');
      return response.success ? response.data.sessions : [];
    } catch (error) {
      this.logger.error('Failed to get active sessions', { error });
      return [];
    }
  }

  /**
   * Get cross-platform usage stats
   */
  async getUsageStats(): Promise<any> {
    try {
      const response = await this.apiClient.get('/api/platform/usage-stats');
      return response.success ? response.data : null;
    } catch (error) {
      this.logger.error('Failed to get usage stats', { error });
      return null;
    }
  }

  /**
   * Share project with other platforms
   */
  async shareProject(projectId: string, platforms: string[]): Promise<void> {
    try {
      await this.apiClient.post('/api/platform/share-project', {
        projectId,
        platforms,
        source: 'cli'
      });

      this.logger.info('Project shared', { projectId, platforms });
    } catch (error) {
      this.logger.error('Failed to share project', { error });
      throw error;
    }
  }

  /**
   * Request remote assistance from web platform
   */
  async requestRemoteAssistance(sessionData: any): Promise<string> {
    try {
      const response = await this.apiClient.post('/api/platform/remote-assistance', {
        sessionData,
        source: 'cli',
        sessionId: this.sessionId
      });

      if (response.success) {
        const assistanceUrl = response.data.url;
        this.logger.info('Remote assistance requested', { url: assistanceUrl });
        return assistanceUrl;
      } else {
        throw new Error(response.error || 'Failed to request remote assistance');
      }
    } catch (error) {
      this.logger.error('Failed to request remote assistance', { error });
      throw error;
    }
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    // Handle process termination
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
    process.on('exit', () => this.cleanup());

    // Handle platform-specific events
    this.on('projectUpdate', (data) => {
      console.log('📦 Project updated from another platform');
    });

    this.on('generationComplete', (data) => {
      console.log('🤖 AI generation completed on another platform');
    });

    this.on('paymentUpdate', (data) => {
      console.log('💳 Payment status updated');
    });
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000); // 30 seconds
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Schedule WebSocket reconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    this.logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connectWebSocket().catch((error) => {
        this.logger.error('Reconnection failed', { error });
      });
    }, delay);
  }

  /**
   * Get device information
   */
  private async getDeviceInfo(): Promise<any> {
    const os = require('os');
    
    return {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      hostname: os.hostname(),
      nodeVersion: process.version,
      memory: os.totalmem(),
      cpus: os.cpus().length
    };
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `cli_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up platform integration...');

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Unregister session
    if (this.sessionId) {
      try {
        await this.apiClient.delete(`/api/platform/sessions/${this.sessionId}`);
      } catch (error) {
        this.logger.error('Failed to unregister session', { error });
      }
    }

    this.removeAllListeners();
    this.logger.info('Platform integration cleanup complete');
  }

  /**
   * Check if connected to platform
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get current session info
   */
  getSessionInfo(): { sessionId: string | null; connected: boolean } {
    return {
      sessionId: this.sessionId,
      connected: this.isConnected()
    };
  }
}

export const platformIntegration = new PlatformIntegration();