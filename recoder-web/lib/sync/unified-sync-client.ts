/**
 * Unified Cross-Platform Synchronization Client
 * Provides consistent sync API across web, mobile, desktop, and CLI platforms
 */

import { io, Socket } from 'socket.io-client';

export interface SyncClientConfig {
  apiBaseUrl: string;
  webSocketUrl: string;
  userId?: string;
  sessionId?: string;
  projectId?: string;
  platform: 'web' | 'mobile' | 'desktop' | 'cli' | 'vscode';
  authToken?: string;
  reconnect?: boolean;
  debug?: boolean;
}

export interface ProjectFile {
  id: string;
  path: string;
  name: string;
  content: string;
  contentHash: string;
  size: number;
  type: 'file' | 'directory';
  mimeType?: string;
  lastModified: string;
  modifiedBy: string;
  version: number;
  locked?: {
    userId: string;
    sessionId: string;
    expiresAt: string;
  };
}

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  lastModified: string;
  modifiedBy: string;
  children?: FileTreeNode[];
  contentHash?: string;
  mimeType?: string;
  locked?: {
    userId: string;
    sessionId: string;
    expiresAt: string;
  };
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  language: string;
  framework: string;
  category: string;
  tags: string[];
  features: string[];
  isOfficial: boolean;
}

export class UnifiedSyncClient {
  private config: SyncClientConfig;
  private socket: Socket | null = null;
  private eventHandlers: Map<string, Function[]> = new Map();
  private connectionState: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';

  constructor(config: SyncClientConfig) {
    this.config = config;
    this.setupEventHandlers();
  }

  /**
   * Connect to sync services
   */
  async connect(): Promise<void> {
    if (this.connectionState === 'connected') return;

    this.connectionState = 'connecting';

    try {
      // Initialize WebSocket connection
      this.socket = io(this.config.webSocketUrl, {
        path: '/api/sync/websocket',
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: this.config.reconnect !== false,
        extraHeaders: {
          'x-platform': this.config.platform,
          'x-user-id': this.config.userId || '',
          'x-session-id': this.config.sessionId || '',
          'x-project-id': this.config.projectId || '',
          'authorization': this.config.authToken ? `Bearer ${this.config.authToken}` : '',
        },
      });

      // Set up socket event handlers
      this.socket.on('connect', () => {
        this.connectionState = 'connected';
        this.debug('Connected to sync service');
        this.emit('connected', { timestamp: new Date().toISOString() });
      });

      this.socket.on('disconnect', () => {
        this.connectionState = 'disconnected';
        this.debug('Disconnected from sync service');
        this.emit('disconnected', { timestamp: new Date().toISOString() });
      });

      this.socket.on('error', (error) => {
        this.connectionState = 'error';
        this.debug('WebSocket error:', error);
        this.emit('error', { error, timestamp: new Date().toISOString() });
      });

      // Set up sync event handlers
      this.setupSyncEventHandlers();

      // Wait for connection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        this.socket!.on('connected', () => {
          clearTimeout(timeout);
          resolve(void 0);
        });

        this.socket!.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

    } catch (error) {
      this.connectionState = 'error';
      throw error;
    }
  }

  /**
   * Disconnect from sync services
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connectionState = 'disconnected';
  }

  /**
   * Project Management APIs
   */
  
  async getProjects(): Promise<any[]> {
    const response = await this.apiRequest('GET', '/sync/projects?action=list');
    return response.projects;
  }

  async getProject(projectId: string): Promise<any> {
    const response = await this.apiRequest('GET', `/sync/projects?action=get&projectId=${projectId}`);
    return response.project;
  }

  async createProject(projectData: any): Promise<any> {
    const response = await this.apiRequest('POST', '/sync/projects', {
      action: 'create',
      ...projectData,
    });
    return response.project;
  }

  async updateProject(projectId: string, updates: any): Promise<any> {
    const response = await this.apiRequest('POST', '/sync/projects', {
      action: 'update',
      projectId,
      ...updates,
    });
    return response.project;
  }

  /**
   * File Tree and File Management APIs
   */
  
  async getFileTree(projectId: string): Promise<FileTreeNode[]> {
    if (this.socket && this.connectionState === 'connected') {
      // Use WebSocket for real-time updates
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('File tree request timeout'));
        }, 5000);

        this.socket!.once('file_tree_response', (data) => {
          clearTimeout(timeout);
          resolve(data.files);
        });

        this.socket!.emit('message', {
          type: 'file_tree_request',
          data: { projectId },
        });
      });
    } else {
      // Fallback to REST API
      const response = await this.apiRequest('GET', `/sync/projects?action=files&projectId=${projectId}`);
      return response.files;
    }
  }

  async getFileContent(projectId: string, filePath: string): Promise<{ content: string; file: ProjectFile }> {
    if (this.socket && this.connectionState === 'connected') {
      // Use WebSocket for real-time updates
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('File content request timeout'));
        }, 5000);

        this.socket!.once('file_content_response', (data) => {
          clearTimeout(timeout);
          if (data.fileData) {
            resolve(data.fileData);
          } else {
            reject(new Error('File not found'));
          }
        });

        this.socket!.emit('message', {
          type: 'file_content_request',
          data: { filePath },
        });
      });
    } else {
      // Fallback to REST API
      const response = await this.apiRequest('GET', `/sync/projects?action=file&projectId=${projectId}&path=${encodeURIComponent(filePath)}`);
      return response;
    }
  }

  async updateFile(projectId: string, filePath: string, content: string): Promise<ProjectFile> {
    if (this.socket && this.connectionState === 'connected') {
      // Use WebSocket for real-time updates
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('File update timeout'));
        }, 10000);

        this.socket!.once('file_update_response', (data) => {
          clearTimeout(timeout);
          if (data.file) {
            resolve(data.file);
          } else {
            reject(new Error('File update failed'));
          }
        });

        this.socket!.emit('message', {
          type: 'file_update',
          data: { filePath, content },
        });
      });
    } else {
      // Fallback to REST API
      const response = await this.apiRequest('POST', '/sync/projects', {
        action: 'updateFile',
        projectId,
        filePath,
        content,
      });
      return response.file;
    }
  }

  async createDirectory(projectId: string, dirPath: string): Promise<ProjectFile> {
    const response = await this.apiRequest('POST', '/sync/projects', {
      action: 'createDirectory',
      projectId,
      dirPath,
    });
    return response.directory;
  }

  async deleteFile(projectId: string, filePath: string): Promise<boolean> {
    const response = await this.apiRequest('POST', '/sync/projects', {
      action: 'deleteFile',
      projectId,
      filePath,
    });
    return response.success;
  }

  /**
   * File Locking APIs
   */
  
  async lockFile(projectId: string, filePath: string, duration?: number): Promise<boolean> {
    if (this.socket && this.connectionState === 'connected') {
      return new Promise((resolve) => {
        this.socket!.once('file_lock_response', (data) => {
          resolve(data.success);
        });

        this.socket!.emit('message', {
          type: 'file_lock_request',
          data: { filePath, duration },
        });
      });
    } else {
      const response = await this.apiRequest('POST', '/sync/projects', {
        action: 'lockFile',
        projectId,
        filePath,
        duration,
      });
      return response.success;
    }
  }

  async unlockFile(projectId: string, filePath: string): Promise<boolean> {
    if (this.socket && this.connectionState === 'connected') {
      return new Promise((resolve) => {
        this.socket!.once('file_unlock_response', (data) => {
          resolve(data.success);
        });

        this.socket!.emit('message', {
          type: 'file_unlock_request',
          data: { filePath },
        });
      });
    } else {
      const response = await this.apiRequest('POST', '/sync/projects', {
        action: 'unlockFile',
        projectId,
        filePath,
      });
      return response.success;
    }
  }

  /**
   * Project Templates APIs
   */
  
  async getTemplates(category?: string, language?: string): Promise<ProjectTemplate[]> {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (language) params.set('language', language);
    
    const response = await this.apiRequest('GET', `/sync/projects?action=templates&${params.toString()}`);
    return response.templates;
  }

  async createProjectFromTemplate(templateId: string, projectName: string, customizations?: any): Promise<any> {
    const response = await this.apiRequest('POST', '/sync/projects', {
      action: 'createFromTemplate',
      templateId,
      projectName,
      customizations,
    });
    return response.project;
  }

  /**
   * Event System
   */
  
  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  off(event: string, handler?: Function): void {
    if (!this.eventHandlers.has(event)) return;
    
    if (handler) {
      const handlers = this.eventHandlers.get(event)!;
      const index = handlers.indexOf(handler);
      if (index > -1) handlers.splice(index, 1);
    } else {
      this.eventHandlers.delete(event);
    }
  }

  private emit(event: string, data: any): void {
    if (!this.eventHandlers.has(event)) return;
    
    const handlers = this.eventHandlers.get(event)!;
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (error) {
        this.debug('Event handler error:', error);
      }
    }
  }

  /**
   * Session Management
   */
  
  async heartbeat(): Promise<void> {
    if (this.socket && this.connectionState === 'connected') {
      this.socket.emit('message', {
        type: 'session_heartbeat',
        data: {},
      });
    }
  }

  async getSyncStatus(): Promise<any> {
    if (this.socket && this.connectionState === 'connected') {
      return new Promise((resolve) => {
        this.socket!.once('sync_status_response', (data) => {
          resolve(data.status);
        });

        this.socket!.emit('message', {
          type: 'sync_status_request',
          data: {},
        });
      });
    }
    return null;
  }

  /**
   * Private helper methods
   */
  
  private setupEventHandlers(): void {
    // Platform-specific event setup can be added here
  }

  private setupSyncEventHandlers(): void {
    if (!this.socket) return;

    // Handle real-time sync events
    this.socket.on('project_created', (data) => this.emit('project_created', data));
    this.socket.on('project_updated', (data) => this.emit('project_updated', data));
    this.socket.on('project_deleted', (data) => this.emit('project_deleted', data));
    this.socket.on('file_created', (data) => this.emit('file_created', data));
    this.socket.on('file_updated', (data) => this.emit('file_updated', data));
    this.socket.on('file_deleted', (data) => this.emit('file_deleted', data));
    this.socket.on('file_locked', (data) => this.emit('file_locked', data));
    this.socket.on('file_unlocked', (data) => this.emit('file_unlocked', data));
    this.socket.on('settings_updated', (data) => this.emit('settings_updated', data));
  }

  private async apiRequest(method: string, endpoint: string, data?: any): Promise<any> {
    const url = `${this.config.apiBaseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-platform': this.config.platform,
    };

    if (this.config.authToken) {
      headers['authorization'] = `Bearer ${this.config.authToken}`;
    }

    if (this.config.sessionId) {
      headers['x-session-id'] = this.config.sessionId;
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  private debug(...args: any[]): void {
    if (this.config.debug) {
      console.log('[UnifiedSyncClient]', ...args);
    }
  }

  /**
   * Platform-specific helpers
   */
  
  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  getConnectionState(): string {
    return this.connectionState;
  }

  updateConfig(updates: Partial<SyncClientConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// Export factory function for easy initialization
export function createSyncClient(config: SyncClientConfig): UnifiedSyncClient {
  return new UnifiedSyncClient(config);
}
