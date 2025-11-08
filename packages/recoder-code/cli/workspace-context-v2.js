#!/usr/bin/env node

/**
 * WorkspaceContext - Qwen Code Architecture
 * 
 * Manages multiple workspace directories and validates paths against them.
 * This allows the CLI to operate on files from multiple directories in a single session.
 * 
 * Adapted from Qwen Code (Google Gemini Code) for Recoder Code
 * Original: packages/core/src/utils/workspaceContext.ts
 */

const fs = require('fs');
const path = require('path');

class WorkspaceContext {
  constructor(directory, additionalDirectories = []) {
    this.directories = new Set();
    this.onDirectoriesChangedListeners = new Set();
    
    // Add initial directory
    this.addDirectory(directory);
    
    // Add any additional directories
    for (const additionalDirectory of additionalDirectories) {
      this.addDirectory(additionalDirectory);
    }
    
    // Store initial directories for reference
    this.initialDirectories = new Set(this.directories);
  }

  /**
   * Registers a listener that is called when the workspace directories change.
   * @param {Function} listener - The listener to call
   * @returns {Function} A function to unsubscribe the listener
   */
  onDirectoriesChanged(listener) {
    this.onDirectoriesChangedListeners.add(listener);
    return () => {
      this.onDirectoriesChangedListeners.delete(listener);
    };
  }

  /**
   * Notifies all listeners that directories have changed
   * @private
   */
  notifyDirectoriesChanged() {
    // Iterate over a copy of the set in case a listener unsubscribes itself or others
    for (const listener of [...this.onDirectoriesChangedListeners]) {
      try {
        listener();
      } catch (e) {
        // Don't let one listener break others
        console.error('Error in WorkspaceContext listener:', e);
      }
    }
  }

  /**
   * Adds a directory to the workspace.
   * @param {string} directory - The directory path to add (can be relative or absolute)
   * @param {string} basePath - Optional base path for resolving relative paths (defaults to cwd)
   */
  addDirectory(directory, basePath = process.cwd()) {
    try {
      const resolved = this.resolveAndValidateDir(directory, basePath);
      if (this.directories.has(resolved)) {
        return;
      }
      this.directories.add(resolved);
      this.notifyDirectoriesChanged();
    } catch (err) {
      console.warn(
        `[WARN] Skipping unreadable directory: ${directory} (${err instanceof Error ? err.message : String(err)})`
      );
    }
  }

  /**
   * Resolves and validates a directory path
   * @private
   * @param {string} directory - The directory path
   * @param {string} basePath - The base path for resolution
   * @returns {string} The absolute, validated path
   * @throws {Error} If directory doesn't exist or is not a directory
   */
  resolveAndValidateDir(directory, basePath = process.cwd()) {
    const absolutePath = path.isAbsolute(directory)
      ? directory
      : path.resolve(basePath, directory);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Directory does not exist: ${absolutePath}`);
    }
    
    const stats = fs.statSync(absolutePath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${absolutePath}`);
    }

    return fs.realpathSync(absolutePath);
  }

  /**
   * Gets a copy of all workspace directories.
   * @returns {string[]} Array of absolute directory paths
   */
  getDirectories() {
    return Array.from(this.directories);
  }

  /**
   * Gets the initial directories that were set during construction
   * @returns {string[]} Array of initial directory paths
   */
  getInitialDirectories() {
    return Array.from(this.initialDirectories);
  }

  /**
   * Sets the workspace directories, replacing the current set
   * @param {string[]} directories - Array of directory paths
   */
  setDirectories(directories) {
    const newDirectories = new Set();
    for (const dir of directories) {
      newDirectories.add(this.resolveAndValidateDir(dir));
    }

    // Check if directories actually changed
    if (
      newDirectories.size !== this.directories.size ||
      ![...newDirectories].every((d) => this.directories.has(d))
    ) {
      this.directories = newDirectories;
      this.notifyDirectoriesChanged();
    }
  }

  /**
   * Checks if a given path is within any of the workspace directories.
   * This is crucial for security - prevents path traversal attacks.
   * 
   * @param {string} pathToCheck - The path to validate
   * @returns {boolean} True if the path is within the workspace, false otherwise
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
    } catch (_error) {
      return false;
    }
  }

  /**
   * Fully resolves a path, including symbolic links.
   * If the path does not exist, it returns the fully resolved path as it would be
   * if it did exist.
   * 
   * @private
   * @param {string} pathToCheck - The path to resolve
   * @returns {string} The fully resolved path
   */
  fullyResolvedPath(pathToCheck) {
    try {
      return fs.realpathSync(pathToCheck);
    } catch (e) {
      // If path doesn't exist, try to resolve as much as possible
      if (e.code === 'ENOENT' && e.path && !this.isFileSymlink(e.path)) {
        // realpathSync sets e.path to the fully resolved path even if it doesn't exist
        return e.path;
      }
      throw e;
    }
  }

  /**
   * Checks if a path is within a given root directory.
   * @private
   * @param {string} pathToCheck - The absolute path to check
   * @param {string} rootDirectory - The absolute root directory
   * @returns {boolean} True if the path is within the root directory, false otherwise
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
   * Checks if a file path is a symbolic link that points to a file.
   * @private
   * @param {string} filePath - The file path to check
   * @returns {boolean} True if it's a file symlink, false otherwise
   */
  isFileSymlink(filePath) {
    try {
      return !fs.readlinkSync(filePath).endsWith('/');
    } catch (_error) {
      return false;
    }
  }

  /**
   * Validates a path and returns the absolute path if valid
   * @param {string} pathToCheck - The path to validate
   * @returns {string|null} The absolute path if valid, null otherwise
   */
  validatePath(pathToCheck) {
    if (!this.isPathWithinWorkspace(pathToCheck)) {
      return null;
    }
    
    try {
      const absolutePath = path.isAbsolute(pathToCheck)
        ? pathToCheck
        : path.resolve(this.getDirectories()[0], pathToCheck);
      return absolutePath;
    } catch (error) {
      return null;
    }
  }

  /**
   * Gets the primary workspace directory (first one added)
   * @returns {string} The primary directory path
   */
  getPrimaryDirectory() {
    return this.getDirectories()[0] || process.cwd();
  }

  /**
   * Checks if the workspace has multiple directories
   * @returns {boolean} True if multiple directories, false otherwise
   */
  hasMultipleDirectories() {
    return this.directories.size > 1;
  }

  /**
   * Removes a directory from the workspace
   * @param {string} directory - The directory to remove
   * @returns {boolean} True if removed, false if not found
   */
  removeDirectory(directory) {
    const resolved = this.resolveAndValidateDir(directory);
    const hadDirectory = this.directories.has(resolved);
    
    if (hadDirectory) {
      this.directories.delete(resolved);
      this.notifyDirectoriesChanged();
    }
    
    return hadDirectory;
  }

  /**
   * Clears all directories and sets a new single directory
   * @param {string} directory - The new directory
   */
  resetToDirectory(directory) {
    this.directories.clear();
    this.addDirectory(directory);
  }

  /**
   * Gets workspace information for display
   * @returns {Object} Workspace information
   */
  getInfo() {
    return {
      directories: this.getDirectories(),
      primaryDirectory: this.getPrimaryDirectory(),
      directoryCount: this.directories.size,
      hasMultiple: this.hasMultipleDirectories(),
      initialDirectories: this.getInitialDirectories()
    };
  }

  /**
   * Serializes the workspace context to JSON
   * @returns {Object} Serializable object
   */
  toJSON() {
    return {
      directories: this.getDirectories(),
      initialDirectories: this.getInitialDirectories()
    };
  }

  /**
   * Creates a WorkspaceContext from JSON
   * @param {Object} json - The JSON object
   * @returns {WorkspaceContext} A new WorkspaceContext instance
   */
  static fromJSON(json) {
    const [firstDir, ...rest] = json.directories || [];
    return new WorkspaceContext(firstDir || process.cwd(), rest);
  }
}

module.exports = WorkspaceContext;
