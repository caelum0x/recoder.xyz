/**
 * WorkspaceContext - Manages multiple workspace directories and validates paths
 * Ported from Qwen Code (TypeScript) to JavaScript
 * Provides security and multi-directory support similar to Claude Code
 */

const fs = require('fs');
const path = require('path');

class WorkspaceContext {
  constructor(directory, additionalDirectories = []) {
    this.directories = new Set();
    this.initialDirectories = new Set();
    this.onDirectoriesChangedListeners = new Set();
    
    // Add initial directory
    this.addDirectory(directory);
    
    // Add additional directories if provided
    for (const additionalDirectory of additionalDirectories) {
      this.addDirectory(additionalDirectory);
    }
    
    // Save initial state
    this.initialDirectories = new Set(this.directories);
  }

  /**
   * Registers a listener that is called when workspace directories change
   * @param {Function} listener - Callback function
   * @returns {Function} Unsubscribe function
   */
  onDirectoriesChanged(listener) {
    this.onDirectoriesChangedListeners.add(listener);
    return () => {
      this.onDirectoriesChangedListeners.delete(listener);
    };
  }

  /**
   * Notifies all listeners of directory changes
   * @private
   */
  notifyDirectoriesChanged() {
    // Iterate over a copy to allow listeners to unsubscribe
    for (const listener of [...this.onDirectoriesChangedListeners]) {
      try {
        listener();
      } catch (error) {
        console.error('Error in WorkspaceContext listener:', error);
      }
    }
  }

  /**
   * Adds a directory to the workspace
   * @param {string} directory - Directory path (relative or absolute)
   * @param {string} basePath - Base path for resolving relative paths
   */
  addDirectory(directory, basePath = process.cwd()) {
    try {
      const resolved = this.resolveAndValidateDir(directory, basePath);
      if (this.directories.has(resolved)) {
        return; // Already added
      }
      this.directories.add(resolved);
      this.notifyDirectoriesChanged();
    } catch (error) {
      console.warn(
        `[WARN] Skipping unreadable directory: ${directory} (${error.message})`
      );
    }
  }

  /**
   * Resolves and validates a directory path
   * @private
   * @param {string} directory - Directory path
   * @param {string} basePath - Base path for resolving
   * @returns {string} Absolute, validated directory path
   */
  resolveAndValidateDir(directory, basePath = process.cwd()) {
    // Resolve to absolute path
    const absolutePath = path.isAbsolute(directory)
      ? directory
      : path.resolve(basePath, directory);

    // Check if exists
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Directory does not exist: ${absolutePath}`);
    }

    // Check if it's a directory
    const stats = fs.statSync(absolutePath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${absolutePath}`);
    }

    // Return real path (resolves symlinks)
    return fs.realpathSync(absolutePath);
  }

  /**
   * Gets all workspace directories
   * @returns {string[]} Array of absolute directory paths
   */
  getDirectories() {
    return Array.from(this.directories);
  }

  /**
   * Gets initial workspace directories
   * @returns {string[]} Array of absolute directory paths
   */
  getInitialDirectories() {
    return Array.from(this.initialDirectories);
  }

  /**
   * Sets the workspace directories (replaces existing)
   * @param {string[]} directories - Array of directory paths
   */
  setDirectories(directories) {
    const newDirectories = new Set();
    for (const dir of directories) {
      newDirectories.add(this.resolveAndValidateDir(dir));
    }

    // Check if changed
    const changed =
      newDirectories.size !== this.directories.size ||
      ![...newDirectories].every((d) => this.directories.has(d));

    if (changed) {
      this.directories = newDirectories;
      this.notifyDirectoriesChanged();
    }
  }

  /**
   * Checks if a path is within any workspace directory
   * CRITICAL SECURITY METHOD - Prevents path traversal attacks
   * @param {string} pathToCheck - Path to validate
   * @returns {boolean} True if path is within workspace
   */
  isPathWithinWorkspace(pathToCheck) {
    try {
      const fullyResolvedPath = this.fullyResolvedPath(pathToCheck);

      for (const dir of this.directories) {
        if (this.isPathWithinRoot(fullyResolvedPath, dir)) {
          return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Fully resolves a path, including symbolic links
   * Handles non-existent paths gracefully
   * @private
   * @param {string} pathToCheck - Path to resolve
   * @returns {string} Fully resolved path
   */
  fullyResolvedPath(pathToCheck) {
    try {
      return fs.realpathSync(pathToCheck);
    } catch (error) {
      if (error.code === 'ENOENT' && error.path) {
        // Path doesn't exist yet
        // Check if it's a symlink to non-existent file
        if (!this.isFileSymlink(error.path)) {
          // realpathSync sets error.path to the fully resolved path
          return error.path;
        }
      }
      throw error;
    }
  }

  /**
   * Checks if a path is within a given root directory
   * @private
   * @param {string} pathToCheck - Absolute path to check
   * @param {string} rootDirectory - Absolute root directory
   * @returns {boolean} True if path is within root
   */
  isPathWithinRoot(pathToCheck, rootDirectory) {
    const relative = path.relative(rootDirectory, pathToCheck);
    return (
      !relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative)
    );
  }

  /**
   * Checks if a file path is a symbolic link
   * @private
   * @param {string} filePath - File path to check
   * @returns {boolean} True if it's a symlink to a file
   */
  isFileSymlink(filePath) {
    try {
      const linkTarget = fs.readlinkSync(filePath);
      return !linkTarget.endsWith('/');
    } catch (error) {
      return false;
    }
  }

  /**
   * Validates a path and throws if it's outside the workspace
   * @param {string} pathToCheck - Path to validate
   * @throws {Error} If path is outside workspace
   */
  validatePath(pathToCheck) {
    if (!this.isPathWithinWorkspace(pathToCheck)) {
      throw new Error(
        `Security: Path is outside workspace directories: ${pathToCheck}`
      );
    }
  }

  /**
   * Gets a safe absolute path within the workspace
   * @param {string} relativePath - Relative or absolute path
   * @param {string} basePath - Base directory (defaults to first workspace dir)
   * @returns {string} Absolute path within workspace
   * @throws {Error} If resulting path is outside workspace
   */
  getSafePath(relativePath, basePath = null) {
    const base = basePath || this.getDirectories()[0];
    const absolutePath = path.isAbsolute(relativePath)
      ? relativePath
      : path.resolve(base, relativePath);
    
    this.validatePath(absolutePath);
    return absolutePath;
  }

  /**
   * Gets workspace statistics
   * @returns {Object} Statistics about the workspace
   */
  getStats() {
    const dirs = this.getDirectories();
    let totalFiles = 0;
    let totalSize = 0;

    for (const dir of dirs) {
      try {
        const files = this.countFilesRecursive(dir);
        totalFiles += files;
      } catch (error) {
        // Skip unreadable directories
      }
    }

    return {
      directories: dirs.length,
      files: totalFiles,
      paths: dirs
    };
  }

  /**
   * Counts files recursively in a directory
   * @private
   * @param {string} dirPath - Directory path
   * @returns {number} Number of files
   */
  countFilesRecursive(dirPath) {
    let count = 0;
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      // Skip hidden files and node_modules
      if (item.startsWith('.') || item === 'node_modules') {
        continue;
      }

      const fullPath = path.join(dirPath, item);
      try {
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          count += this.countFilesRecursive(fullPath);
        } else {
          count++;
        }
      } catch (error) {
        // Skip unreadable files
      }
    }

    return count;
  }
}

module.exports = WorkspaceContext;
