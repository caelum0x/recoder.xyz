/**
 * File System Synchronization for Cross-Platform Development
 * Handles real-time file sync across web, desktop, mobile, and CLI platforms
 */

import { Redis } from 'ioredis';
import { WebSocket } from 'ws';
import { createHash } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { join } from 'path';

export interface FileSystemNode {
  id: string;
  path: string;
  name: string;
  type: 'file' | 'directory';
  parentId?: string;
  size: number;
  mimeType?: string;
  encoding?: string;
  content?: string; // For small files, stored directly
  contentHash: string;
  lastModified: string;
  lastAccessed: string;
  createdAt: string;
  modifiedBy: string;
  version: number;
  isDeleted: boolean;
  permissions: {
    read: boolean;
    write: boolean;
    execute: boolean;
  };
  metadata: {
    isGenerated?: boolean;
    sourceMap?: string;
    dependencies?: string[];
    tags?: string[];
    description?: string;
  };
}

export interface FileSystemState {
  projectId: string;
  userId: string;
  rootPath: string;
  nodes: Map<string, FileSystemNode>;
  lastSync: string;
  syncVersion: number;
  conflictResolution: 'manual' | 'automatic' | 'latest-wins' | 'merge';
  syncSettings: {
    enableRealTimeSync: boolean;
    syncInterval: number; // seconds
    maxFileSize: number; // bytes
    excludePatterns: string[];
    includePatterns: string[];
    compressionEnabled: boolean;
    encryptionEnabled: boolean;
  };
}

export interface FileSyncEvent {
  type: 'file_created' | 'file_updated' | 'file_deleted' | 'file_moved' | 'file_renamed' |
        'directory_created' | 'directory_deleted' | 'directory_moved' | 'directory_renamed' |
        'sync_started' | 'sync_completed' | 'sync_conflict' | 'sync_error';
  projectId: string;
  userId: string;
  sessionId: string;
  platform: string;
  timestamp: string;
  fileId?: string;
  path: string;
  data: any;
  conflictData?: {
    conflictType: 'content' | 'metadata' | 'version';
    localVersion: number;
    remoteVersion: number;
    resolution: 'pending' | 'resolved' | 'rejected';
  };
}

export interface FileDiff {
  type: 'added' | 'modified' | 'deleted' | 'renamed' | 'moved';
  path: string;
  oldPath?: string;
  contentDiff?: string;
  metadata: Partial<FileSystemNode>;
}

export class FileSystemSyncManager {
  private redis: Redis;
  private wsConnections: Map<string, Set<WebSocket>> = new Map();
  private syncInProgress: Map<string, boolean> = new Map();
  private conflictQueue: Map<string, FileSyncEvent[]> = new Map();

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_FILESYSTEM_DB || '3'),
      keyPrefix: 'recoder:fs:',
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });
  }

  /**
   * Initialize file system for a project
   */
  async initializeFileSystem(
    projectId: string,
    userId: string,
    rootPath: string = '/'
  ): Promise<FileSystemState> {
    const fileSystem: FileSystemState = {
      projectId,
      userId,
      rootPath,
      nodes: new Map(),
      lastSync: new Date().toISOString(),
      syncVersion: 1,
      conflictResolution: 'latest-wins',
      syncSettings: {
        enableRealTimeSync: true,
        syncInterval: 30,
        maxFileSize: 50 * 1024 * 1024, // 50MB
        excludePatterns: [
          'node_modules/**',
          '.git/**',
          '.vscode/**',
          '*.log',
          '.env*',
          'dist/**',
          'build/**',
          '.next/**',
          '.nuxt/**',
          'coverage/**',
        ],
        includePatterns: ['**/*'],
        compressionEnabled: true,
        encryptionEnabled: false,
      },
    };

    // Create root directory node
    const rootNode: FileSystemNode = {
      id: this.generateNodeId(),
      path: rootPath,
      name: 'root',
      type: 'directory',
      size: 0,
      contentHash: '',
      lastModified: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      modifiedBy: userId,
      version: 1,
      isDeleted: false,
      permissions: { read: true, write: true, execute: true },
      metadata: {},
    };

    fileSystem.nodes.set(rootNode.id, rootNode);

    // Store file system state
    await this.redis.setex(
      `state:${projectId}`,
      30 * 24 * 60 * 60, // 30 days TTL
      JSON.stringify({
        ...fileSystem,
        nodes: Array.from(fileSystem.nodes.entries()),
      })
    );

    return fileSystem;
  }

  /**
   * Get file system state
   */
  async getFileSystemState(projectId: string): Promise<FileSystemState | null> {
    const stateData = await this.redis.get(`state:${projectId}`);
    if (!stateData) return null;

    try {
      const parsedState = JSON.parse(stateData);
      return {
        ...parsedState,
        nodes: new Map(parsedState.nodes),
      };
    } catch (error) {
      console.error('Failed to parse file system state:', error);
      return null;
    }
  }

  /**
   * Create file or directory
   */
  async createNode(
    projectId: string,
    userId: string,
    sessionId: string,
    platform: string,
    nodeData: Partial<FileSystemNode> & { path: string; type: 'file' | 'directory' }
  ): Promise<FileSystemNode | null> {
    const fileSystem = await this.getFileSystemState(projectId);
    if (!fileSystem) return null;

    // Check if path already exists
    const existingNode = Array.from(fileSystem.nodes.values())
      .find(node => node.path === nodeData.path && !node.isDeleted);
    
    if (existingNode) {
      throw new Error(`${nodeData.type} already exists at path: ${nodeData.path}`);
    }

    // Find parent directory
    const parentPath = this.getParentPath(nodeData.path);
    const parentNode = Array.from(fileSystem.nodes.values())
      .find(node => node.path === parentPath && node.type === 'directory' && !node.isDeleted);

    if (parentPath !== '/' && !parentNode) {
      throw new Error(`Parent directory not found: ${parentPath}`);
    }

    const now = new Date().toISOString();
    const content = nodeData.content || '';
    const contentHash = this.calculateContentHash(content);

    const newNode: FileSystemNode = {
      id: this.generateNodeId(),
      path: nodeData.path,
      name: nodeData.name || this.getFileName(nodeData.path),
      type: nodeData.type,
      parentId: parentNode?.id,
      size: nodeData.type === 'file' ? Buffer.byteLength(content, 'utf8') : 0,
      mimeType: nodeData.type === 'file' ? this.getMimeType(nodeData.path) : undefined,
      encoding: 'utf8',
      content: nodeData.type === 'file' ? content : undefined,
      contentHash,
      lastModified: now,
      lastAccessed: now,
      createdAt: now,
      modifiedBy: userId,
      version: 1,
      isDeleted: false,
      permissions: nodeData.permissions || { read: true, write: true, execute: false },
      metadata: nodeData.metadata || {},
    };

    // Add to file system
    fileSystem.nodes.set(newNode.id, newNode);
    fileSystem.lastSync = now;
    fileSystem.syncVersion++;

    // Save state
    await this.saveFileSystemState(fileSystem);

    // Broadcast event
    await this.broadcastFileSyncEvent({
      type: nodeData.type === 'file' ? 'file_created' : 'directory_created',
      projectId,
      userId,
      sessionId,
      platform,
      timestamp: now,
      fileId: newNode.id,
      path: newNode.path,
      data: { node: newNode },
    });

    return newNode;
  }

  /**
   * Update file content
   */
  async updateFileContent(
    projectId: string,
    filePath: string,
    content: string,
    userId: string,
    sessionId: string,
    platform: string
  ): Promise<FileSystemNode | null> {
    const fileSystem = await this.getFileSystemState(projectId);
    if (!fileSystem) return null;

    const fileNode = Array.from(fileSystem.nodes.values())
      .find(node => node.path === filePath && node.type === 'file' && !node.isDeleted);

    if (!fileNode) {
      throw new Error(`File not found: ${filePath}`);
    }

    const now = new Date().toISOString();
    const newContentHash = this.calculateContentHash(content);

    // Check for conflicts
    if (fileNode.contentHash !== this.calculateContentHash(fileNode.content || '')) {
      // Content has been modified by another session
      await this.handleSyncConflict(projectId, fileNode, content, userId, sessionId, platform);
      return null;
    }

    // Update file
    const updatedNode: FileSystemNode = {
      ...fileNode,
      content,
      contentHash: newContentHash,
      size: Buffer.byteLength(content, 'utf8'),
      lastModified: now,
      lastAccessed: now,
      modifiedBy: userId,
      version: fileNode.version + 1,
    };

    fileSystem.nodes.set(fileNode.id, updatedNode);
    fileSystem.lastSync = now;
    fileSystem.syncVersion++;

    // Save state
    await this.saveFileSystemState(fileSystem);

    // Broadcast event
    await this.broadcastFileSyncEvent({
      type: 'file_updated',
      projectId,
      userId,
      sessionId,
      platform,
      timestamp: now,
      fileId: fileNode.id,
      path: filePath,
      data: { 
        node: updatedNode,
        contentDiff: this.generateDiff(fileNode.content || '', content),
      },
    });

    return updatedNode;
  }

  /**
   * Delete file or directory
   */
  async deleteNode(
    projectId: string,
    path: string,
    userId: string,
    sessionId: string,
    platform: string
  ): Promise<boolean> {
    const fileSystem = await this.getFileSystemState(projectId);
    if (!fileSystem) return false;

    const node = Array.from(fileSystem.nodes.values())
      .find(n => n.path === path && !n.isDeleted);

    if (!node) {
      throw new Error(`Node not found: ${path}`);
    }

    const now = new Date().toISOString();

    // Mark as deleted (soft delete)
    const deletedNode: FileSystemNode = {
      ...node,
      isDeleted: true,
      lastModified: now,
      modifiedBy: userId,
      version: node.version + 1,
    };

    fileSystem.nodes.set(node.id, deletedNode);

    // If directory, mark all children as deleted
    if (node.type === 'directory') {
      const children = Array.from(fileSystem.nodes.values())
        .filter(n => n.path.startsWith(path + '/') && !n.isDeleted);

      for (const child of children) {
        const deletedChild: FileSystemNode = {
          ...child,
          isDeleted: true,
          lastModified: now,
          modifiedBy: userId,
          version: child.version + 1,
        };
        fileSystem.nodes.set(child.id, deletedChild);
      }
    }

    fileSystem.lastSync = now;
    fileSystem.syncVersion++;

    // Save state
    await this.saveFileSystemState(fileSystem);

    // Broadcast event
    await this.broadcastFileSyncEvent({
      type: node.type === 'file' ? 'file_deleted' : 'directory_deleted',
      projectId,
      userId,
      sessionId,
      platform,
      timestamp: now,
      fileId: node.id,
      path,
      data: { node: deletedNode },
    });

    return true;
  }

  /**
   * Move/rename node
   */
  async moveNode(
    projectId: string,
    oldPath: string,
    newPath: string,
    userId: string,
    sessionId: string,
    platform: string
  ): Promise<FileSystemNode | null> {
    const fileSystem = await this.getFileSystemState(projectId);
    if (!fileSystem) return null;

    const node = Array.from(fileSystem.nodes.values())
      .find(n => n.path === oldPath && !n.isDeleted);

    if (!node) {
      throw new Error(`Node not found: ${oldPath}`);
    }

    // Check if destination exists
    const existingNode = Array.from(fileSystem.nodes.values())
      .find(n => n.path === newPath && !n.isDeleted);

    if (existingNode) {
      throw new Error(`Destination already exists: ${newPath}`);
    }

    const now = new Date().toISOString();
    const newName = this.getFileName(newPath);
    const isRename = this.getParentPath(oldPath) === this.getParentPath(newPath);

    // Update node
    const movedNode: FileSystemNode = {
      ...node,
      path: newPath,
      name: newName,
      lastModified: now,
      modifiedBy: userId,
      version: node.version + 1,
    };

    fileSystem.nodes.set(node.id, movedNode);

    // If directory, update all children paths
    if (node.type === 'directory') {
      const children = Array.from(fileSystem.nodes.values())
        .filter(n => n.path.startsWith(oldPath + '/') && !n.isDeleted);

      for (const child of children) {
        const newChildPath = child.path.replace(oldPath, newPath);
        const updatedChild: FileSystemNode = {
          ...child,
          path: newChildPath,
          lastModified: now,
          version: child.version + 1,
        };
        fileSystem.nodes.set(child.id, updatedChild);
      }
    }

    fileSystem.lastSync = now;
    fileSystem.syncVersion++;

    // Save state
    await this.saveFileSystemState(fileSystem);

    // Broadcast event
    await this.broadcastFileSyncEvent({
      type: isRename ? 
        (node.type === 'file' ? 'file_renamed' : 'directory_renamed') :
        (node.type === 'file' ? 'file_moved' : 'directory_moved'),
      projectId,
      userId,
      sessionId,
      platform,
      timestamp: now,
      fileId: node.id,
      path: newPath,
      data: { node: movedNode, oldPath },
    });

    return movedNode;
  }

  /**
   * Get file tree
   */
  async getFileTree(projectId: string, path: string = '/'): Promise<FileSystemNode[]> {
    const fileSystem = await this.getFileSystemState(projectId);
    if (!fileSystem) return [];

    return Array.from(fileSystem.nodes.values())
      .filter(node => 
        !node.isDeleted && 
        (path === '/' ? true : node.path.startsWith(path))
      )
      .sort((a, b) => {
        // Directories first, then files
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
  }

  /**
   * Register WebSocket connection for file system updates
   */
  registerFileSystemWebSocket(projectId: string, ws: WebSocket): void {
    if (!this.wsConnections.has(projectId)) {
      this.wsConnections.set(projectId, new Set());
    }
    
    this.wsConnections.get(projectId)!.add(ws);

    ws.on('close', () => {
      this.wsConnections.get(projectId)?.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error for file system', projectId, error);
      this.wsConnections.get(projectId)?.delete(ws);
    });
  }

  /**
   * Handle sync conflicts
   */
  private async handleSyncConflict(
    projectId: string,
    node: FileSystemNode,
    newContent: string,
    userId: string,
    sessionId: string,
    platform: string
  ): Promise<void> {
    const conflictEvent: FileSyncEvent = {
      type: 'sync_conflict',
      projectId,
      userId,
      sessionId,
      platform,
      timestamp: new Date().toISOString(),
      fileId: node.id,
      path: node.path,
      data: { newContent, currentContent: node.content },
      conflictData: {
        conflictType: 'content',
        localVersion: node.version,
        remoteVersion: node.version + 1,
        resolution: 'pending',
      },
    };

    // Add to conflict queue
    if (!this.conflictQueue.has(projectId)) {
      this.conflictQueue.set(projectId, []);
    }
    this.conflictQueue.get(projectId)!.push(conflictEvent);

    // Broadcast conflict event
    await this.broadcastFileSyncEvent(conflictEvent);
  }

  /**
   * Broadcast file sync event
   */
  private async broadcastFileSyncEvent(event: FileSyncEvent): Promise<void> {
    // Store event in Redis for replay
    await this.redis.lpush(
      `events:${event.projectId}`,
      JSON.stringify(event)
    );
    
    // Keep only last 1000 events per project
    await this.redis.ltrim(`events:${event.projectId}`, 0, 999);

    // Broadcast to all project's WebSocket connections
    const connections = this.wsConnections.get(event.projectId);
    if (connections) {
      const message = JSON.stringify(event);
      
      for (const ws of connections) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(message);
          } catch (error) {
            console.error('Failed to send WebSocket message:', error);
            connections.delete(ws);
          }
        } else {
          connections.delete(ws);
        }
      }
    }
  }

  /**
   * Save file system state
   */
  private async saveFileSystemState(fileSystem: FileSystemState): Promise<void> {
    await this.redis.setex(
      `state:${fileSystem.projectId}`,
      30 * 24 * 60 * 60, // 30 days TTL
      JSON.stringify({
        ...fileSystem,
        nodes: Array.from(fileSystem.nodes.entries()),
      })
    );
  }

  /**
   * Helper methods
   */
  private generateNodeId(): string {
    return `node_${createHash('sha256').update(`${Date.now()}_${Math.random()}`).digest('hex').substring(0, 16)}`;
  }

  private calculateContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private getParentPath(path: string): string {
    const parts = path.split('/').filter(Boolean);
    if (parts.length <= 1) return '/';
    return '/' + parts.slice(0, -1).join('/');
  }

  private getFileName(path: string): string {
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  }

  private getMimeType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'js': 'application/javascript',
      'ts': 'application/typescript',
      'jsx': 'application/javascript',
      'tsx': 'application/typescript',
      'html': 'text/html',
      'css': 'text/css',
      'json': 'application/json',
      'md': 'text/markdown',
      'txt': 'text/plain',
      'py': 'text/x-python',
      'java': 'text/x-java',
      'cpp': 'text/x-c++src',
      'c': 'text/x-csrc',
      'rs': 'text/x-rust',
      'go': 'text/x-go',
      'php': 'text/x-php',
      'rb': 'text/x-ruby',
      'sh': 'text/x-shellscript',
      'xml': 'application/xml',
      'yaml': 'text/yaml',
      'yml': 'text/yaml',
      'toml': 'text/plain',
      'ini': 'text/plain',
      'conf': 'text/plain',
      'env': 'text/plain',
    };
    
    return mimeTypes[ext || ''] || 'text/plain';
  }

  private generateDiff(oldContent: string, newContent: string): string {
    // Simple line-based diff (in production, use a proper diff library)
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    const diff: string[] = [];
    const maxLines = Math.max(oldLines.length, newLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];
      
      if (oldLine !== newLine) {
        if (oldLine !== undefined) {
          diff.push(`- ${oldLine}`);
        }
        if (newLine !== undefined) {
          diff.push(`+ ${newLine}`);
        }
      }
    }
    
    return diff.join('\n');
  }

  /**
   * Get file system events
   */
  async getFileSystemEvents(projectId: string, limit: number = 100): Promise<FileSyncEvent[]> {
    const events = await this.redis.lrange(`events:${projectId}`, 0, limit - 1);
    return events.map(event => JSON.parse(event));
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    await this.redis.disconnect();
  }
}

// Export singleton instance
export const fileSystemSync = new FileSystemSyncManager();
