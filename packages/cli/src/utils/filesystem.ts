/**
 * File system utilities for project management
 */

import fs from 'fs-extra';
import path from 'path';
import glob from 'glob';
import { promisify } from 'util';
import { Logger } from '@recoder/shared';

const globAsync = promisify(glob);

export interface FileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  lastModified: Date;
  permissions: string;
}

export interface DirectoryStructure {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  lastModified: Date;
  children?: DirectoryStructure[];
}

export interface SearchOptions {
  pattern?: string;
  extensions?: string[];
  excludeDirs?: string[];
  maxDepth?: number;
  caseSensitive?: boolean;
}

export class FileSystemUtils {
  /**
   * Check if a path exists
   */
  static async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file or directory information
   */
  static async getFileInfo(filePath: string): Promise<FileInfo | null> {
    try {
      const stats = await fs.stat(filePath);
      const parsedPath = path.parse(filePath);

      return {
        path: filePath,
        name: parsedPath.base,
        extension: parsedPath.ext,
        size: stats.size,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        lastModified: stats.mtime,
        permissions: (stats.mode & parseInt('777', 8)).toString(8),
      };
    } catch (error) {
      Logger.error(`Failed to get file info for ${filePath}: ${error}`);
      return null;
    }
  }

  /**
   * Create directory recursively
   */
  static async ensureDirectory(dirPath: string): Promise<boolean> {
    try {
      await fs.ensureDir(dirPath);
      return true;
    } catch (error) {
      Logger.error(`Failed to create directory ${dirPath}: ${error}`);
      return false;
    }
  }

  /**
   * Copy file or directory
   */
  static async copy(source: string, destination: string, options?: { overwrite?: boolean }): Promise<boolean> {
    try {
      const copyOptions: fs.CopyOptions = {
        overwrite: options?.overwrite ?? false,
        errorOnExist: !options?.overwrite,
      };

      await fs.copy(source, destination, copyOptions);
      return true;
    } catch (error) {
      Logger.error(`Failed to copy ${source} to ${destination}: ${error}`);
      return false;
    }
  }

  /**
   * Move/rename file or directory
   */
  static async move(source: string, destination: string): Promise<boolean> {
    try {
      await fs.move(source, destination, { overwrite: true });
      return true;
    } catch (error) {
      Logger.error(`Failed to move ${source} to ${destination}: ${error}`);
      return false;
    }
  }

  /**
   * Delete file or directory
   */
  static async remove(filePath: string): Promise<boolean> {
    try {
      await fs.remove(filePath);
      return true;
    } catch (error) {
      Logger.error(`Failed to remove ${filePath}: ${error}`);
      return false;
    }
  }

  /**
   * Read file content
   */
  static async readFile(filePath: string, encoding: BufferEncoding = 'utf8'): Promise<string | null> {
    try {
      return await fs.readFile(filePath, encoding);
    } catch (error) {
      Logger.error(`Failed to read file ${filePath}: ${error}`);
      return null;
    }
  }

  /**
   * Write file content
   */
  static async writeFile(filePath: string, content: string, options?: { encoding?: BufferEncoding; mode?: number }): Promise<boolean> {
    try {
      const writeOptions = {
        encoding: options?.encoding || 'utf8' as BufferEncoding,
        mode: options?.mode,
      };

      // Ensure directory exists
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, content, writeOptions);
      return true;
    } catch (error) {
      Logger.error(`Failed to write file ${filePath}: ${error}`);
      return false;
    }
  }

  /**
   * Read JSON file
   */
  static async readJSON<T = any>(filePath: string): Promise<T | null> {
    try {
      return await fs.readJSON(filePath);
    } catch (error) {
      Logger.error(`Failed to read JSON file ${filePath}: ${error}`);
      return null;
    }
  }

  /**
   * Write JSON file
   */
  static async writeJSON(filePath: string, data: any, options?: { spaces?: number }): Promise<boolean> {
    try {
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeJSON(filePath, data, { spaces: options?.spaces || 2 });
      return true;
    } catch (error) {
      Logger.error(`Failed to write JSON file ${filePath}: ${error}`);
      return false;
    }
  }

  /**
   * List directory contents
   */
  static async listDirectory(dirPath: string, options?: { recursive?: boolean; includeHidden?: boolean }): Promise<string[]> {
    try {
      if (!options?.recursive) {
        const items = await fs.readdir(dirPath);
        return options?.includeHidden ? items : items.filter(item => !item.startsWith('.'));
      }

      // Recursive listing
      const pattern = options.includeHidden ? '**/*' : '**/!(.*)';
      return await globAsync(pattern, { cwd: dirPath, nodir: false });
    } catch (error) {
      Logger.error(`Failed to list directory ${dirPath}: ${error}`);
      return [];
    }
  }

  /**
   * Get directory structure as tree
   */
  static async getDirectoryTree(dirPath: string, maxDepth: number = 5): Promise<DirectoryStructure | null> {
    try {
      const stats = await fs.stat(dirPath);
      const name = path.basename(dirPath);

      const structure: DirectoryStructure = {
        name,
        path: dirPath,
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.isFile() ? stats.size : undefined,
        lastModified: stats.mtime,
      };

      if (stats.isDirectory() && maxDepth > 0) {
        const items = await fs.readdir(dirPath);
        structure.children = [];

        for (const item of items) {
          if (item.startsWith('.')) continue; // Skip hidden files
          
          const itemPath = path.join(dirPath, item);
          const childStructure = await this.getDirectoryTree(itemPath, maxDepth - 1);
          
          if (childStructure) {
            structure.children.push(childStructure);
          }
        }
      }

      return structure;
    } catch (error) {
      Logger.error(`Failed to get directory tree for ${dirPath}: ${error}`);
      return null;
    }
  }

  /**
   * Search for files matching pattern
   */
  static async searchFiles(dirPath: string, options: SearchOptions = {}): Promise<string[]> {
    try {
      const {
        pattern = '**/*',
        extensions = [],
        excludeDirs = ['node_modules', '.git', 'dist', 'build'],
        maxDepth = 10,
        caseSensitive = false,
      } = options;

      let searchPattern = pattern;

      // Add extension filter
      if (extensions.length > 0) {
        const extPattern = extensions.length === 1 
          ? `**/*.${extensions[0]}` 
          : `**/*.{${extensions.join(',')}}`;
        searchPattern = extPattern;
      }

      const globOptions = {
        cwd: dirPath,
        nocase: !caseSensitive,
        ignore: excludeDirs.map(dir => `**/${dir}/**`),
        maxDepth,
      };

      return await globAsync(searchPattern, globOptions);
    } catch (error) {
      Logger.error(`Failed to search files in ${dirPath}: ${error}`);
      return [];
    }
  }

  /**
   * Find files containing specific text
   */
  static async findInFiles(dirPath: string, searchText: string, options: SearchOptions = {}): Promise<Array<{ file: string; lines: Array<{ number: number; content: string }> }>> {
    try {
      const files = await this.searchFiles(dirPath, options);
      const results: Array<{ file: string; lines: Array<{ number: number; content: string }> }> = [];

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const content = await this.readFile(filePath);
        
        if (content) {
          const lines = content.split('\n');
          const matchingLines: Array<{ number: number; content: string }> = [];

          lines.forEach((line, index) => {
            if (line.includes(searchText)) {
              matchingLines.push({
                number: index + 1,
                content: line.trim(),
              });
            }
          });

          if (matchingLines.length > 0) {
            results.push({ file, lines: matchingLines });
          }
        }
      }

      return results;
    } catch (error) {
      Logger.error(`Failed to find text in files: ${error}`);
      return [];
    }
  }

  /**
   * Get file size in human readable format
   */
  static formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Get directory size
   */
  static async getDirectorySize(dirPath: string): Promise<number> {
    try {
      let totalSize = 0;
      const items = await fs.readdir(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = await fs.stat(itemPath);

        if (stats.isDirectory()) {
          totalSize += await this.getDirectorySize(itemPath);
        } else {
          totalSize += stats.size;
        }
      }

      return totalSize;
    } catch (error) {
      Logger.error(`Failed to get directory size for ${dirPath}: ${error}`);
      return 0;
    }
  }

  /**
   * Check if directory is empty
   */
  static async isDirectoryEmpty(dirPath: string): Promise<boolean> {
    try {
      const items = await fs.readdir(dirPath);
      return items.length === 0;
    } catch (error) {
      Logger.error(`Failed to check if directory is empty ${dirPath}: ${error}`);
      return false;
    }
  }

  /**
   * Get file extension
   */
  static getExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase().slice(1);
  }

  /**
   * Get file name without extension
   */
  static getFileNameWithoutExtension(filePath: string): string {
    return path.parse(filePath).name;
  }

  /**
   * Normalize path (handle cross-platform differences)
   */
  static normalizePath(filePath: string): string {
    return path.normalize(filePath).replace(/\\/g, '/');
  }

  /**
   * Check if path is absolute
   */
  static isAbsolute(filePath: string): boolean {
    return path.isAbsolute(filePath);
  }

  /**
   * Resolve relative path to absolute
   */
  static resolvePath(filePath: string, basePath?: string): string {
    return basePath ? path.resolve(basePath, filePath) : path.resolve(filePath);
  }

  /**
   * Get relative path between two paths
   */
  static getRelativePath(from: string, to: string): string {
    return path.relative(from, to);
  }

  /**
   * Watch file or directory for changes
   */
  static watchPath(filePath: string, callback: (eventType: string, filename: string) => void): fs.FSWatcher | null {
    try {
      return fs.watch(filePath, { recursive: true }, (eventType, filename) => {
        callback(eventType, filename || '');
      });
    } catch (error) {
      Logger.error(`Failed to watch path ${filePath}: ${error}`);
      return null;
    }
  }

  /**
   * Create temporary file
   */
  static async createTempFile(content: string, extension: string = '.tmp'): Promise<string | null> {
    try {
      const tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'recoder-'));
      const tempFile = path.join(tempDir, `temp${extension}`);
      
      await fs.writeFile(tempFile, content);
      return tempFile;
    } catch (error) {
      Logger.error(`Failed to create temp file: ${error}`);
      return null;
    }
  }

  /**
   * Clean up temporary files
   */
  static async cleanupTempFiles(tempDir: string): Promise<boolean> {
    try {
      await fs.remove(tempDir);
      return true;
    } catch (error) {
      Logger.error(`Failed to cleanup temp files: ${error}`);
      return false;
    }
  }
}