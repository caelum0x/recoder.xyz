/**
 * Filesystem MCP Server
 * Provides file system operations through MCP protocol
 *
 * ARCHITECTURE:
 * - Server-side: Uses Node.js fs module (for Remix actions)
 * - Client-side: Uses WebContainer (for browser)
 */

import type { MCPServer, MCPTool, FileInfo } from '../types';
import { webcontainer } from '~/lib/webcontainer';
import { WORK_DIR } from '~/utils/constants';
import * as path from 'path';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('MCPFilesystem');

export class FilesystemMCPServer {
  private readonly serverId = 'filesystem';
  private readonly serverName = 'Filesystem';
  private readonly version = '1.0.0';

  // Security: Only allow access to project directory
  private readonly projectRoot = process.cwd();

  /**
   * Get server configuration
   */
  getServer(): MCPServer {
    return {
      id: this.serverId,
      name: this.serverName,
      description: 'File system operations: read, write, list, search files and directories',
      version: this.version,
      enabled: true,
      status: 'active',
      config: {
        permissions: {
          filesystem: {
            read: [WORK_DIR],
            write: [WORK_DIR],
            execute: false,
          },
        },
        rateLimit: {
          maxRequests: 100,
          windowMs: 60000, // 1 minute
        },
      },
      tools: this.getTools(),
      metadata: {
        category: 'filesystem',
        priority: 1,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Define available tools
   */
  private getTools(): MCPTool[] {
    return [
      {
        name: 'read_file',
        description: 'Read the contents of a file',
        category: 'filesystem',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file relative to project root',
            },
          },
          required: ['path'],
        },
        requiresAuth: false,
        requiresApproval: false,
        estimatedDuration: 100,
        handler: async (params) => this.executeTool('read_file', params),
        examples: [
          {
            description: 'Read package.json',
            input: { path: './package.json' },
          },
        ],
      },
      {
        name: 'write_file',
        description: 'Write content to a file (creates if not exists)',
        category: 'filesystem',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file',
            },
            content: {
              type: 'string',
              description: 'Content to write',
            },
          },
          required: ['path', 'content'],
        },
        requiresAuth: false,
        requiresApproval: true, // Requires user approval
        estimatedDuration: 200,
        handler: async (params) => this.executeTool('write_file', params),
        examples: [
          {
            description: 'Create a new JavaScript file',
            input: {
              path: './app.js',
              content: 'console.log("Hello World");',
            },
          },
        ],
      },
      {
        name: 'delete_file',
        description: 'Delete a file',
        category: 'filesystem',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file to delete',
            },
          },
          required: ['path'],
        },
        requiresAuth: false,
        requiresApproval: true, // Dangerous operation
        estimatedDuration: 100,
        handler: async (params) => this.executeTool('delete_file', params),
      },
      {
        name: 'list_directory',
        description: 'List files and directories in a path',
        category: 'filesystem',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Directory path',
              default: './',
            },
            recursive: {
              type: 'boolean',
              description: 'List recursively',
              default: false,
            },
          },
        },
        requiresAuth: false,
        requiresApproval: false,
        estimatedDuration: 200,
        handler: async (params) => this.executeTool('list_directory', params),
      },
      {
        name: 'search_files',
        description: 'Search for files matching a pattern',
        category: 'filesystem',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Search pattern (glob or regex)',
            },
            path: {
              type: 'string',
              description: 'Directory to search in',
              default: './',
            },
          },
          required: ['pattern'],
        },
        requiresAuth: false,
        requiresApproval: false,
        estimatedDuration: 500,
        handler: async (params) => this.executeTool('search_files', params),
      },
      {
        name: 'create_directory',
        description: 'Create a new directory',
        category: 'filesystem',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Directory path to create',
            },
          },
          required: ['path'],
        },
        requiresAuth: false,
        requiresApproval: false,
        estimatedDuration: 100,
        handler: async (params) => this.executeTool('create_directory', params),
      },
      {
        name: 'file_exists',
        description: 'Check if a file or directory exists',
        category: 'filesystem',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to check',
            },
          },
          required: ['path'],
        },
        requiresAuth: false,
        requiresApproval: false,
        estimatedDuration: 50,
        handler: async (params) => this.executeTool('file_exists', params),
      },
    ];
  }

  /**
   * Execute a tool - routes to server or client implementation
   */
  async executeTool(toolName: string, parameters: Record<string, any>): Promise<any> {
    // Check if we're on server or client
    const isServer = typeof window === 'undefined';

    logger.info(`🔧 Executing ${toolName} on ${isServer ? 'server' : 'client'}`);

    if (isServer) {
      // Server-side: Use Node.js fs
      return this.executeToolServerSide(toolName, parameters);
    } else {
      // Client-side: Use WebContainer
      return this.executeToolClientSide(toolName, parameters);
    }
  }

  /**
   * Server-side execution using Node.js fs
   */
  private async executeToolServerSide(toolName: string, parameters: Record<string, any>): Promise<any> {
    // Dynamically import fs (only on server)
    const fs = await import('fs/promises');
    const nodePath = await import('path');

    switch (toolName) {
      case 'read_file':
        return await this.readFileServer(fs, nodePath, parameters.path);

      case 'write_file':
        return await this.writeFileServer(fs, nodePath, parameters.path, parameters.content);

      case 'delete_file':
        return await this.deleteFileServer(fs, nodePath, parameters.path);

      case 'list_directory':
        return await this.listDirectoryServer(fs, nodePath, parameters.path, parameters.recursive);

      case 'search_files':
        return await this.searchFilesServer(fs, nodePath, parameters.pattern, parameters.path);

      case 'create_directory':
        return await this.createDirectoryServer(fs, nodePath, parameters.path);

      case 'file_exists':
        return await this.fileExistsServer(fs, nodePath, parameters.path);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Client-side execution using WebContainer
   */
  private async executeToolClientSide(toolName: string, parameters: Record<string, any>): Promise<any> {
    const wc = await webcontainer;

    switch (toolName) {
      case 'read_file':
        return await this.readFileClient(wc, parameters.path);

      case 'write_file':
        return await this.writeFileClient(wc, parameters.path, parameters.content);

      case 'delete_file':
        return await this.deleteFileClient(wc, parameters.path);

      case 'list_directory':
        return await this.listDirectoryClient(wc, parameters.path, parameters.recursive);

      case 'search_files':
        return await this.searchFilesClient(wc, parameters.pattern, parameters.path);

      case 'create_directory':
        return await this.createDirectoryClient(wc, parameters.path);

      case 'file_exists':
        return await this.fileExistsClient(wc, parameters.path);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  // ============================================================================
  // SERVER-SIDE IMPLEMENTATIONS (Node.js fs)
  // ============================================================================

  /**
   * Sanitize and resolve path (security: prevent directory traversal)
   */
  private getSafePath(inputPath: string, nodePath: any): string {
    // Remove /home/project prefix if present
    let cleanPath = inputPath
      .replace('/home/project/', '')
      .replace('/home/project', '')
      .replace(WORK_DIR + '/', '')
      .replace(WORK_DIR, '');

    // Ensure it doesn't start with /
    if (cleanPath.startsWith('/')) {
      cleanPath = cleanPath.substring(1);
    }

    // Resolve to absolute path within project root
    const resolvedPath = nodePath.resolve(this.projectRoot, cleanPath);

    // Security check: Ensure path is within project root
    if (!resolvedPath.startsWith(this.projectRoot)) {
      throw new Error(`Access denied: Path ${inputPath} is outside project directory`);
    }

    return resolvedPath;
  }

  private async readFileServer(fs: any, nodePath: any, filePath: string): Promise<{ content: string; size: number }> {
    try {
      const safePath = this.getSafePath(filePath, nodePath);
      const content = await fs.readFile(safePath, 'utf-8');

      return {
        content,
        size: content.length,
      };
    } catch (error: any) {
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
  }

  private async writeFileServer(fs: any, nodePath: any, filePath: string, content: string): Promise<{ success: boolean; path: string }> {
    try {
      const safePath = this.getSafePath(filePath, nodePath);

      // Ensure directory exists
      const dirPath = nodePath.dirname(safePath);
      await fs.mkdir(dirPath, { recursive: true });

      await fs.writeFile(safePath, content, 'utf-8');

      return {
        success: true,
        path: safePath,
      };
    } catch (error: any) {
      throw new Error(`Failed to write file ${filePath}: ${error.message}`);
    }
  }

  private async deleteFileServer(fs: any, nodePath: any, filePath: string): Promise<{ success: boolean }> {
    try {
      const safePath = this.getSafePath(filePath, nodePath);
      await fs.unlink(safePath);

      return { success: true };
    } catch (error: any) {
      throw new Error(`Failed to delete file ${filePath}: ${error.message}`);
    }
  }

  private async listDirectoryServer(
    fs: any,
    nodePath: any,
    dirPath: string = './',
    recursive: boolean = false
  ): Promise<FileInfo[]> {
    try {
      const safePath = this.getSafePath(dirPath, nodePath);
      const entries = await fs.readdir(safePath, { withFileTypes: true });

      const files: FileInfo[] = [];

      for (const entry of entries) {
        const fullPath = nodePath.join(safePath, entry.name);

        try {
          const stats = await fs.stat(fullPath);

          files.push({
            path: nodePath.relative(this.projectRoot, fullPath),
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: stats.size || 0,
            modified: new Date(stats.mtime),
          });

          // Recursively list subdirectories
          if (recursive && entry.isDirectory()) {
            const subPath = nodePath.relative(this.projectRoot, fullPath);
            const subFiles = await this.listDirectoryServer(fs, nodePath, subPath, true);
            files.push(...subFiles);
          }
        } catch (statError) {
          logger.warn(`Failed to stat ${fullPath}:`, statError);
        }
      }

      return files;
    } catch (error: any) {
      throw new Error(`Failed to list directory ${dirPath}: ${error.message}`);
    }
  }

  private async searchFilesServer(
    fs: any,
    nodePath: any,
    pattern: string,
    searchPath: string = './'
  ): Promise<FileInfo[]> {
    try {
      const allFiles = await this.listDirectoryServer(fs, nodePath, searchPath, true);
      const regex = new RegExp(pattern, 'i');

      return allFiles.filter(file => regex.test(file.name) || regex.test(file.path));
    } catch (error: any) {
      throw new Error(`Failed to search files: ${error.message}`);
    }
  }

  private async createDirectoryServer(fs: any, nodePath: any, dirPath: string): Promise<{ success: boolean; path: string }> {
    try {
      const safePath = this.getSafePath(dirPath, nodePath);
      await fs.mkdir(safePath, { recursive: true });

      return {
        success: true,
        path: safePath,
      };
    } catch (error: any) {
      throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
    }
  }

  private async fileExistsServer(fs: any, nodePath: any, filePath: string): Promise<{ exists: boolean; type?: 'file' | 'directory' }> {
    try {
      const safePath = this.getSafePath(filePath, nodePath);
      const stats = await fs.stat(safePath);

      return {
        exists: true,
        type: stats.isDirectory() ? 'directory' : 'file',
      };
    } catch (error: any) {
      return { exists: false };
    }
  }

  // ============================================================================
  // CLIENT-SIDE IMPLEMENTATIONS (WebContainer)
  // ============================================================================

  private getRelativePathClient(inputPath: string): string {
    if (inputPath.startsWith('/home/project/')) {
      return inputPath.replace('/home/project/', '');
    }
    if (inputPath.startsWith(WORK_DIR)) {
      return inputPath.replace(WORK_DIR + '/', '');
    }
    if (inputPath.startsWith('./')) {
      return inputPath.substring(2);
    }
    if (inputPath.startsWith('/')) {
      return inputPath.substring(1);
    }
    return inputPath;
  }

  private async readFileClient(wc: any, path: string): Promise<{ content: string; size: number }> {
    try {
      const relativePath = this.getRelativePathClient(path);
      const content = await wc.fs.readFile(relativePath, 'utf-8');

      return {
        content,
        size: content.length,
      };
    } catch (error: any) {
      throw new Error(`Failed to read file ${path}: ${error.message}`);
    }
  }

  private async writeFileClient(wc: any, path: string, content: string): Promise<{ success: boolean; path: string }> {
    try {
      const relativePath = this.getRelativePathClient(path);

      // Ensure directory exists
      const dirPath = relativePath.substring(0, relativePath.lastIndexOf('/'));
      if (dirPath) {
        await wc.fs.mkdir(dirPath, { recursive: true });
      }

      await wc.fs.writeFile(relativePath, content);

      return {
        success: true,
        path: relativePath,
      };
    } catch (error: any) {
      throw new Error(`Failed to write file ${path}: ${error.message}`);
    }
  }

  private async deleteFileClient(wc: any, path: string): Promise<{ success: boolean }> {
    try {
      const relativePath = this.getRelativePathClient(path);
      await wc.fs.rm(relativePath);

      return { success: true };
    } catch (error: any) {
      throw new Error(`Failed to delete file ${path}: ${error.message}`);
    }
  }

  private async listDirectoryClient(
    wc: any,
    path: string = './',
    recursive: boolean = false
  ): Promise<FileInfo[]> {
    try {
      const relativePath = this.getRelativePathClient(path) || '.';
      const entries = await wc.fs.readdir(relativePath, { withFileTypes: true });

      const files: FileInfo[] = [];

      for (const entry of entries) {
        const fullPath = relativePath === '.' ? entry.name : `${relativePath}/${entry.name}`;

        try {
          const stats = await wc.fs.stat(fullPath);

          files.push({
            path: fullPath,
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: stats.size || 0,
            modified: new Date(stats.mtime || Date.now()),
          });

          // Recursively list subdirectories
          if (recursive && entry.isDirectory()) {
            const subFiles = await this.listDirectoryClient(wc, fullPath, true);
            files.push(...subFiles);
          }
        } catch (statError) {
          logger.warn(`Failed to stat ${fullPath}:`, statError);
        }
      }

      return files;
    } catch (error: any) {
      throw new Error(`Failed to list directory ${path}: ${error.message}`);
    }
  }

  private async searchFilesClient(
    wc: any,
    pattern: string,
    path: string = './'
  ): Promise<FileInfo[]> {
    try {
      const allFiles = await this.listDirectoryClient(wc, path, true);
      const regex = new RegExp(pattern, 'i');

      return allFiles.filter(file => regex.test(file.name) || regex.test(file.path));
    } catch (error: any) {
      throw new Error(`Failed to search files: ${error.message}`);
    }
  }

  private async createDirectoryClient(wc: any, path: string): Promise<{ success: boolean; path: string }> {
    try {
      const relativePath = this.getRelativePathClient(path);
      await wc.fs.mkdir(relativePath, { recursive: true });

      return {
        success: true,
        path: relativePath,
      };
    } catch (error: any) {
      throw new Error(`Failed to create directory ${path}: ${error.message}`);
    }
  }

  private async fileExistsClient(wc: any, path: string): Promise<{ exists: boolean; type?: 'file' | 'directory' }> {
    try {
      const relativePath = this.getRelativePathClient(path);
      const stats = await wc.fs.stat(relativePath);

      return {
        exists: true,
        type: stats.isDirectory() ? 'directory' : 'file',
      };
    } catch (error: any) {
      return { exists: false };
    }
  }
}

// Export singleton instance
export const filesystemMCPServer = new FilesystemMCPServer();
