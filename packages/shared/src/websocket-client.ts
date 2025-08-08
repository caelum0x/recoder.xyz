/**
 * WebSocket Client for Recoder.xyz
 * Handles real-time sync, collaboration, and notifications
 */

import { EventEmitter } from 'events';
import { AuthClient } from './auth-client';

export interface WebSocketConfig {
  url: string;
  authClient: AuthClient;
  deviceId?: string;
  platform?: string;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export interface SyncEvent {
  dataType: string;
  version: number;
  changes?: any;
  requestedBy?: {
    deviceId: string;
    platform: string;
  };
  updatedBy?: {
    deviceId: string;
    platform: string;
  };
  timestamp: string;
}

export interface CollaborationEvent {
  userId: string;
  userEmail?: string;
  deviceId: string;
  platform: string;
  projectId?: string;
  position?: any;
  selection?: any;
  edit?: any;
  fileId?: string;
  timestamp: string;
}

export interface NotificationEvent {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'system';
  title: string;
  message: string;
  data?: any;
  channels?: string[];
  timestamp: string;
}

export interface ActivityEvent {
  deviceId: string;
  platform: string;
  status: 'active' | 'idle' | 'busy' | 'away';
  timestamp: string;
}

export class WebSocketClient extends EventEmitter {
  private socket: any = null; // WebSocket or Socket.IO instance
  private config: WebSocketConfig;
  private isConnected: boolean = false;
  private isConnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(config: WebSocketConfig) {
    super();
    this.config = {
      autoReconnect: true,
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      ...config
    };
  }

  async connect(): Promise<void> {
    if (this.isConnected || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      // Get auth token from auth client
      const tokens = this.config.authClient.getTokens();
      const deviceInfo = this.config.authClient.getDeviceInfo();

      if (!tokens?.accessToken) {
        throw new Error('Authentication required');
      }

      // Import Socket.IO client dynamically based on environment
      const io = await this.getSocketIOClient();

      this.socket = io(this.config.url, {
        auth: {
          token: tokens.accessToken
        },
        query: {
          deviceId: this.config.deviceId || deviceInfo?.deviceId,
          platform: this.config.platform || deviceInfo?.platform || 'unknown'
        },
        transports: ['websocket', 'polling'],
        timeout: 10000
      });

      this.setupEventHandlers();

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, 10000);

        this.socket.on('connected', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.emit('connected');
          resolve();
        });

        this.socket.on('connect_error', (error: Error) => {
          clearTimeout(timeout);
          this.isConnecting = false;
          this.handleConnectionError(error);
          reject(error);
        });
      });

    } catch (error) {
      this.isConnecting = false;
      throw error;
    }
  }

  disconnect(): void {
    this.stopReconnectTimer();
    this.stopHeartbeat();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.isConnected = false;
    this.emit('disconnected');
  }

  // Sync Methods

  async requestSync(dataType: string, version: number): Promise<void> {
    if (!this.isConnected) {
      throw new Error('WebSocket not connected');
    }

    this.socket.emit('sync:request', {
      dataType,
      version
    });
  }

  async updateSync(dataType: string, version: number, changes: any): Promise<void> {
    if (!this.isConnected) {
      throw new Error('WebSocket not connected');
    }

    this.socket.emit('sync:update', {
      dataType,
      version,
      changes
    });
  }

  // Collaboration Methods

  async joinCollaboration(projectId: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('WebSocket not connected');
    }

    this.socket.emit('collaboration:join', { projectId });
  }

  async leaveCollaboration(projectId: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('WebSocket not connected');
    }

    this.socket.emit('collaboration:leave', { projectId });
  }

  async sendCursorUpdate(projectId: string, position: any, selection?: any): Promise<void> {
    if (!this.isConnected) return;

    this.socket.emit('collaboration:cursor', {
      projectId,
      position,
      selection
    });
  }

  async sendEdit(projectId: string, edit: any, fileId: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('WebSocket not connected');
    }

    this.socket.emit('collaboration:edit', {
      projectId,
      edit,
      fileId
    });
  }

  // Notification Methods

  async subscribeToChannels(channels: string[]): Promise<void> {
    if (!this.isConnected) {
      throw new Error('WebSocket not connected');
    }

    this.socket.emit('notification:subscribe', { channels });
  }

  async unsubscribeFromChannels(channels: string[]): Promise<void> {
    if (!this.isConnected) {
      throw new Error('WebSocket not connected');
    }

    this.socket.emit('notification:unsubscribe', { channels });
  }

  // Activity Methods

  async updateStatus(status: 'active' | 'idle' | 'busy' | 'away'): Promise<void> {
    if (!this.isConnected) return;

    this.socket.emit('activity:status', { status });
  }

  // AI Processing Methods

  async notifyAIRequest(requestId: string, provider: string, prompt: string): Promise<void> {
    if (!this.isConnected) return;

    this.socket.emit('ai:request', {
      requestId,
      provider,
      prompt
    });
  }

  // Platform Switch Methods

  async notifyPlatformSwitch(
    fromPlatform: string,
    toPlatform: string,
    context?: any
  ): Promise<void> {
    if (!this.isConnected) return;

    this.socket.emit('platform:switch', {
      fromPlatform,
      toPlatform,
      context
    });
  }

  // Private Methods

  private async getSocketIOClient(): Promise<any> {
    if (typeof window !== 'undefined') {
      // Browser environment
      const { io } = await import('socket.io-client');
      return io;
    } else {
      // Node.js environment
      const { io } = await import('socket.io-client');
      return io;
    }
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('disconnect', (reason: string) => {
      this.isConnected = false;
      this.stopHeartbeat();
      this.emit('disconnected', reason);
      
      if (this.config.autoReconnect && reason !== 'io client disconnect') {
        this.scheduleReconnect();
      }
    });

    this.socket.on('connect_error', (error: Error) => {
      this.handleConnectionError(error);
    });

    // Sync events
    this.socket.on('sync:requested', (data: SyncEvent) => {
      this.emit('syncRequested', data);
    });

    this.socket.on('sync:updated', (data: SyncEvent) => {
      this.emit('syncUpdated', data);
    });

    // Collaboration events
    this.socket.on('collaboration:joined', (data: any) => {
      this.emit('collaborationJoined', data);
    });

    this.socket.on('collaboration:user_joined', (data: CollaborationEvent) => {
      this.emit('collaboratorJoined', data);
    });

    this.socket.on('collaboration:user_left', (data: CollaborationEvent) => {
      this.emit('collaboratorLeft', data);
    });

    this.socket.on('collaboration:cursor_update', (data: CollaborationEvent) => {
      this.emit('cursorUpdate', data);
    });

    this.socket.on('collaboration:edit_applied', (data: CollaborationEvent) => {
      this.emit('editReceived', data);
    });

    // Notification events
    this.socket.on('notification:received', (data: NotificationEvent) => {
      this.emit('notificationReceived', data);
    });

    this.socket.on('notification:subscribed', (data: { channels: string[]; subscribedAt: string }) => {
      this.emit('notificationSubscribed', data);
    });

    // Device events
    this.socket.on('device_connected', (data: any) => {
      this.emit('deviceConnected', data);
    });

    this.socket.on('device_disconnected', (data: any) => {
      this.emit('deviceDisconnected', data);
    });

    // Activity events
    this.socket.on('activity:status_updated', (data: ActivityEvent) => {
      this.emit('activityStatusUpdated', data);
    });

    this.socket.on('activity:heartbeat_ack', (data: { timestamp: string }) => {
      this.emit('heartbeatAck', data);
    });

    // AI processing events
    this.socket.on('ai:processing', (data: any) => {
      this.emit('aiProcessing', data);
    });

    // Platform events
    this.socket.on('platform:context_received', (data: any) => {
      this.emit('platformContextReceived', data);
    });

    // Error handling
    this.socket.on('error', (error: any) => {
      this.emit('error', error);
    });
  }

  private handleConnectionError(error: Error): void {
    console.error('WebSocket connection error:', error);
    this.emit('connectionError', error);
    
    if (this.config.autoReconnect) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.reconnectAttempts >= this.config.maxReconnectAttempts!) {
      return;
    }

    const delay = Math.min(
      this.config.reconnectInterval! * Math.pow(2, this.reconnectAttempts),
      30000 // Max 30 seconds
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      
      try {
        await this.connect();
      } catch (error) {
        console.error(`Reconnection attempt ${this.reconnectAttempts} failed:`, error);
      }
    }, delay);
  }

  private stopReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && this.socket) {
        this.socket.emit('activity:heartbeat');
      }
    }, 30000); // Every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Public getters
  get connected(): boolean {
    return this.isConnected;
  }

  get connecting(): boolean {
    return this.isConnecting;
  }

  get reconnectCount(): number {
    return this.reconnectAttempts;
  }
}

export default WebSocketClient;