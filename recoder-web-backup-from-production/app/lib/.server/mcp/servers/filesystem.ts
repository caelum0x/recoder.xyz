/**
 * Filesystem MCP Server
 * Provides file system operations through MCP protocol
 */

import type { MCPServer, MCPTool, FileInfo } from '../types';
import { webcontainer } from '~/lib/webcontainer';
import { WORK_DIR } from '~/utils/constants';

export class FilesystemMCPServer {
  private readonly serverId = 'filesystem';
  private readonly serverName = 'Filesystem';
  private readonly version = '1.0.0';

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
            input: { path: '/home/project/package.json' },
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
              path: '/home/project/app.js',
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
              default: '/home/project',
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
              default: '/home/project',
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
   * Execute a tool
   */
  async executeTool(toolName: string, parameters: Record<string, any>): Promise<any> {
    const wc = await webcontainer;

    switch (toolName) {
      case 'read_file':
        return await this.readFile(wc, parameters.path);

      case 'write_file':
        return await this.writeFile(wc, parameters.path, parameters.content);

      case 'delete_file':
        return await this.deleteFile(wc, parameters.path);

      case 'list_directory':
        return await this.listDirectory(wc, parameters.path, parameters.recursive);

      case 'search_files':
        return await this.searchFiles(wc, parameters.pattern, parameters.path);

      case 'create_directory':
        return await this.createDirectory(wc, parameters.path);

      case 'file_exists':
        return await this.fileExists(wc, parameters.path);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Read file contents
   */
  private async readFile(wc: any, path: string): Promise<{ content: string; size: number }> {
    try {
      const relativePath = this.getRelativePath(path);
      const content = await wc.fs.readFile(relativePath, 'utf-8');
      
      return {
        content,
        size: content.length,
      };
    } catch (error) {
      throw new Error(`Failed to read file ${path}: ${error.message}`);
    }
  }

  /**
   * Write file contents
   */
  private async writeFile(wc: any, path: string, content: string): Promise<{ success: boolean; path: string }> {
    try {
      const relativePath = this.getRelativePath(path);
      
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
    } catch (error) {
      throw new Error(`Failed to write file ${path}: ${error.message}`);
    }
  }

  /**
   * Delete a file
   */
  private async deleteFile(wc: any, path: string): Promise<{ success: boolean }> {
    try {
      const relativePath = this.getRelativePath(path);
      await wc.fs.rm(relativePath);
      
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete file ${path}: ${error.message}`);
    }
  }

  /**
   * List directory contents
   */
  private async listDirectory(
    wc: any,
    path: string = '/home/project',
    recursive: boolean = false
  ): Promise<FileInfo[]> {
    try {
      const relativePath = this.getRelativePath(path);
      const entries = await wc.fs.readdir(relativePath, { withFileTypes: true });
      
      const files: FileInfo[] = [];
      
      for (const entry of entries) {
        const fullPath = `${relativePath}/${entry.name}`;
        
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
            const subFiles = await this.listDirectory(wc, fullPath, true);
            files.push(...subFiles);
          }
        } catch (statError) {
          console.warn(`Failed to stat ${fullPath}:`, statError);
        }
      }
      
      return files;
    } catch (error) {
      throw new Error(`Failed to list directory ${path}: ${error.message}`);
    }
  }

  /**
   * Search for files
   */
  private async searchFiles(
    wc: any,
    pattern: string,
    path: string = '/home/project'
  ): Promise<FileInfo[]> {
    try {
      const allFiles = await this.listDirectory(wc, path, true);
      const regex = new RegExp(pattern, 'i');
      
      return allFiles.filter(file => regex.test(file.name) || regex.test(file.path));
    } catch (error) {
      throw new Error(`Failed to search files: ${error.message}`);
    }
  }

  /**
   * Create directory
   */
  private async createDirectory(wc: any, path: string): Promise<{ success: boolean; path: string }> {
    try {
      const relativePath = this.getRelativePath(path);
      await wc.fs.mkdir(relativePath, { recursive: true });
      
      return {
        success: true,
        path: relativePath,
      };
    } catch (error) {
      throw new Error(`Failed to create directory ${path}: ${error.message}`);
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(wc: any, path: string): Promise<{ exists: boolean; type?: 'file' | 'directory' }> {
    try {
      const relativePath = this.getRelativePath(path);
      const stats = await wc.fs.stat(relativePath);
      
      return {
        exists: true,
        type: stats.isDirectory() ? 'directory' : 'file',
      };
    } catch (error) {
      return { exists: false };
    }
  }

  /**
   * Convert absolute path to relative path for webcontainer
   */
  private getRelativePath(path: string): string {
    if (path.startsWith('/home/project/')) {
      return path.replace('/home/project/', '');
    }
    if (path.startsWith(WORK_DIR)) {
      return path.replace(WORK_DIR + '/', '');
    }
    return path;
  }
}

// Export singleton instance
export const filesystemMCPServer = new FilesystemMCPServer();
