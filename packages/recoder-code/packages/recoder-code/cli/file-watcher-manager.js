#!/usr/bin/env node

const chokidar = require('chokidar');
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

/**
 * File Watcher Resource Manager
 * Prevents EMFILE errors by managing file watchers globally
 */
class FileWatcherManager {
  constructor() {
    this.watchers = new Map();
    this.watchTargets = new Map(); // Track what's being watched
    this.maxWatchers = 50; // Conservative limit
    this.isShuttingDown = false;
    
    // Global cleanup on process exit
    process.on('exit', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }

  /**
   * Create or reuse a file watcher
   */
  createWatcher(id, paths, options = {}, callbacks = {}) {
    // If we already have a watcher for this ID, clean it up first
    if (this.watchers.has(id)) {
      this.removeWatcher(id);
    }

    // Check watcher limit
    if (this.watchers.size >= this.maxWatchers) {
      console.log(chalk.yellow(`⚠️  File watcher limit reached (${this.maxWatchers}), skipping ${id}`));
      return null;
    }

    try {
      // Create watcher with safe defaults
      const safeOptions = {
        persistent: false, // Don't keep process alive
        ignoreInitial: true,
        usePolling: false,
        ignorePermissionErrors: true,
        ...options
      };

      const watcher = chokidar.watch(paths, safeOptions);
      
      // Set up callbacks
      if (callbacks.onChange) {
        watcher.on('change', (path) => {
          try {
            callbacks.onChange(path);
          } catch (error) {
            if (process.env.RECODER_DEBUG === 'true') {
              console.log(chalk.gray(`📁 File watcher ${id} change error:`, error.message));
            }
          }
        });
      }

      if (callbacks.onAdd) {
        watcher.on('add', (path) => {
          try {
            callbacks.onAdd(path);
          } catch (error) {
            if (process.env.RECODER_DEBUG === 'true') {
              console.log(chalk.gray(`📁 File watcher ${id} add error:`, error.message));
            }
          }
        });
      }

      if (callbacks.onUnlink) {
        watcher.on('unlink', (path) => {
          try {
            callbacks.onUnlink(path);
          } catch (error) {
            if (process.env.RECODER_DEBUG === 'true') {
              console.log(chalk.gray(`📁 File watcher ${id} unlink error:`, error.message));
            }
          }
        });
      }

      // Handle watcher errors gracefully
      watcher.on('error', (error) => {
        if (process.env.RECODER_DEBUG === 'true') {
          console.log(chalk.gray(`📁 File watcher ${id} error:`, error.message));
        }
        // Auto-remove problematic watchers
        this.removeWatcher(id);
      });

      // Store watcher
      this.watchers.set(id, watcher);
      this.watchTargets.set(id, { paths, options, callbacks });

      if (process.env.RECODER_DEBUG === 'true') {
        console.log(chalk.gray(`📁 File watcher ${id} created (total: ${this.watchers.size})`));
      }

      return watcher;
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Failed to create file watcher ${id}:`, error.message));
      return null;
    }
  }

  /**
   * Remove a specific watcher
   */
  removeWatcher(id) {
    const watcher = this.watchers.get(id);
    if (watcher) {
      try {
        watcher.close();
      } catch (error) {
        // Ignore cleanup errors
      }
      this.watchers.delete(id);
      this.watchTargets.delete(id);
      
      if (process.env.RECODER_DEBUG === 'true') {
        console.log(chalk.gray(`📁 File watcher ${id} removed (total: ${this.watchers.size})`));
      }
    }
  }

  /**
   * Get watcher by ID
   */
  getWatcher(id) {
    return this.watchers.get(id);
  }

  /**
   * Check if watcher exists
   */
  hasWatcher(id) {
    return this.watchers.has(id);
  }

  /**
   * Get watcher count
   */
  getWatcherCount() {
    return this.watchers.size;
  }

  /**
   * List all active watchers
   */
  listWatchers() {
    return Array.from(this.watchers.keys());
  }

  /**
   * Cleanup all watchers
   */
  cleanup() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log(chalk.gray(`📁 Cleaning up ${this.watchers.size} file watchers...`));
    
    for (const [id, watcher] of this.watchers) {
      try {
        watcher.close();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    
    this.watchers.clear();
    this.watchTargets.clear();
  }

  /**
   * Health check - remove dead watchers
   */
  healthCheck() {
    const deadWatchers = [];
    
    for (const [id, watcher] of this.watchers) {
      try {
        // Try to get watched paths - if this fails, watcher is dead
        if (!watcher.getWatched || Object.keys(watcher.getWatched()).length === 0) {
          deadWatchers.push(id);
        }
      } catch (error) {
        deadWatchers.push(id);
      }
    }

    // Remove dead watchers
    deadWatchers.forEach(id => this.removeWatcher(id));
    
    if (deadWatchers.length > 0 && process.env.RECODER_DEBUG === 'true') {
      console.log(chalk.gray(`📁 Removed ${deadWatchers.length} dead file watchers`));
    }
  }
}

// Global singleton instance
const fileWatcherManager = new FileWatcherManager();

// Periodic health check
setInterval(() => {
  fileWatcherManager.healthCheck();
}, 30000); // Every 30 seconds

module.exports = FileWatcherManager;
module.exports.instance = fileWatcherManager;