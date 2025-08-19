/**
 * Cross-Platform Sync Service
 * Real-time synchronization between mobile and web platforms
 */

import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
// Conditional import for AsyncStorage to prevent build errors
let AsyncStorage: any;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch (error) {
  AsyncStorage = {
    getItem: () => Promise.resolve(null),
    setItem: () => Promise.resolve(),
    removeItem: () => Promise.resolve(),
  };
}

// React Native compatible EventEmitter
class EventEmitter {
  listeners: { [key: string]: Function[] } = {};
  on(event: string, listener: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(listener);
  }
  emit(event: string, ...args: any[]) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(listener => listener(...args));
    }
  }
  removeAllListeners() {
    this.listeners = {};
  }
}
import { dualPlatformClient, ChatMessage, Project } from './DualPlatformClient';

export interface SyncEvent {
  type: 'chat_message' | 'project_update' | 'file_change' | 'user_presence' | 'model_change';
  data: any;
  timestamp: string;
  platform: 'web' | 'mobile' | 'chat';
  userId: string;
  sessionId: string;
}

export interface SyncState {
  lastSyncTime: string;
  pendingChanges: SyncEvent[];
  conflictResolution: 'server' | 'local' | 'merge';
}

export interface UserPresence {
  userId: string;
  platform: 'web' | 'mobile' | 'chat';
  status: 'online' | 'typing' | 'away' | 'offline';
  lastSeen: string;
  currentProject?: string;
  currentFile?: string;
}

export interface ConflictResolution {
  id: string;
  type: 'file_conflict' | 'project_conflict' | 'message_conflict';
  localVersion: any;
  remoteVersion: any;
  timestamp: string;
  resolved: boolean;
  resolution?: any;
}

// Platform-specific WebSocket implementation
let PlatformWebSocket: any;

try {
  if (Platform.OS === 'web') {
    // Use browser WebSocket
    PlatformWebSocket = typeof WebSocket !== 'undefined' ? WebSocket : null;
  } else {
    // For React Native, use the built-in WebSocket
    PlatformWebSocket = global.WebSocket || WebSocket;
  }
} catch (error) {
  console.warn('WebSocket not available:', error);
  PlatformWebSocket = null;
}

export class CrossPlatformSync extends EventEmitter {
  private static instance: CrossPlatformSync;
  private webSocket: any = null;
  private chatWebSocket: any = null;
  private syncInterval: any = null;
  private isOnline: boolean = true;
  private syncState: SyncState = {
    lastSyncTime: new Date().toISOString(),
    pendingChanges: [],
    conflictResolution: 'server'
  };
  private userPresence: UserPresence[] = [];
  private conflicts: ConflictResolution[] = [];
  private sessionId: string = Math.random().toString(36).substring(7);

  private constructor() {
    super();
    this.loadSyncState();
    this.setupNetworkListeners();
  }

  static getInstance(): CrossPlatformSync {
    if (!CrossPlatformSync.instance) {
      CrossPlatformSync.instance = new CrossPlatformSync();
    }
    return CrossPlatformSync.instance;
  }

  /**
   * Initialize cross-platform sync
   */
  async initialize(): Promise<void> {
    try {
      await this.setupWebSocketConnections();
      await this.syncPendingChanges();
      this.startPeriodicSync();
      
      this.emit('sync-initialized');
      console.log('Cross-platform sync initialized');
    } catch (error) {
      console.error('Failed to initialize sync:', error);
      this.emit('sync-error', { error: error.message });
    }
  }

  /**
   * Setup WebSocket connections for real-time sync
   */
  private async setupWebSocketConnections(): Promise<void> {
    // Skip WebSocket setup during SSR or if not available
    if (typeof global === 'undefined' || !this.isWebSocketAvailable()) {
      console.log('WebSocket not available, skipping real-time sync');
      return;
    }

    const syncStatus = dualPlatformClient.getSyncStatus();
    
    if (!syncStatus.authenticated) {
      throw new Error('Not authenticated - cannot setup sync');
    }

    // Web Platform WebSocket
    if (syncStatus.webConnected) {
      try {
        this.webSocket = new PlatformWebSocket(
          `${this.getWebSocketUrl('web')}/sync?session=${this.sessionId}&platform=mobile`
        );
      
        this.webSocket.onopen = () => {
          this.emit('web-connected');
          this.sendPresenceUpdate('online');
        };
        
        this.webSocket.onmessage = (event) => {
          try {
            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            this.handleWebSocketMessage('web', data);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
        
        this.webSocket.onclose = () => {
          this.emit('web-disconnected');
          this.reconnectWebSocket('web');
        };

        this.webSocket.onerror = (error: any) => {
          console.error('Web WebSocket error:', error);
          this.emit('web-error', error);
        };
      } catch (error) {
        console.error('Failed to create web WebSocket:', error);
      }
    }

    // Chat Platform WebSocket
    if (syncStatus.chatConnected) {
      try {
        this.chatWebSocket = new PlatformWebSocket(
          `${this.getWebSocketUrl('chat')}/sync?session=${this.sessionId}&platform=mobile`
        );
        
        this.chatWebSocket.onopen = () => {
          this.emit('chat-connected');
        };
        
        this.chatWebSocket.onmessage = (event: any) => {
          try {
            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            this.handleWebSocketMessage('chat', data);
          } catch (error) {
            console.error('Error parsing chat WebSocket message:', error);
          }
        };
        
        this.chatWebSocket.onclose = () => {
          this.emit('chat-disconnected');
          this.reconnectWebSocket('chat');
        };

        this.chatWebSocket.onerror = (error: any) => {
          console.error('Chat WebSocket error:', error);
          this.emit('chat-error', error);
        };
      } catch (error) {
        console.error('Failed to create chat WebSocket:', error);
      }
    }
  }

  /**
   * Check if WebSocket is available in current environment
   */
  private isWebSocketAvailable(): boolean {
    return PlatformWebSocket !== null && typeof PlatformWebSocket !== 'undefined';
  }

  private getWebSocketUrl(platform: 'web' | 'chat'): string {
    const baseUrl = platform === 'web' 
      ? 'ws://localhost:3000' 
      : 'ws://localhost:3001';
    return baseUrl;
  }

  private reconnectWebSocket(platform: 'web' | 'chat'): void {
    setTimeout(() => {
      console.log(`Reconnecting to ${platform} platform...`);
      this.setupWebSocketConnections();
    }, 5000);
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleWebSocketMessage(platform: 'web' | 'chat', data: SyncEvent): void {
    console.log(`Received sync event from ${platform}:`, data);

    switch (data.type) {
      case 'chat_message':
        this.handleChatMessageSync(data);
        break;
      case 'project_update':
        this.handleProjectUpdateSync(data);
        break;
      case 'file_change':
        this.handleFileChangeSync(data);
        break;
      case 'user_presence':
        this.handleUserPresenceSync(data);
        break;
      case 'model_change':
        this.handleModelChangeSync(data);
        break;
      default:
        console.warn('Unknown sync event type:', data.type);
    }
  }

  /**
   * Chat message synchronization
   */
  private async handleChatMessageSync(event: SyncEvent): Promise<void> {
    const message: ChatMessage = event.data;
    
    // Check for conflicts (same timestamp, different content)
    const existingMessage = await this.getLocalMessage(message.id);
    
    if (existingMessage && existingMessage.content !== message.content) {
      // Conflict detected
      this.createConflict({
        id: message.id,
        type: 'message_conflict',
        localVersion: existingMessage,
        remoteVersion: message,
        timestamp: new Date().toISOString(),
        resolved: false
      });
    } else {
      // No conflict, apply update
      await this.updateLocalMessage(message);
      this.emit('message-synced', { message, platform: event.platform });
    }
  }

  /**
   * Project update synchronization
   */
  private async handleProjectUpdateSync(event: SyncEvent): Promise<void> {
    const project: Project = event.data;
    
    // Check for conflicts
    const localProject = await this.getLocalProject(project.id);
    
    if (localProject && localProject.updatedAt > project.updatedAt) {
      // Local version is newer - create conflict
      this.createConflict({
        id: project.id,
        type: 'project_conflict',
        localVersion: localProject,
        remoteVersion: project,
        timestamp: new Date().toISOString(),
        resolved: false
      });
    } else {
      // Remote version is newer or no conflict
      await this.updateLocalProject(project);
      this.emit('project-synced', { project, platform: event.platform });
    }
  }

  /**
   * File change synchronization
   */
  private async handleFileChangeSync(event: SyncEvent): Promise<void> {
    const { projectId, fileId, content, lastModified } = event.data;
    
    // Check for conflicts
    const localFile = await this.getLocalFile(projectId, fileId);
    
    if (localFile && localFile.lastModified > lastModified) {
      // Local file is newer - create conflict
      this.createConflict({
        id: `${projectId}-${fileId}`,
        type: 'file_conflict',
        localVersion: localFile,
        remoteVersion: { content, lastModified },
        timestamp: new Date().toISOString(),
        resolved: false
      });
    } else {
      // Apply remote changes
      await this.updateLocalFile(projectId, fileId, content, lastModified);
      this.emit('file-synced', { projectId, fileId, content, platform: event.platform });
    }
  }

  /**
   * User presence synchronization
   */
  private handleUserPresenceSync(event: SyncEvent): void {
    const presence: UserPresence = event.data;
    
    // Update presence list
    const existingIndex = this.userPresence.findIndex(p => p.userId === presence.userId);
    
    if (existingIndex >= 0) {
      this.userPresence[existingIndex] = presence;
    } else {
      this.userPresence.push(presence);
    }
    
    this.emit('presence-updated', { presence, userPresence: this.userPresence });
  }

  /**
   * Model change synchronization
   */
  private handleModelChangeSync(event: SyncEvent): void {
    const { modelId, provider } = event.data;
    this.emit('model-changed', { modelId, provider, platform: event.platform });
  }

  /**
   * Send sync events to other platforms
   */
  async sendSyncEvent(event: Omit<SyncEvent, 'timestamp' | 'platform' | 'userId' | 'sessionId'>): Promise<void> {
    const syncEvent: SyncEvent = {
      ...event,
      timestamp: new Date().toISOString(),
      platform: 'mobile',
      userId: 'current-user', // Would be from auth context
      sessionId: this.sessionId
    };

    let messageSent = false;

    // Send to web platform
    if (this.webSocket && this.isWebSocketReady(this.webSocket)) {
      try {
        this.webSocket.send(JSON.stringify(syncEvent));
        messageSent = true;
      } catch (error) {
        console.error('Error sending message to web platform:', error);
      }
    }

    // Send to chat platform
    if (this.chatWebSocket && this.isWebSocketReady(this.chatWebSocket)) {
      try {
        this.chatWebSocket.send(JSON.stringify(syncEvent));
        messageSent = true;
      } catch (error) {
        console.error('Error sending message to chat platform:', error);
      }
    }

    // If offline or failed to send, queue for later sync
    if (!this.isOnline || !messageSent) {
      this.syncState.pendingChanges.push(syncEvent);
      await this.saveSyncState();
    }
  }

  /**
   * Check if WebSocket is ready for sending messages
   */
  private isWebSocketReady(ws: any): boolean {
    if (!ws) return false;
    
    // For standard WebSocket
    if (typeof ws.readyState !== 'undefined') {
      return ws.readyState === 1; // WebSocket.OPEN
    }
    
    // Fallback for React Native WebSocket
    return ws._readyState === 1 || ws.readyState === 'open';
  }

  /**
   * Sync chat messages
   */
  async syncChatMessage(message: ChatMessage): Promise<void> {
    await this.sendSyncEvent({
      type: 'chat_message',
      data: message
    });
  }

  /**
   * Sync project updates
   */
  async syncProjectUpdate(project: Project): Promise<void> {
    await this.sendSyncEvent({
      type: 'project_update',
      data: project
    });
  }

  /**
   * Sync file changes
   */
  async syncFileChange(projectId: string, fileId: string, content: string): Promise<void> {
    await this.sendSyncEvent({
      type: 'file_change',
      data: {
        projectId,
        fileId,
        content,
        lastModified: new Date().toISOString()
      }
    });
  }

  /**
   * Send presence updates
   */
  async sendPresenceUpdate(status: UserPresence['status'], context?: {
    currentProject?: string;
    currentFile?: string;
  }): Promise<void> {
    const presence: UserPresence = {
      userId: 'current-user',
      platform: 'mobile',
      status,
      lastSeen: new Date().toISOString(),
      ...context
    };

    await this.sendSyncEvent({
      type: 'user_presence',
      data: presence
    });
  }

  /**
   * Conflict resolution
   */
  private createConflict(conflict: ConflictResolution): void {
    this.conflicts.push(conflict);
    this.emit('conflict-detected', conflict);
  }

  async resolveConflict(conflictId: string, resolution: 'local' | 'remote' | 'merge', mergedData?: any): Promise<void> {
    const conflict = this.conflicts.find(c => c.id === conflictId);
    if (!conflict) return;

    let resolvedData: any;

    switch (resolution) {
      case 'local':
        resolvedData = conflict.localVersion;
        break;
      case 'remote':
        resolvedData = conflict.remoteVersion;
        break;
      case 'merge':
        resolvedData = mergedData || this.mergeVersions(conflict.localVersion, conflict.remoteVersion);
        break;
    }

    // Apply resolution
    conflict.resolved = true;
    conflict.resolution = resolvedData;

    // Update local storage based on conflict type
    switch (conflict.type) {
      case 'message_conflict':
        await this.updateLocalMessage(resolvedData);
        break;
      case 'project_conflict':
        await this.updateLocalProject(resolvedData);
        break;
      case 'file_conflict':
        const [projectId, fileId] = conflict.id.split('-');
        await this.updateLocalFile(projectId, fileId, resolvedData.content, resolvedData.lastModified);
        break;
    }

    // Sync resolution to other platforms
    await this.sendSyncEvent({
      type: conflict.type.replace('_conflict', '_update') as any,
      data: resolvedData
    });

    this.emit('conflict-resolved', { conflict, resolution: resolvedData });
  }

  /**
   * Simple merge strategy for conflicts
   */
  private mergeVersions(local: any, remote: any): any {
    // Simple merge - prefer remote for most fields, but merge arrays
    const merged = { ...remote };
    
    if (Array.isArray(local) && Array.isArray(remote)) {
      // Merge arrays by unique IDs
      const localIds = new Set(local.map((item: any) => item.id));
      const remoteItems = remote.filter((item: any) => !localIds.has(item.id));
      return [...local, ...remoteItems];
    }
    
    return merged;
  }

  /**
   * Periodic sync for offline changes
   */
  private startPeriodicSync(): void {
    this.syncInterval = setInterval(() => {
      this.syncPendingChanges();
    }, 30000); // Sync every 30 seconds
  }

  private async syncPendingChanges(): Promise<void> {
    if (this.syncState.pendingChanges.length === 0) return;

    try {
      for (const change of this.syncState.pendingChanges) {
        await this.sendSyncEvent(change);
      }
      
      // Clear pending changes
      this.syncState.pendingChanges = [];
      this.syncState.lastSyncTime = new Date().toISOString();
      await this.saveSyncState();
      
      this.emit('sync-completed', { changeCount: this.syncState.pendingChanges.length });
    } catch (error) {
      console.error('Failed to sync pending changes:', error);
      this.emit('sync-error', { error: error.message });
    }
  }

  /**
   * Network status handling
   */
  private setupNetworkListeners(): void {
    // Use NetInfo for React Native network status
    if (Platform.OS !== 'web') {
      NetInfo.addEventListener(state => {
        const wasOnline = this.isOnline;
        this.isOnline = state.isConnected ?? true;
        
        if (wasOnline !== this.isOnline) {
          if (this.isOnline) {
            console.log('Network connected - reinitializing sync');
            this.initialize();
            this.emit('online');
          } else {
            console.log('Network disconnected');
            this.emit('offline');
          }
        }
      });

      // Get initial network state
      NetInfo.fetch().then(state => {
        this.isOnline = state.isConnected ?? true;
      });
    } else {
      // For web platform, use browser APIs
      if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
        this.isOnline = navigator.onLine;
        
        window.addEventListener('online', () => {
          this.isOnline = true;
          this.initialize();
          this.emit('online');
        });
        
        window.addEventListener('offline', () => {
          this.isOnline = false;
          this.emit('offline');
        });
      } else {
        // Fallback - assume online
        this.isOnline = true;
      }
    }
  }

  setNetworkStatus(isOnline: boolean): void {
    this.isOnline = isOnline;
    
    if (isOnline) {
      this.initialize(); // Reconnect when back online
      this.emit('online');
    } else {
      this.emit('offline');
    }
  }

  /**
   * Local storage operations
   */
  private async loadSyncState(): Promise<void> {
    try {
      // Skip during SSR or if AsyncStorage is not available
      if (this.isSSREnvironment() || !AsyncStorage) {
        return;
      }
      
      const state = await AsyncStorage.getItem('sync-state');
      if (state) {
        this.syncState = JSON.parse(state);
      }
    } catch (error) {
      console.error('Failed to load sync state:', error);
    }
  }

  private async saveSyncState(): Promise<void> {
    try {
      // Skip during SSR or if AsyncStorage is not available
      if (this.isSSREnvironment() || !AsyncStorage) {
        return;
      }
      
      await AsyncStorage.setItem('sync-state', JSON.stringify(this.syncState));
    } catch (error) {
      console.error('Failed to save sync state:', error);
    }
  }

  /**
   * Check if running in SSR environment
   */
  private isSSREnvironment(): boolean {
    return typeof window === 'undefined' && typeof global === 'undefined';
  }

  // Placeholder methods for local storage operations
  private async getLocalMessage(messageId: string): Promise<ChatMessage | null> {
    // Would integrate with local SQLite database
    return null;
  }

  private async updateLocalMessage(message: ChatMessage): Promise<void> {
    // Would update local SQLite database
  }

  private async getLocalProject(projectId: string): Promise<Project | null> {
    // Would integrate with local SQLite database
    return null;
  }

  private async updateLocalProject(project: Project): Promise<void> {
    // Would update local SQLite database
  }

  private async getLocalFile(projectId: string, fileId: string): Promise<any | null> {
    // Would integrate with local SQLite database
    return null;
  }

  private async updateLocalFile(projectId: string, fileId: string, content: string, lastModified: string): Promise<void> {
    // Would update local SQLite database
  }

  /**
   * Get sync status
   */
  getSyncStatus(): {
    connected: boolean;
    lastSync: string;
    pendingChanges: number;
    conflicts: number;
    userPresence: UserPresence[];
  } {
    const webConnected = this.webSocket && this.isWebSocketReady(this.webSocket);
    const chatConnected = this.chatWebSocket && this.isWebSocketReady(this.chatWebSocket);
    
    return {
      connected: webConnected || chatConnected,
      lastSync: this.syncState.lastSyncTime,
      pendingChanges: this.syncState.pendingChanges.length,
      conflicts: this.conflicts.filter(c => !c.resolved).length,
      userPresence: this.userPresence
    };
  }

  /**
   * Get active conflicts
   */
  getConflicts(): ConflictResolution[] {
    return this.conflicts.filter(c => !c.resolved);
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    if (this.webSocket) {
      this.webSocket.close();
    }
    
    if (this.chatWebSocket) {
      this.chatWebSocket.close();
    }
    
    await this.saveSyncState();
    this.removeAllListeners();
  }
}

// Export singleton instance
export const crossPlatformSync = CrossPlatformSync.getInstance();

// Export convenience functions
export const syncChatMessage = (message: ChatMessage) => 
  crossPlatformSync.syncChatMessage(message);

export const syncProjectUpdate = (project: Project) => 
  crossPlatformSync.syncProjectUpdate(project);

export const syncFileChange = (projectId: string, fileId: string, content: string) => 
  crossPlatformSync.syncFileChange(projectId, fileId, content);

export const sendPresenceUpdate = (status: UserPresence['status'], context?: any) => 
  crossPlatformSync.sendPresenceUpdate(status, context);

export const getSyncStatus = () => 
  crossPlatformSync.getSyncStatus();

export const getConflicts = () => 
  crossPlatformSync.getConflicts();

export const resolveConflict = (conflictId: string, resolution: 'local' | 'remote' | 'merge', mergedData?: any) => 
  crossPlatformSync.resolveConflict(conflictId, resolution, mergedData);