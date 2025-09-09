/**
 * Project Synchronization System for Cross-Platform Development
 * Handles real-time project state sync across all platforms
 */

import { Redis } from 'ioredis';
import { WebSocket } from 'ws';
import { createHash } from 'crypto';

export interface ProjectSyncState {
  projectId: string;
  userId: string;
  name: string;
  description?: string;
  language: string;
  framework: string;
  version: string;
  lastModified: string;
  modifiedBy: {
    userId: string;
    platform: string;
    sessionId: string;
  };
  files: ProjectFile[];
  dependencies: ProjectDependency[];
  configuration: ProjectConfiguration;
  deployments: ProjectDeployment[];
  collaborators: ProjectCollaborator[];
  tags: string[];
  status: 'active' | 'archived' | 'template';
  visibility: 'private' | 'public' | 'team';
  metadata: Record<string, any>;
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

export interface ProjectDependency {
  name: string;
  version: string;
  type: 'runtime' | 'dev' | 'peer';
  registry: 'npm' | 'pypi' | 'maven' | 'nuget' | 'crates' | 'go' | 'custom';
  installed: boolean;
  lastUpdated: string;
}

export interface ProjectConfiguration {
  buildSettings: Record<string, any>;
  environmentVariables: Record<string, string>;
  scripts: Record<string, string>;
  deploymentSettings: Record<string, any>;
  aiSettings: {
    preferredModels: string[];
    consensus: boolean;
    autoSuggestions: boolean;
  };
  editorSettings: {
    theme: string;
    fontSize: number;
    tabSize: number;
    wordWrap: boolean;
    minimap: boolean;
  };
}

export interface ProjectDeployment {
  id: string;
  platform: 'vercel' | 'netlify' | 'aws' | 'gcp' | 'azure' | 'railway' | 'render' | 'custom';
  url: string;
  status: 'pending' | 'building' | 'success' | 'failed';
  branch: string;
  commit: string;
  createdAt: string;
  logs?: string;
}

export interface ProjectCollaborator {
  userId: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  permissions: string[];
  addedAt: string;
  addedBy: string;
  lastActive?: string;
}

export interface ProjectSyncEvent {
  type: 'project_created' | 'project_updated' | 'project_deleted' | 
        'file_created' | 'file_updated' | 'file_deleted' | 'file_locked' | 'file_unlocked' |
        'dependency_added' | 'dependency_updated' | 'dependency_removed' |
        'deployment_started' | 'deployment_completed' | 'deployment_failed' |
        'collaborator_added' | 'collaborator_removed' | 'collaborator_updated';
  projectId: string;
  userId: string;
  sessionId: string;
  platform: string;
  timestamp: string;
  data: any;
  conflictResolution?: 'merge' | 'overwrite' | 'reject';
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
  category: 'web' | 'mobile' | 'desktop' | 'ai' | 'api' | 'fullstack' | 'game' | 'other';
  tags: string[];
  features: string[];
  files: Array<{
    path: string;
    content: string;
    type: 'file' | 'directory';
  }>;
  dependencies: ProjectDependency[];
  configuration: Partial<ProjectConfiguration>;
  thumbnail?: string;
  isOfficial: boolean;
  createdBy: string;
  createdAt: string;
  downloads: number;
  rating: number;
}

export class ProjectSyncManager {
  private redis: Redis;
  private wsConnections: Map<string, Set<WebSocket>> = new Map();
  private fileLocks: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_PROJECT_DB || '1'),
      keyPrefix: 'recoder:project:',
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });
  }

  /**
   * Create a new project
   */
  async createProject(
    userId: string, 
    sessionId: string, 
    platform: string,
    projectData: Partial<ProjectSyncState>
  ): Promise<ProjectSyncState> {
    const projectId = this.generateProjectId();
    
    const project: ProjectSyncState = {
      projectId,
      userId,
      name: projectData.name || 'Untitled Project',
      description: projectData.description,
      language: projectData.language || 'javascript',
      framework: projectData.framework || 'next',
      version: '1.0.0',
      lastModified: new Date().toISOString(),
      modifiedBy: { userId, platform, sessionId },
      files: projectData.files || [],
      dependencies: projectData.dependencies || [],
      configuration: projectData.configuration || this.getDefaultConfiguration(),
      deployments: [],
      collaborators: [{ 
        userId, 
        role: 'owner', 
        permissions: ['*'], 
        addedAt: new Date().toISOString(), 
        addedBy: userId 
      }],
      tags: projectData.tags || [],
      status: 'active',
      visibility: projectData.visibility || 'private',
      metadata: projectData.metadata || {},
    };

    // Store project
    await this.redis.setex(
      `data:${projectId}`,
      30 * 24 * 60 * 60, // 30 days TTL
      JSON.stringify(project)
    );

    // Add to user's projects
    await this.redis.sadd(`user:${userId}:projects`, projectId);

    // Broadcast creation event
    await this.broadcastProjectEvent({
      type: 'project_created',
      projectId,
      userId,
      sessionId,
      platform,
      timestamp: new Date().toISOString(),
      data: { project },
    });

    return project;
  }

  /**
   * Get project by ID
   */
  async getProject(projectId: string, userId?: string): Promise<ProjectSyncState | null> {
    const projectData = await this.redis.get(`data:${projectId}`);
    if (!projectData) return null;

    try {
      const project: ProjectSyncState = JSON.parse(projectData);
      
      // Check access permissions
      if (userId && !this.hasProjectAccess(project, userId)) {
        return null;
      }

      return project;
    } catch (error) {
      console.error('Failed to parse project data:', error);
      return null;
    }
  }

  /**
   * Update project
   */
  async updateProject(
    projectId: string,
    userId: string,
    sessionId: string,
    platform: string,
    updates: Partial<ProjectSyncState>
  ): Promise<ProjectSyncState | null> {
    const project = await this.getProject(projectId, userId);
    if (!project) return null;

    // Check write permissions
    if (!this.hasProjectWriteAccess(project, userId)) {
      throw new Error('Insufficient permissions to update project');
    }

    // Apply updates
    const updatedProject: ProjectSyncState = {
      ...project,
      ...updates,
      projectId, // Ensure ID doesn't change
      lastModified: new Date().toISOString(),
      modifiedBy: { userId, platform, sessionId },
    };

    // Store updated project
    await this.redis.setex(
      `data:${projectId}`,
      30 * 24 * 60 * 60, // 30 days TTL
      JSON.stringify(updatedProject)
    );

    // Broadcast update event
    await this.broadcastProjectEvent({
      type: 'project_updated',
      projectId,
      userId,
      sessionId,
      platform,
      timestamp: new Date().toISOString(),
      data: { updates, project: updatedProject },
    });

    return updatedProject;
  }

  /**
   * Update project file
   */
  async updateFile(
    projectId: string,
    filePath: string,
    content: string,
    userId: string,
    sessionId: string,
    platform: string
  ): Promise<ProjectFile | null> {
    const project = await this.getProject(projectId, userId);
    if (!project || !this.hasProjectWriteAccess(project, userId)) {
      return null;
    }

    // Check if file is locked by another user
    const lockKey = `${projectId}:${filePath}`;
    const existingLock = await this.redis.get(`lock:${lockKey}`);
    if (existingLock) {
      const lock = JSON.parse(existingLock);
      if (lock.userId !== userId && new Date(lock.expiresAt) > new Date()) {
        throw new Error('File is locked by another user');
      }
    }

    const contentHash = createHash('sha256').update(content).digest('hex');
    const now = new Date().toISOString();

    // Find existing file or create new one
    let fileIndex = project.files.findIndex(f => f.path === filePath);
    let file: ProjectFile;

    if (fileIndex >= 0) {
      // Update existing file
      file = {
        ...project.files[fileIndex],
        content,
        contentHash,
        size: Buffer.byteLength(content, 'utf8'),
        lastModified: now,
        modifiedBy: userId,
        version: project.files[fileIndex].version + 1,
      };
      project.files[fileIndex] = file;
    } else {
      // Create new file
      file = {
        id: this.generateFileId(),
        path: filePath,
        name: filePath.split('/').pop() || filePath,
        content,
        contentHash,
        size: Buffer.byteLength(content, 'utf8'),
        type: 'file',
        mimeType: this.getMimeType(filePath),
        lastModified: now,
        modifiedBy: userId,
        version: 1,
      };
      project.files.push(file);
    }

    // Update project
    project.lastModified = now;
    project.modifiedBy = { userId, platform, sessionId };

    // Store updated project
    await this.redis.setex(
      `data:${projectId}`,
      30 * 24 * 60 * 60,
      JSON.stringify(project)
    );

    // Broadcast file update event
    await this.broadcastProjectEvent({
      type: fileIndex >= 0 ? 'file_updated' : 'file_created',
      projectId,
      userId,
      sessionId,
      platform,
      timestamp: now,
      data: { file, filePath },
    });

    return file;
  }

  /**
   * Lock file for editing
   */
  async lockFile(
    projectId: string,
    filePath: string,
    userId: string,
    sessionId: string,
    platform: string,
    duration: number = 30 * 60 * 1000 // 30 minutes
  ): Promise<boolean> {
    const lockKey = `${projectId}:${filePath}`;
    const expiresAt = new Date(Date.now() + duration).toISOString();
    
    const lock = {
      userId,
      sessionId,
      platform,
      expiresAt,
    };

    // Try to acquire lock
    const result = await this.redis.set(
      `lock:${lockKey}`,
      JSON.stringify(lock),
      'PX',
      duration,
      'NX' // Only set if not exists
    );

    if (result === 'OK') {
      // Set timeout to clean up lock
      const timeout = setTimeout(async () => {
        await this.unlockFile(projectId, filePath, userId, sessionId, platform);
      }, duration);

      this.fileLocks.set(lockKey, timeout);

      // Broadcast lock event
      await this.broadcastProjectEvent({
        type: 'file_locked',
        projectId,
        userId,
        sessionId,
        platform,
        timestamp: new Date().toISOString(),
        data: { filePath, lock },
      });

      return true;
    }

    return false;
  }

  /**
   * Unlock file
   */
  async unlockFile(
    projectId: string,
    filePath: string,
    userId: string,
    sessionId: string,
    platform: string
  ): Promise<boolean> {
    const lockKey = `${projectId}:${filePath}`;
    
    // Check if lock exists and belongs to user
    const existingLock = await this.redis.get(`lock:${lockKey}`);
    if (existingLock) {
      const lock = JSON.parse(existingLock);
      if (lock.userId === userId) {
        await this.redis.del(`lock:${lockKey}`);
        
        // Clear timeout
        const timeout = this.fileLocks.get(lockKey);
        if (timeout) {
          clearTimeout(timeout);
          this.fileLocks.delete(lockKey);
        }

        // Broadcast unlock event
        await this.broadcastProjectEvent({
          type: 'file_unlocked',
          projectId,
          userId,
          sessionId,
          platform,
          timestamp: new Date().toISOString(),
          data: { filePath },
        });

        return true;
      }
    }

    return false;
  }

  /**
   * Get user's projects
   */
  async getUserProjects(userId: string): Promise<ProjectSyncState[]> {
    const projectIds = await this.redis.smembers(`user:${userId}:projects`);
    const projects: ProjectSyncState[] = [];

    for (const projectId of projectIds) {
      const project = await this.getProject(projectId, userId);
      if (project) {
        projects.push(project);
      } else {
        // Clean up invalid project reference
        await this.redis.srem(`user:${userId}:projects`, projectId);
      }
    }

    return projects.sort((a, b) => 
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    );
  }

  /**
   * Register WebSocket connection for project updates
   */
  registerProjectWebSocket(projectId: string, ws: WebSocket): void {
    if (!this.wsConnections.has(projectId)) {
      this.wsConnections.set(projectId, new Set());
    }
    
    this.wsConnections.get(projectId)!.add(ws);

    ws.on('close', () => {
      this.wsConnections.get(projectId)?.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error for project', projectId, error);
      this.wsConnections.get(projectId)?.delete(ws);
    });
  }

  /**
   * Broadcast project event to all relevant connections
   */
  private async broadcastProjectEvent(event: ProjectSyncEvent): Promise<void> {
    // Store event in Redis for replay
    await this.redis.lpush(
      `events:${event.projectId}`,
      JSON.stringify(event)
    );
    
    // Keep only last 500 events per project
    await this.redis.ltrim(`events:${event.projectId}`, 0, 499);

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
   * Helper methods
   */
  private generateProjectId(): string {
    return `proj_${createHash('sha256').update(`${Date.now()}_${Math.random()}`).digest('hex').substring(0, 16)}`;
  }

  private generateFileId(): string {
    return `file_${createHash('sha256').update(`${Date.now()}_${Math.random()}`).digest('hex').substring(0, 16)}`;
  }

  private hasProjectAccess(project: ProjectSyncState, userId: string): boolean {
    if (project.visibility === 'public') return true;
    return project.collaborators.some(c => c.userId === userId);
  }

  private hasProjectWriteAccess(project: ProjectSyncState, userId: string): boolean {
    const collaborator = project.collaborators.find(c => c.userId === userId);
    return !!collaborator && ['owner', 'admin', 'editor'].includes(collaborator.role);
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
    };
    
    return mimeTypes[ext || ''] || 'text/plain';
  }

  private getDefaultConfiguration(): ProjectConfiguration {
    return {
      buildSettings: {},
      environmentVariables: {},
      scripts: {},
      deploymentSettings: {},
      aiSettings: {
        preferredModels: ['claude-3-5-sonnet', 'gpt-4o'],
        consensus: true,
        autoSuggestions: true,
      },
      editorSettings: {
        theme: 'dark',
        fontSize: 14,
        tabSize: 2,
        wordWrap: true,
        minimap: true,
      },
    };
  }

  /**
   * Get project events
   */
  async getProjectEvents(projectId: string, limit: number = 100): Promise<ProjectSyncEvent[]> {
    const events = await this.redis.lrange(`events:${projectId}`, 0, limit - 1);
    return events.map(event => JSON.parse(event));
  }

  /**
   * Get project file tree
   */
  async getProjectFileTree(projectId: string, userId?: string): Promise<FileTreeNode[]> {
    const project = await this.getProject(projectId, userId);
    if (!project) return [];

    // Build tree structure from flat file list
    const rootNodes: FileTreeNode[] = [];
    const nodeMap = new Map<string, FileTreeNode>();

    // Sort files by path to ensure proper tree construction
    const sortedFiles = project.files.sort((a, b) => a.path.localeCompare(b.path));

    for (const file of sortedFiles) {
      const pathParts = file.path.split('/').filter(Boolean);
      let currentPath = '';
      let parentNode: FileTreeNode | null = null;

      // Create directory nodes for each part of the path
      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        const isLastPart = i === pathParts.length - 1;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        let node = nodeMap.get(currentPath);
        
        if (!node) {
          node = {
            id: isLastPart ? file.id : this.generateFileId(),
            name: part,
            path: currentPath,
            type: isLastPart && file.type === 'file' ? 'file' : 'directory',
            lastModified: file.lastModified,
            modifiedBy: file.modifiedBy,
            children: isLastPart && file.type === 'file' ? undefined : [],
          };

          // Add file-specific properties for actual files
          if (isLastPart && file.type === 'file') {
            node.size = file.size;
            node.contentHash = file.contentHash;
            node.mimeType = file.mimeType;
            node.locked = file.locked;
          }

          nodeMap.set(currentPath, node);

          // Add to parent or root
          if (parentNode) {
            parentNode.children!.push(node);
          } else {
            rootNodes.push(node);
          }
        }

        parentNode = node;
      }
    }

    return rootNodes;
  }

  /**
   * Get file content by path
   */
  async getFileContent(
    projectId: string,
    filePath: string,
    userId?: string
  ): Promise<{ content: string; file: ProjectFile } | null> {
    const project = await this.getProject(projectId, userId);
    if (!project) return null;

    const file = project.files.find(f => f.path === filePath && f.type === 'file');
    if (!file) return null;

    return {
      content: file.content,
      file
    };
  }

  /**
   * Create directory in project
   */
  async createDirectory(
    projectId: string,
    dirPath: string,
    userId: string,
    sessionId: string,
    platform: string
  ): Promise<ProjectFile | null> {
    const project = await this.getProject(projectId, userId);
    if (!project || !this.hasProjectWriteAccess(project, userId)) {
      return null;
    }

    // Check if directory already exists
    const existingDir = project.files.find(f => f.path === dirPath && f.type === 'directory');
    if (existingDir) {
      return existingDir;
    }

    const now = new Date().toISOString();
    const directory: ProjectFile = {
      id: this.generateFileId(),
      path: dirPath,
      name: dirPath.split('/').pop() || dirPath,
      content: '',
      contentHash: '',
      size: 0,
      type: 'directory',
      lastModified: now,
      modifiedBy: userId,
      version: 1,
    };

    // Add directory to project
    project.files.push(directory);
    project.lastModified = now;
    project.modifiedBy = { userId, platform, sessionId };

    // Store updated project
    await this.redis.setex(
      `data:${projectId}`,
      30 * 24 * 60 * 60,
      JSON.stringify(project)
    );

    // Broadcast creation event
    await this.broadcastProjectEvent({
      type: 'file_created',
      projectId,
      userId,
      sessionId,
      platform,
      timestamp: now,
      data: { file: directory },
    });

    return directory;
  }

  /**
   * Delete file or directory
   */
  async deleteFile(
    projectId: string,
    filePath: string,
    userId: string,
    sessionId: string,
    platform: string
  ): Promise<boolean> {
    const project = await this.getProject(projectId, userId);
    if (!project || !this.hasProjectWriteAccess(project, userId)) {
      return false;
    }

    // Find file to delete
    const fileIndex = project.files.findIndex(f => f.path === filePath);
    if (fileIndex === -1) return false;

    const file = project.files[fileIndex];

    // If deleting a directory, also delete all files within it
    const filesToDelete = project.files.filter(f => 
      f.path === filePath || f.path.startsWith(filePath + '/')
    );

    // Remove files
    project.files = project.files.filter(f => 
      !filesToDelete.some(fd => fd.path === f.path)
    );

    project.lastModified = new Date().toISOString();
    project.modifiedBy = { userId, platform, sessionId };

    // Store updated project
    await this.redis.setex(
      `data:${projectId}`,
      30 * 24 * 60 * 60,
      JSON.stringify(project)
    );

    // Broadcast deletion event
    await this.broadcastProjectEvent({
      type: 'file_deleted',
      projectId,
      userId,
      sessionId,
      platform,
      timestamp: new Date().toISOString(),
      data: { file, deletedPaths: filesToDelete.map(f => f.path) },
    });

    return true;
  }

  /**
   * Get available project templates
   */
  async getProjectTemplates(category?: string, language?: string): Promise<ProjectTemplate[]> {
    const templates = this.getBuiltInTemplates();
    
    // Filter by category and language if specified
    let filteredTemplates = templates;
    
    if (category) {
      filteredTemplates = filteredTemplates.filter(t => t.category === category);
    }
    
    if (language) {
      filteredTemplates = filteredTemplates.filter(t => t.language === language);
    }
    
    // TODO: Add custom templates from Redis in the future
    
    return filteredTemplates;
  }

  /**
   * Create project from template
   */
  async createProjectFromTemplate(
    templateId: string,
    userId: string,
    sessionId: string,
    platform: string,
    projectName: string,
    customizations?: Partial<ProjectSyncState>
  ): Promise<ProjectSyncState> {
    const templates = this.getBuiltInTemplates();
    const template = templates.find(t => t.id === templateId);
    
    if (!template) {
      throw new Error(`Template with ID ${templateId} not found`);
    }

    // Create files from template
    const files: ProjectFile[] = [];
    
    for (const templateFile of template.files) {
      if (templateFile.type === 'file') {
        const file: ProjectFile = {
          id: this.generateFileId(),
          path: templateFile.path,
          name: templateFile.path.split('/').pop() || templateFile.path,
          content: templateFile.content.replace(/{{PROJECT_NAME}}/g, projectName),
          contentHash: createHash('sha256').update(templateFile.content).digest('hex'),
          size: templateFile.content.length,
          type: 'file',
          mimeType: this.getMimeType(templateFile.path),
          lastModified: new Date().toISOString(),
          modifiedBy: userId,
          version: 1,
        };
        files.push(file);
      }
    }

    // Create project with template data
    const projectData: Partial<ProjectSyncState> = {
      name: projectName,
      language: template.language,
      framework: template.framework,
      files,
      dependencies: template.dependencies,
      configuration: { ...this.getDefaultConfiguration(), ...template.configuration },
      tags: template.tags,
      ...customizations,
    };

    return this.createProject(userId, sessionId, platform, projectData);
  }

  /**
   * Sync project with filesystem
   */
  async syncProjectWithFileSystem(
    projectId: string,
    userId: string,
    sessionId: string,
    platform: string
  ): Promise<boolean> {
    try {
      const project = await this.getProject(projectId, userId);
      if (!project || !this.hasProjectWriteAccess(project, userId)) {
        return false;
      }

      // Import files from external filesystem sync (if available)
      // This would integrate with the FileSystemSyncManager
      
      // For now, just mark as synced
      await this.updateProject(projectId, userId, sessionId, platform, {
        metadata: {
          ...project.metadata,
          lastFileSystemSync: new Date().toISOString(),
        }
      });

      return true;
    } catch (error) {
      console.error('Failed to sync project with filesystem:', error);
      return false;
    }
  }

  /**
   * Get built-in project templates
   */
  private getBuiltInTemplates(): ProjectTemplate[] {
    return [
      {
        id: 'next-app-router',
        name: 'Next.js App Router',
        description: 'Modern Next.js project with App Router, TypeScript, and Tailwind CSS',
        language: 'typescript',
        framework: 'next',
        category: 'web',
        tags: ['react', 'nextjs', 'typescript', 'tailwind'],
        features: ['App Router', 'TypeScript', 'Tailwind CSS', 'ESLint', 'Prettier'],
        files: [
          {
            path: 'package.json',
            content: `{
  "name": "{{PROJECT_NAME}}",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "autoprefixer": "^10.0.0",
    "eslint": "^8.0.0",
    "eslint-config-next": "14.0.0",
    "postcss": "^8.0.0",
    "tailwindcss": "^3.0.0",
    "typescript": "^5.0.0"
  }
}`,
            type: 'file'
          },
          {
            path: 'app/layout.tsx',
            content: `import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '{{PROJECT_NAME}}',
  description: 'Generated by Recoder.xyz',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}`,
            type: 'file'
          },
          {
            path: 'app/page.tsx',
            content: `export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          Welcome to {{PROJECT_NAME}}
        </p>
      </div>
    </main>
  )
}`,
            type: 'file'
          },
          {
            path: 'tailwind.config.js',
            content: `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`,
            type: 'file'
          }
        ],
        dependencies: [
          { name: 'next', version: '14.0.0', type: 'runtime', registry: 'npm', installed: false, lastUpdated: new Date().toISOString() },
          { name: 'react', version: '^18.0.0', type: 'runtime', registry: 'npm', installed: false, lastUpdated: new Date().toISOString() },
          { name: 'typescript', version: '^5.0.0', type: 'dev', registry: 'npm', installed: false, lastUpdated: new Date().toISOString() }
        ],
        configuration: {
          buildSettings: { target: 'es2020', module: 'esnext' },
          scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start'
          }
        },
        isOfficial: true,
        createdBy: 'recoder-team',
        createdAt: new Date().toISOString(),
        downloads: 0,
        rating: 5.0
      },
      {
        id: 'react-vite',
        name: 'React + Vite',
        description: 'Fast React development with Vite, TypeScript, and modern tooling',
        language: 'typescript',
        framework: 'vite',
        category: 'web',
        tags: ['react', 'vite', 'typescript', 'fast'],
        features: ['Vite', 'React 18', 'TypeScript', 'Hot Reload', 'Fast Build'],
        files: [
          {
            path: 'package.json',
            content: `{
  "name": "{{PROJECT_NAME}}",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@typescript-eslint/eslint-plugin": "^6.14.0",
    "@typescript-eslint/parser": "^6.14.0",
    "@vitejs/plugin-react": "^4.2.1",
    "eslint": "^8.55.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.5",
    "typescript": "^5.2.2",
    "vite": "^5.0.8"
  }
}`,
            type: 'file'
          },
          {
            path: 'src/main.tsx',
            content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`,
            type: 'file'
          },
          {
            path: 'src/App.tsx',
            content: `import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <div>
        <h1>{{PROJECT_NAME}}</h1>
        <div className="card">
          <button onClick={() => setCount((count) => count + 1)}>
            count is {count}
          </button>
          <p>
            Edit <code>src/App.tsx</code> and save to test HMR
          </p>
        </div>
        <p className="read-the-docs">
          Click on the Vite and React logos to learn more
        </p>
      </div>
    </>
  )
}

export default App`,
            type: 'file'
          }
        ],
        dependencies: [
          { name: 'react', version: '^18.2.0', type: 'runtime', registry: 'npm', installed: false, lastUpdated: new Date().toISOString() },
          { name: 'vite', version: '^5.0.8', type: 'dev', registry: 'npm', installed: false, lastUpdated: new Date().toISOString() }
        ],
        configuration: {
          buildSettings: { target: 'es2020' },
          scripts: {
            dev: 'vite',
            build: 'tsc && vite build'
          }
        },
        isOfficial: true,
        createdBy: 'recoder-team',
        createdAt: new Date().toISOString(),
        downloads: 0,
        rating: 5.0
      },
      {
        id: 'python-fastapi',
        name: 'FastAPI Python',
        description: 'Modern Python API with FastAPI, Pydantic, and async support',
        language: 'python',
        framework: 'fastapi',
        category: 'api',
        tags: ['python', 'fastapi', 'api', 'async'],
        features: ['FastAPI', 'Pydantic', 'Async/Await', 'Auto Documentation', 'Type Hints'],
        files: [
          {
            path: 'requirements.txt',
            content: `fastapi>=0.104.0
uvicorn[standard]>=0.24.0
pydantic>=2.5.0
python-multipart>=0.0.6`,
            type: 'file'
          },
          {
            path: 'main.py',
            content: `from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="{{PROJECT_NAME}}", version="1.0.0")

class Item(BaseModel):
    name: str
    description: str = None
    price: float
    tax: float = None

@app.get("/")
async def root():
    return {"message": "Welcome to {{PROJECT_NAME}}"}

@app.post("/items/")
async def create_item(item: Item):
    return item

@app.get("/items/{item_id}")
async def read_item(item_id: int, q: str = None):
    return {"item_id": item_id, "q": q}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)`,
            type: 'file'
          }
        ],
        dependencies: [
          { name: 'fastapi', version: '>=0.104.0', type: 'runtime', registry: 'pypi', installed: false, lastUpdated: new Date().toISOString() },
          { name: 'uvicorn', version: '>=0.24.0', type: 'runtime', registry: 'pypi', installed: false, lastUpdated: new Date().toISOString() }
        ],
        configuration: {
          scripts: {
            dev: 'uvicorn main:app --reload',
            start: 'uvicorn main:app --host 0.0.0.0 --port 8000'
          }
        },
        isOfficial: true,
        createdBy: 'recoder-team',
        createdAt: new Date().toISOString(),
        downloads: 0,
        rating: 5.0
      }
    ];
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    await this.redis.disconnect();
  }
}

// Export singleton instance
export const projectSync = new ProjectSyncManager();
