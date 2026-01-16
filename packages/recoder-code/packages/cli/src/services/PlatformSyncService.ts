/**
 * Platform Sync Service
 * Handles bidirectional sync between recoder-code CLI and recoder.xyz web platform
 * Detects if running inside recoder.xyz container and auto-connects
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import fs from 'node:fs';
import path from 'node:path';

const DOCKER_BACKEND_URL = process.env['DOCKER_BACKEND_URL'] || 'https://docker.recoder.xyz';
const RECODER_WEB_URL = process.env['RECODER_WEB_URL'] || 'https://web.recoder.xyz';

export interface FileChange {
  type: 'create' | 'modify' | 'delete';
  path: string;
  content?: string;
  timestamp: number;
}

export interface PlatformInfo {
  isContainer: boolean;
  isLinked: boolean; // Local project linked to web
  projectId?: string;
  previewUrl?: string;
  backendUrl?: string;
  webUrl?: string;
  workingDir?: string;
}

export class PlatformSyncService extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private platformInfo: PlatformInfo | null = null;
  private connected = false;
  private fileWatcher: fs.FSWatcher | null = null;
  private pendingChanges: FileChange[] = [];
  private syncEnabled = true;

  /**
   * Detect platform environment (container or local linked project)
   */
  async detectPlatform(workingDir?: string): Promise<PlatformInfo> {
    const cwd = workingDir || process.cwd();

    // Check for container markers first
    const isContainer = this.isInRecoderContainer();
    
    if (isContainer) {
      // Running in container
      const projectId = this.detectProjectId();
      const previewUrl = await this.detectPreviewUrl();

      this.platformInfo = {
        isContainer: true,
        isLinked: true,
        projectId,
        previewUrl,
        backendUrl: DOCKER_BACKEND_URL,
        webUrl: RECODER_WEB_URL,
        workingDir: '/workspace',
      };

      return this.platformInfo;
    }

    // Check for local linked project (.recoder-web file)
    const linkedProject = this.detectLinkedProject(cwd);
    
    if (linkedProject) {
      this.platformInfo = {
        isContainer: false,
        isLinked: true,
        projectId: linkedProject.projectId,
        previewUrl: linkedProject.previewUrl,
        backendUrl: DOCKER_BACKEND_URL,
        webUrl: linkedProject.webUrl || RECODER_WEB_URL,
        workingDir: cwd,
      };

      return this.platformInfo;
    }

    // Not in container and not linked
    this.platformInfo = { isContainer: false, isLinked: false };
    return this.platformInfo;
  }

  /**
   * Detect linked project from .recoder-web file
   */
  private detectLinkedProject(dir: string): { projectId: string; previewUrl?: string; webUrl?: string } | null {
    try {
      const metaFile = path.join(dir, '.recoder-web');
      if (fs.existsSync(metaFile)) {
        const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
        const projectId = meta.urlId || meta.projectId;
        if (projectId) {
          return {
            projectId,
            previewUrl: meta.previewUrl || `${DOCKER_BACKEND_URL}/preview/${projectId}`,
            webUrl: meta.webUrl || `${RECODER_WEB_URL}/chat/${projectId}`,
          };
        }
      }
    } catch {
      // Ignore
    }
    return null;
  }

  /**
   * Check if we're inside a recoder container
   */
  private isInRecoderContainer(): boolean {
    // Check for container-specific markers
    const markers = [
      // Check if /workspace exists (our standard working directory)
      fs.existsSync('/workspace'),
      // Check for recoder environment variable
      process.env['RECODER_CONTAINER'] === 'true',
      // Check for PTY_PORT (our container's PTY server)
      !!process.env['PTY_PORT'],
      // Check if running in Docker
      fs.existsSync('/.dockerenv'),
    ];

    return markers.some(Boolean);
  }

  /**
   * Extract project ID from container context
   */
  private detectProjectId(): string | undefined {
    // Try environment variable first
    if (process.env['RECODER_PROJECT_ID']) {
      return process.env['RECODER_PROJECT_ID'];
    }

    // Try to read from .recoder-web file
    try {
      const metaFile = path.join('/workspace', '.recoder-web');
      if (fs.existsSync(metaFile)) {
        const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
        return meta.projectId || meta.urlId;
      }
    } catch {
      // Ignore
    }

    // Try to extract from volume name (container labels)
    // This is set by docker-backend when creating containers
    try {
      const hostname = fs.readFileSync('/etc/hostname', 'utf-8').trim();
      if (hostname.startsWith('recoder-')) {
        return hostname.replace('recoder-', '');
      }
    } catch {
      // Ignore
    }

    return undefined;
  }

  /**
   * Get preview URL - constructed from env vars
   * Preview is proxied through docker-backend at /preview/{projectId}
   */
  private async detectPreviewUrl(): Promise<string | undefined> {
    const projectId = process.env['RECODER_PROJECT_ID'];
    if (!projectId) return undefined;
    
    // Preview is accessible via docker-backend proxy
    return `${DOCKER_BACKEND_URL}/preview/${projectId}`;
  }

  /**
   * Auto-initialize when running in container or linked project
   * Call this on CLI startup
   */
  async autoInitialize(): Promise<void> {
    const platform = await this.detectPlatform();

    // Not connected to platform at all
    if (!platform.isContainer && !platform.isLinked) {
      return;
    }

    // Show appropriate header
    if (platform.isContainer) {
      console.log('\n┌────────────────────────────────────────────────┐');
      console.log('│  🐳 recoder.xyz Container Environment          │');
    } else {
      console.log('\n┌────────────────────────────────────────────────┐');
      console.log('│  🔗 recoder.xyz Linked Project                 │');
    }

    console.log('├────────────────────────────────────────────────┤');
    console.log(`│  📁 Project: ${(platform.projectId || 'Unknown').padEnd(33)}│`);
    
    if (platform.previewUrl) {
      console.log(`│  🌐 Preview: ${platform.previewUrl.substring(0, 33).padEnd(33)}│`);
    }
    
    const webUrl = this.getWebProjectUrl();
    if (webUrl) {
      console.log(`│  💻 Web IDE: ${webUrl.substring(0, 33).padEnd(33)}│`);
    }

    // Auto-connect to sync (only for containers, local projects sync manually)
    if (platform.isContainer) {
      const connected = await this.connect();
      if (connected) {
        console.log('│  📡 Sync: Connected                            │');
        this.startFileWatcher();
      } else {
        console.log('│  📡 Sync: Offline (changes queued)             │');
      }
    } else {
      console.log('│  📡 Sync: Manual (use `recoder web sync`)      │');
    }

    console.log('└────────────────────────────────────────────────┘');
    console.log('');
  }

  /**
   * Connect to platform sync WebSocket
   */
  async connect(): Promise<boolean> {
    const platform = await this.detectPlatform();
    
    if (!platform.isContainer) {
      console.log('📍 Not running in recoder.xyz container');
      return false;
    }

    if (!platform.projectId) {
      console.log('⚠️  Container detected but no project ID found');
      return false;
    }

    return this.connectWebSocket(platform.projectId);
  }

  /**
   * Connect to file sync WebSocket
   */
  private connectWebSocket(projectId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const wsUrl = DOCKER_BACKEND_URL.replace('http', 'ws');
      
      try {
        this.ws = new WebSocket(`${wsUrl}/sync/${projectId}`);

        this.ws.on('open', () => {
          console.log('🔗 Connected to recoder.xyz platform sync');
          this.connected = true;
          this.emit('connected');
          // Flush any queued offline changes
          this.flushPendingChanges();
          resolve(true);
        });

        this.ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString());
            this.handleMessage(msg);
          } catch (e) {
            // Ignore parse errors
          }
        });

        this.ws.on('close', () => {
          console.log('🔌 Platform sync disconnected');
          this.connected = false;
          this.emit('disconnected');
          this.scheduleReconnect(projectId);
        });

        this.ws.on('error', (err) => {
          console.error('❌ Platform sync error:', err.message);
          this.connected = false;
          resolve(false);
        });

        // Timeout after 5 seconds
        setTimeout(() => {
          if (!this.connected) {
            resolve(false);
          }
        }, 5000);
      } catch (error) {
        console.error('❌ Failed to connect:', error);
        resolve(false);
      }
    });
  }

  /**
   * Handle incoming sync messages
   */
  private handleMessage(msg: any) {
    switch (msg.action) {
      case 'file-changed':
        // Remote file changed in web editor - check for conflicts
        const changes = msg.changes as FileChange[];
        for (const change of changes) {
          if (change.content && this.detectConflict(change.path, change.content)) {
            // Emit conflict for CLI to handle
            try {
              const fullPath = path.join('/workspace', change.path);
              const localContent = fs.readFileSync(fullPath, 'utf-8');
              this.emit('conflict', {
                path: change.path,
                localContent,
                remoteContent: change.content,
              });
            } catch {
              // If can't read local, just apply remote
              this.emit('remoteChange', [change]);
            }
          } else {
            this.emit('remoteChange', [change]);
          }
        }
        break;

      case 'refresh-preview':
        // Web editor requested preview refresh
        this.emit('refreshPreview');
        break;

      case 'content':
        // File content received - track version
        this.fileVersions.set(msg.path, {
          content: msg.content,
          timestamp: Date.now(),
        });
        this.emit('fileContent', { path: msg.path, content: msg.content });
        break;

      case 'files':
        // File list received
        this.emit('fileList', msg.files);
        break;

      case 'error':
        console.error('Sync error:', msg.error);
        break;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(projectId: string) {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      console.log('🔄 Attempting to reconnect...');
      this.connectWebSocket(projectId);
    }, 3000);
  }

  /**
   * Send file change to platform (with offline queuing)
   */
  async notifyFileChange(change: FileChange): Promise<void> {
    if (!this.syncEnabled) return;

    // Read file content for create/modify
    if (change.type !== 'delete' && !change.content) {
      try {
        const fullPath = path.join('/workspace', change.path);
        change.content = fs.readFileSync(fullPath, 'utf-8');
      } catch {
        // File might not exist yet
      }
    }

    // If offline, queue the change for later sync
    if (!this.connected || !this.ws) {
      this.pendingChanges.push(change);
      return;
    }

    this.ws.send(JSON.stringify({
      action: 'write',
      path: change.path,
      content: change.content || '',
    }));
  }

  /**
   * Flush pending changes when reconnected
   */
  private async flushPendingChanges(): Promise<void> {
    if (!this.connected || !this.ws || this.pendingChanges.length === 0) return;

    console.log(`📤 Syncing ${this.pendingChanges.length} offline changes...`);
    
    for (const change of this.pendingChanges) {
      this.ws.send(JSON.stringify({
        action: 'write',
        path: change.path,
        content: change.content || '',
      }));
    }

    this.pendingChanges = [];
    console.log('✅ Offline changes synced');
  }

  /**
   * Get count of pending offline changes
   */
  getPendingChangesCount(): number {
    return this.pendingChanges.length;
  }

  /**
   * Track file versions for conflict detection
   */
  private fileVersions = new Map<string, { content: string; timestamp: number }>();

  /**
   * Check if a remote change conflicts with local changes
   */
  private detectConflict(remotePath: string, remoteContent: string): boolean {
    const local = this.fileVersions.get(remotePath);
    if (!local) return false;

    // Check if local file was modified after last sync
    try {
      const fullPath = path.join('/workspace', remotePath);
      const currentContent = fs.readFileSync(fullPath, 'utf-8');
      
      // Conflict if local content differs from both synced version and remote
      if (currentContent !== local.content && currentContent !== remoteContent) {
        return true;
      }
    } catch {
      return false;
    }

    return false;
  }

  /**
   * Handle conflict resolution
   * Returns: 'local' | 'remote' | 'merge' | 'skip'
   */
  async resolveConflict(
    filePath: string,
    localContent: string,
    remoteContent: string,
    callback: (choice: 'local' | 'remote' | 'skip') => void
  ): Promise<void> {
    // Emit conflict event for UI to handle
    this.emit('conflict', {
      path: filePath,
      localContent,
      remoteContent,
      resolve: callback,
    });
  }

  /**
   * Start watching local files for changes
   */
  startFileWatcher(): void {
    if (this.fileWatcher || !this.platformInfo?.isContainer) {
      return;
    }

    const workspaceDir = '/workspace';
    const ignoredDirs = ['node_modules', '.git', 'dist', 'build', '.next'];

    console.log('👁️  Started watching files for sync...');

    // Use recursive file watching
    this.fileWatcher = fs.watch(
      workspaceDir,
      { recursive: true },
      (eventType, filename) => {
        if (!filename) return;

        // Skip ignored directories
        if (ignoredDirs.some(dir => filename.startsWith(dir + '/'))) {
          return;
        }

        const fullPath = path.join(workspaceDir, filename);
        const relativePath = filename;

        // Debounce and determine change type
        const changeType = fs.existsSync(fullPath) ? 
          (eventType === 'rename' ? 'create' : 'modify') : 
          'delete';

        const change: FileChange = {
          type: changeType,
          path: relativePath,
          timestamp: Date.now(),
        };

        this.notifyFileChange(change);
        this.emit('localChange', change);
      }
    );
  }

  /**
   * Stop file watcher
   */
  stopFileWatcher(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
      console.log('👁️  Stopped file watcher');
    }
  }

  /**
   * Request file from platform
   */
  async requestFile(filePath: string): Promise<void> {
    if (!this.connected || !this.ws) {
      return;
    }

    this.ws.send(JSON.stringify({
      action: 'read',
      path: filePath,
    }));
  }

  /**
   * Request file list from platform
   */
  async requestFileList(directory = '/workspace'): Promise<void> {
    if (!this.connected || !this.ws) {
      return;
    }

    this.ws.send(JSON.stringify({
      action: 'list',
      path: directory,
    }));
  }

  /**
   * Delete file via platform
   */
  async deleteFile(filePath: string): Promise<void> {
    if (!this.connected || !this.ws) {
      return;
    }

    this.ws.send(JSON.stringify({
      action: 'delete',
      path: filePath,
    }));
  }

  /**
   * Disconnect from platform
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.stopFileWatcher();
    this.connected = false;
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get platform info
   */
  getPlatformInfo(): PlatformInfo | null {
    return this.platformInfo;
  }

  /**
   * Enable/disable sync
   */
  setSyncEnabled(enabled: boolean): void {
    this.syncEnabled = enabled;
    console.log(`📡 Sync ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Display platform status
   */
  displayStatus(): void {
    const info = this.platformInfo;
    
    if (!info?.isContainer) {
      console.log('📍 Running locally (not in recoder.xyz container)');
      console.log('💡 Run in recoder.xyz terminal for live preview sync');
      return;
    }

    console.log('🐳 Running in recoder.xyz container');
    console.log(`📁 Project: ${info.projectId || 'Unknown'}`);
    console.log(`🔗 Backend: ${info.backendUrl}`);
    
    if (info.previewUrl) {
      console.log(`🌐 Preview: ${info.previewUrl}`);
    }
    
    console.log(`📡 Sync: ${this.connected ? 'Connected' : 'Disconnected'}`);
  }

  /**
   * Save chat message to platform (for CLI-web chat sync)
   */
  async saveChatMessage(message: {
    role: 'user' | 'assistant';
    content: string;
    id?: string;
  }): Promise<void> {
    if (!this.platformInfo?.projectId) return;

    try {
      const response = await fetch(`${RECODER_WEB_URL}/api/chat-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urlId: this.platformInfo.projectId,
          projectId: this.platformInfo.projectId,
          messages: [message],
          source: 'cli',
          cliVersion: process.env['npm_package_version'] || '2.5.0',
        }),
      });

      if (!response.ok) {
        console.warn('Failed to sync chat to platform');
      }
    } catch (e) {
      // Silently ignore - chat sync is optional
    }
  }

  /**
   * Load chat history from platform
   */
  async loadChatHistory(): Promise<any[]> {
    if (!this.platformInfo?.projectId) return [];

    try {
      const response = await fetch(
        `${RECODER_WEB_URL}/api/chat-history?urlId=${this.platformInfo.projectId}`
      );

      if (response.ok) {
        const data = await response.json();
        return data.data?.[0]?.messages || [];
      }
    } catch (e) {
      // Silently ignore
    }

    return [];
  }

  /**
   * Get the web URL for the current project
   */
  getWebProjectUrl(): string | undefined {
    if (!this.platformInfo?.projectId) return undefined;
    return `${RECODER_WEB_URL}/chat/${this.platformInfo.projectId}`;
  }
}

// Singleton instance
export const platformSync = new PlatformSyncService();
