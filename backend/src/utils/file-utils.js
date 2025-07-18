const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { logger } = require('./logger');

class FileUtils {
  static async ensureDirectoryExists(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      return true;
    } catch (error) {
      logger.error('Failed to create directory:', { dirPath, error: error.message });
      throw error;
    }
  }

  static async writeFile(filePath, content, options = {}) {
    try {
      const dir = path.dirname(filePath);
      await this.ensureDirectoryExists(dir);
      
      const writeOptions = {
        encoding: 'utf8',
        ...options
      };
      
      await fs.writeFile(filePath, content, writeOptions);
      logger.debug('File written successfully:', { filePath });
      return true;
    } catch (error) {
      logger.error('Failed to write file:', { filePath, error: error.message });
      throw error;
    }
  }

  static async readFile(filePath, options = {}) {
    try {
      const readOptions = {
        encoding: 'utf8',
        ...options
      };
      
      const content = await fs.readFile(filePath, readOptions);
      logger.debug('File read successfully:', { filePath });
      return content;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn('File not found:', { filePath });
        return null;
      }
      logger.error('Failed to read file:', { filePath, error: error.message });
      throw error;
    }
  }

  static async appendFile(filePath, content, options = {}) {
    try {
      const dir = path.dirname(filePath);
      await this.ensureDirectoryExists(dir);
      
      const appendOptions = {
        encoding: 'utf8',
        ...options
      };
      
      await fs.appendFile(filePath, content, appendOptions);
      logger.debug('Content appended to file:', { filePath });
      return true;
    } catch (error) {
      logger.error('Failed to append to file:', { filePath, error: error.message });
      throw error;
    }
  }

  static async deleteFile(filePath) {
    try {
      await fs.unlink(filePath);
      logger.debug('File deleted successfully:', { filePath });
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn('File not found for deletion:', { filePath });
        return false;
      }
      logger.error('Failed to delete file:', { filePath, error: error.message });
      throw error;
    }
  }

  static async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  static async getFileStats(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        accessedAt: stats.atime
      };
    } catch (error) {
      logger.error('Failed to get file stats:', { filePath, error: error.message });
      throw error;
    }
  }

  static async listFiles(dirPath, options = {}) {
    try {
      const { recursive = false, extension = null } = options;
      
      const files = [];
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isFile()) {
          if (!extension || path.extname(entry.name) === extension) {
            files.push(fullPath);
          }
        } else if (entry.isDirectory() && recursive) {
          const subFiles = await this.listFiles(fullPath, options);
          files.push(...subFiles);
        }
      }
      
      return files;
    } catch (error) {
      logger.error('Failed to list files:', { dirPath, error: error.message });
      throw error;
    }
  }

  static async copyFile(sourcePath, destPath) {
    try {
      const destDir = path.dirname(destPath);
      await this.ensureDirectoryExists(destDir);
      
      await fs.copyFile(sourcePath, destPath);
      logger.debug('File copied successfully:', { sourcePath, destPath });
      return true;
    } catch (error) {
      logger.error('Failed to copy file:', { sourcePath, destPath, error: error.message });
      throw error;
    }
  }

  static async moveFile(sourcePath, destPath) {
    try {
      const destDir = path.dirname(destPath);
      await this.ensureDirectoryExists(destDir);
      
      await fs.rename(sourcePath, destPath);
      logger.debug('File moved successfully:', { sourcePath, destPath });
      return true;
    } catch (error) {
      logger.error('Failed to move file:', { sourcePath, destPath, error: error.message });
      throw error;
    }
  }

  static async calculateFileHash(filePath, algorithm = 'sha256') {
    try {
      const content = await fs.readFile(filePath);
      const hash = crypto.createHash(algorithm);
      hash.update(content);
      return hash.digest('hex');
    } catch (error) {
      logger.error('Failed to calculate file hash:', { filePath, error: error.message });
      throw error;
    }
  }

  static async createTempFile(prefix = 'tmp', suffix = '.tmp') {
    try {
      const tempDir = path.join(process.cwd(), 'tmp');
      await this.ensureDirectoryExists(tempDir);
      
      const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${suffix}`;
      const tempPath = path.join(tempDir, filename);
      
      // Create empty file
      await fs.writeFile(tempPath, '');
      
      return tempPath;
    } catch (error) {
      logger.error('Failed to create temp file:', { error: error.message });
      throw error;
    }
  }

  static async cleanupTempFiles(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    try {
      const tempDir = path.join(process.cwd(), 'tmp');
      
      if (!(await this.fileExists(tempDir))) {
        return;
      }
      
      const files = await this.listFiles(tempDir);
      const now = Date.now();
      
      for (const file of files) {
        const stats = await this.getFileStats(file);
        if (now - stats.modifiedAt.getTime() > maxAge) {
          await this.deleteFile(file);
          logger.debug('Cleaned up temp file:', { file });
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup temp files:', { error: error.message });
    }
  }

  static async compressFile(filePath, compressionLevel = 6) {
    try {
      const zlib = require('zlib');
      const content = await fs.readFile(filePath);
      
      return new Promise((resolve, reject) => {
        zlib.gzip(content, { level: compressionLevel }, (err, compressed) => {
          if (err) {
            reject(err);
          } else {
            resolve(compressed);
          }
        });
      });
    } catch (error) {
      logger.error('Failed to compress file:', { filePath, error: error.message });
      throw error;
    }
  }

  static async decompressFile(compressedData) {
    try {
      const zlib = require('zlib');
      
      return new Promise((resolve, reject) => {
        zlib.gunzip(compressedData, (err, decompressed) => {
          if (err) {
            reject(err);
          } else {
            resolve(decompressed);
          }
        });
      });
    } catch (error) {
      logger.error('Failed to decompress file:', { error: error.message });
      throw error;
    }
  }

  static async watchFile(filePath, callback) {
    try {
      const watcher = fs.watch(filePath, (eventType, filename) => {
        logger.debug('File changed:', { filePath, eventType, filename });
        callback(eventType, filename);
      });
      
      return watcher;
    } catch (error) {
      logger.error('Failed to watch file:', { filePath, error: error.message });
      throw error;
    }
  }

  static async readJSONFile(filePath) {
    try {
      const content = await this.readFile(filePath);
      if (!content) {
        return null;
      }
      return JSON.parse(content);
    } catch (error) {
      if (error instanceof SyntaxError) {
        logger.error('Invalid JSON in file:', { filePath, error: error.message });
        throw new Error(`Invalid JSON in file: ${filePath}`);
      }
      throw error;
    }
  }

  static async writeJSONFile(filePath, data, options = {}) {
    try {
      const { indent = 2 } = options;
      const content = JSON.stringify(data, null, indent);
      return await this.writeFile(filePath, content, options);
    } catch (error) {
      logger.error('Failed to write JSON file:', { filePath, error: error.message });
      throw error;
    }
  }

  static getFileExtension(filePath) {
    return path.extname(filePath).toLowerCase();
  }

  static getFileName(filePath) {
    return path.basename(filePath, path.extname(filePath));
  }

  static getDirectoryName(filePath) {
    return path.dirname(filePath);
  }

  static joinPaths(...paths) {
    return path.join(...paths);
  }

  static resolvePath(...paths) {
    return path.resolve(...paths);
  }

  static isAbsolutePath(filePath) {
    return path.isAbsolute(filePath);
  }

  static normalizePath(filePath) {
    return path.normalize(filePath);
  }

  static formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  static validateFileName(fileName) {
    const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
    const reservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
    
    if (invalidChars.test(fileName)) {
      return { valid: false, reason: 'Contains invalid characters' };
    }
    
    if (reservedNames.test(fileName)) {
      return { valid: false, reason: 'Reserved file name' };
    }
    
    if (fileName.length > 255) {
      return { valid: false, reason: 'File name too long' };
    }
    
    return { valid: true };
  }
}

module.exports = { FileUtils };