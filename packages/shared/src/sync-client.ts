/**
 * Data Synchronization Client for Recoder.xyz
 * Handles cross-platform data sync with conflict resolution
 */

import { EventEmitter } from 'events';
import { AuthClient } from './auth-client';
import { WebSocketClient } from './websocket-client';
import axios, { AxiosInstance } from 'axios';

export interface SyncState {
  dataType: string;
  lastSyncAt: string;
  syncVersion: number;
  syncStatus: 'synced' | 'pending' | 'conflicted' | 'failed';
  conflictData?: any;
  deviceSyncMap: Record<string, number>;
}

export interface SyncConfig {
  authClient: AuthClient;
  webSocketClient?: WebSocketClient;
  baseURL?: string;
  syncInterval?: number;
  enableRealTimeSync?: boolean;
}

export interface ProjectData {
  id: string;
  name: string;
  type: string;
  description?: string;
  status: string;
  config: any;
  updatedAt: string;
}

export interface SettingsData {
  name?: string;
  organization?: string;
  preferences?: any;
  aiProviders?: any;
}

export interface SyncResult<T = any> {
  success: boolean;
  data?: T;
  version?: number;
  syncStatus: 'updated' | 'synced' | 'conflicted' | 'up_to_date';
  conflicted: boolean;
  conflicts?: any[];
}

export type SyncDataType = 'projects' | 'settings' | 'history' | 'preferences';

export class SyncClient extends EventEmitter {
  private authClient: AuthClient;
  private webSocketClient?: WebSocketClient;
  private api: AxiosInstance;
  private syncInterval?: NodeJS.Timeout;
  private config: SyncConfig;
  private localVersions: Map<SyncDataType, number> = new Map();
  private syncInProgress: Set<SyncDataType> = new Set();

  constructor(config: SyncConfig) {
    super();
    this.config = {
      baseURL: 'http://localhost:3001',
      syncInterval: 30000, // 30 seconds
      enableRealTimeSync: true,
      ...config
    };

    this.authClient = config.authClient;
    this.webSocketClient = config.webSocketClient;

    this.api = axios.create({
      baseURL: `${this.config.baseURL}/api`,
      timeout: 10000
    });

    this.setupAPIInterceptors();
    this.setupWebSocketListeners();
    this.loadLocalVersions();
  }

  private setupAPIInterceptors(): void {
    this.api.interceptors.request.use((config) => {
      const tokens = this.authClient.getTokens();
      if (tokens?.accessToken) {
        config.headers.Authorization = `Bearer ${tokens.accessToken}`;
      }
      return config;
    });
  }

  private setupWebSocketListeners(): void {
    if (!this.webSocketClient) return;

    this.webSocketClient.on('syncRequested', (data) => {
      this.handleSyncRequest(data);
    });

    this.webSocketClient.on('syncUpdated', (data) => {
      this.handleSyncUpdate(data);
    });
  }

  // Main Sync Methods

  async startAutoSync(): Promise<void> {
    if (this.syncInterval) return;

    // Initial sync
    await this.syncAll();

    // Set up periodic sync
    this.syncInterval = setInterval(() => {
      this.syncAll().catch(error => {
        console.error('Auto sync failed:', error);
        this.emit('syncError', { error, dataType: 'all' });
      });
    }, this.config.syncInterval);

    this.emit('autoSyncStarted');
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
      this.emit('autoSyncStopped');
    }
  }

  async syncAll(): Promise<void> {
    const dataTypes: SyncDataType[] = ['projects', 'settings', 'history', 'preferences'];
    
    const results = await Promise.allSettled(
      dataTypes.map(dataType => this.sync(dataType))
    );

    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length > 0) {
      console.error('Some syncs failed:', failures);
      this.emit('syncPartialFailure', failures);
    }
  }

  async sync<T = any>(dataType: SyncDataType): Promise<SyncResult<T>> {
    if (this.syncInProgress.has(dataType)) {
      throw new Error(`Sync already in progress for ${dataType}`);
    }

    this.syncInProgress.add(dataType);

    try {
      const localVersion = this.localVersions.get(dataType) || 1;
      const deviceInfo = this.authClient.getDeviceInfo();

      const result = await this.performSync<T>(dataType, localVersion, deviceInfo?.deviceId);
      
      if (result.success && result.version) {
        this.localVersions.set(dataType, result.version);
        this.saveLocalVersions();
      }

      this.emit('syncCompleted', { dataType, result });
      return result;

    } finally {
      this.syncInProgress.delete(dataType);
    }
  }

  // Specific Data Type Sync Methods

  async syncProjects(): Promise<SyncResult<ProjectData[]>> {
    return this.sync<ProjectData[]>('projects');
  }

  async syncSettings(): Promise<SyncResult<SettingsData>> {
    return this.sync<SettingsData>('settings');
  }

  async updateProjects(projects: ProjectData[]): Promise<SyncResult<ProjectData[]>> {
    const localVersion = this.localVersions.get('projects') || 1;
    const deviceInfo = this.authClient.getDeviceInfo();

    try {
      const response = await this.api.post('/sync/projects', {
        deviceId: deviceInfo?.deviceId,
        localVersion: localVersion + 1,
        projects
      });

      const result: SyncResult<ProjectData[]> = response.data.data;
      
      if (result.version) {
        this.localVersions.set('projects', result.version);
        this.saveLocalVersions();
      }

      // Notify via WebSocket if available
      if (this.webSocketClient?.connected) {
        await this.webSocketClient.updateSync('projects', result.version || localVersion + 1, projects);
      }

      this.emit('projectsUpdated', result);
      return result;

    } catch (error: any) {
      throw this.handleSyncError(error);
    }
  }

  async updateSettings(settings: SettingsData): Promise<SyncResult<SettingsData>> {
    const localVersion = this.localVersions.get('settings') || 1;
    const deviceInfo = this.authClient.getDeviceInfo();

    try {
      const response = await this.api.post('/sync/settings', {
        deviceId: deviceInfo?.deviceId,
        localVersion: localVersion + 1,
        settings
      });

      const result: SyncResult<SettingsData> = response.data.data;
      
      if (result.version) {
        this.localVersions.set('settings', result.version);
        this.saveLocalVersions();
      }

      // Notify via WebSocket if available
      if (this.webSocketClient?.connected) {
        await this.webSocketClient.updateSync('settings', result.version || localVersion + 1, settings);
      }

      this.emit('settingsUpdated', result);
      return result;

    } catch (error: any) {
      throw this.handleSyncError(error);
    }
  }

  // Conflict Resolution

  async resolveConflict(
    dataType: SyncDataType,
    resolution: 'server_wins' | 'client_wins' | 'merge',
    resolvedData?: any
  ): Promise<SyncResult> {
    const deviceInfo = this.authClient.getDeviceInfo();

    try {
      const response = await this.api.post('/sync/resolve-conflicts', {
        dataType,
        resolution,
        deviceId: deviceInfo?.deviceId,
        resolvedData
      });

      const result: SyncResult = response.data.data;
      
      if (result.version) {
        this.localVersions.set(dataType, result.version);
        this.saveLocalVersions();
      }

      this.emit('conflictResolved', { dataType, resolution, result });
      return result;

    } catch (error: any) {
      throw this.handleSyncError(error);
    }
  }

  // Force Sync

  async forceSync(): Promise<any> {
    const deviceInfo = this.authClient.getDeviceInfo();

    try {
      const response = await this.api.post('/sync/force-sync', {
        deviceId: deviceInfo?.deviceId
      });

      const result = response.data.data;
      
      // Update all local versions
      if (result.versions) {
        Object.entries(result.versions).forEach(([dataType, version]) => {
          this.localVersions.set(dataType as SyncDataType, version as number);
        });
        this.saveLocalVersions();
      }

      this.emit('forceSyncCompleted', result);
      return result;

    } catch (error: any) {
      throw this.handleSyncError(error);
    }
  }

  // Sync Status

  async getSyncStatus(): Promise<SyncState[]> {
    try {
      const response = await this.api.get('/sync/status');
      return response.data.data;
    } catch (error: any) {
      throw this.handleSyncError(error);
    }
  }

  // Private Methods

  private async performSync<T>(
    dataType: SyncDataType,
    localVersion: number,
    deviceId?: string
  ): Promise<SyncResult<T>> {
    try {
      const endpoint = `/sync/${dataType}`;
      const response = await this.api.post(endpoint, {
        deviceId,
        localVersion
      });

      return response.data.data;
    } catch (error: any) {
      throw this.handleSyncError(error);
    }
  }

  private handleSyncRequest(data: any): void {
    this.emit('syncRequested', {
      dataType: data.dataType,
      version: data.version,
      requestedBy: data.requestedBy
    });

    // Auto-sync if real-time sync is enabled
    if (this.config.enableRealTimeSync) {
      this.sync(data.dataType).catch(error => {
        console.error(`Failed to handle sync request for ${data.dataType}:`, error);
      });
    }
  }

  private handleSyncUpdate(data: any): void {
    this.emit('syncUpdated', {
      dataType: data.dataType,
      version: data.version,
      changes: data.changes,
      updatedBy: data.updatedBy
    });

    // Update local version if newer
    const currentVersion = this.localVersions.get(data.dataType) || 0;
    if (data.version > currentVersion) {
      this.localVersions.set(data.dataType, data.version);
      this.saveLocalVersions();
    }
  }

  private handleSyncError(error: any): Error {
    const message = error.response?.data?.error?.message || error.message || 'Sync failed';
    return new Error(message);
  }

  private loadLocalVersions(): void {
    try {
      if (typeof window !== 'undefined' && window && window.localStorage && typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('recoder-sync-versions');
        if (stored) {
          const versions = JSON.parse(stored);
          Object.entries(versions).forEach(([dataType, version]) => {
            this.localVersions.set(dataType as SyncDataType, version as number);
          });
        }
      } else if (typeof process !== 'undefined' && process) {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        
        const syncFile = path.join(os.homedir(), '.recoder', 'sync-versions.json');
        if (fs.existsSync(syncFile)) {
          const content = fs.readFileSync(syncFile, 'utf-8');
          const versions = JSON.parse(content);
          Object.entries(versions).forEach(([dataType, version]) => {
            this.localVersions.set(dataType as SyncDataType, version as number);
          });
        }
      }
    } catch (error) {
      console.error('Failed to load sync versions:', error);
    }
  }

  private saveLocalVersions(): void {
    try {
      const versions = Object.fromEntries(this.localVersions);

      if (typeof window !== 'undefined' && window && window.localStorage && typeof localStorage !== 'undefined') {
        localStorage.setItem('recoder-sync-versions', JSON.stringify(versions));
      } else if (typeof process !== 'undefined' && process) {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        
        const configDir = path.join(os.homedir(), '.recoder');
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }
        
        const syncFile = path.join(configDir, 'sync-versions.json');
        fs.writeFileSync(syncFile, JSON.stringify(versions, null, 2));
      }
    } catch (error) {
      console.error('Failed to save sync versions:', error);
    }
  }

  // Public getters
  get isSyncing(): boolean {
    return this.syncInProgress.size > 0;
  }

  get autoSyncEnabled(): boolean {
    return !!this.syncInterval;
  }

  getLocalVersion(dataType: SyncDataType): number {
    return this.localVersions.get(dataType) || 1;
  }

  getSyncingDataTypes(): SyncDataType[] {
    return Array.from(this.syncInProgress);
  }
}

export default SyncClient;