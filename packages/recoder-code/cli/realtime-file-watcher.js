#!/usr/bin/env node

/**
 * Real-time File Watcher - Enhanced file watching with smart change detection
 * Provides real-time awareness of file changes like Claude Code
 */

const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

class RealtimeFileWatcher {
  constructor(rootDirectory, options = {}) {
    this.rootDirectory = rootDirectory || process.cwd();
    this.options = {
      debounce: options.debounce || 300,
      ignored: options.ignored || [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.next/**',
        '**/coverage/**',
        '**/*.log'
      ],
      ...options
    };

    // File state tracking
    this.fileStates = new Map(); // path -> { hash, size, mtime }
    this.watchedPaths = new Set();
    
    // Change events buffer
    this.changeBuffer = [];
    this.debounceTimer = null;
    
    // Event handlers
    this.handlers = {
      onChange: [],
      onAdd: [],
      onDelete: [],
      onBatch: []
    };

    // Watcher instance
    this.watcher = null;
    
    // Statistics
    this.stats = {
      totalChanges: 0,
      filesWatched: 0,
      lastChangeTime: null,
      startTime: Date.now()
    };
  }

  /**
   * Start watching
   */
  start() {
    if (this.watcher) {
      console.log(chalk.yellow('⚠️  Watcher already started'));
      return;
    }

    console.log(chalk.blue('👁️  Starting file watcher...'));

    this.watcher = chokidar.watch(this.rootDirectory, {
      ignored: this.options.ignored,
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      },
      depth: this.options.depth || 10
    });

    // Setup event handlers
    this.watcher.on('ready', () => {
      this.stats.filesWatched = this.watchedPaths.size;
      console.log(chalk.green(`✓ Watching ${this.stats.filesWatched} files`));
    });

    this.watcher.on('add', (filePath) => {
      this.handleAdd(filePath);
    });

    this.watcher.on('change', (filePath) => {
      this.handleChange(filePath);
    });

    this.watcher.on('unlink', (filePath) => {
      this.handleDelete(filePath);
    });

    this.watcher.on('error', (error) => {
      console.error(chalk.red('❌ Watcher error:'), error.message);
    });

    return this;
  }

  /**
   * Stop watching
   */
  async stop() {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      console.log(chalk.gray('✓ File watcher stopped'));
    }
  }

  /**
   * Handle file addition
   */
  handleAdd(filePath) {
    this.watchedPaths.add(filePath);
    
    try {
      const stats = fs.statSync(filePath);
      const hash = this.calculateFileHash(filePath);
      
      this.fileStates.set(filePath, {
        hash,
        size: stats.size,
        mtime: stats.mtimeMs
      });

      const event = {
        type: 'add',
        path: filePath,
        relativePath: path.relative(this.rootDirectory, filePath),
        timestamp: Date.now()
      };

      this.bufferChange(event);
      this.triggerHandlers('onAdd', event);
      
    } catch (error) {
      // File may have been deleted immediately
    }
  }

  /**
   * Handle file change
   */
  handleChange(filePath) {
    try {
      const stats = fs.statSync(filePath);
      const hash = this.calculateFileHash(filePath);
      const oldState = this.fileStates.get(filePath);

      // Check if content actually changed
      if (oldState && oldState.hash === hash) {
        return; // No actual content change
      }

      this.fileStates.set(filePath, {
        hash,
        size: stats.size,
        mtime: stats.mtimeMs
      });

      const event = {
        type: 'change',
        path: filePath,
        relativePath: path.relative(this.rootDirectory, filePath),
        timestamp: Date.now(),
        oldSize: oldState?.size,
        newSize: stats.size,
        sizeDelta: stats.size - (oldState?.size || 0)
      };

      this.stats.totalChanges++;
      this.stats.lastChangeTime = Date.now();

      this.bufferChange(event);
      this.triggerHandlers('onChange', event);
      
    } catch (error) {
      // File may have been deleted
    }
  }

  /**
   * Handle file deletion
   */
  handleDelete(filePath) {
    this.watchedPaths.delete(filePath);
    this.fileStates.delete(filePath);

    const event = {
      type: 'delete',
      path: filePath,
      relativePath: path.relative(this.rootDirectory, filePath),
      timestamp: Date.now()
    };

    this.bufferChange(event);
    this.triggerHandlers('onDelete', event);
  }

  /**
   * Buffer changes for batch processing
   */
  bufferChange(event) {
    this.changeBuffer.push(event);

    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer for batch processing
    this.debounceTimer = setTimeout(() => {
      this.processBatch();
    }, this.options.debounce);
  }

  /**
   * Process buffered changes as batch
   */
  processBatch() {
    if (this.changeBuffer.length === 0) return;

    const batch = {
      changes: [...this.changeBuffer],
      timestamp: Date.now()
    };

    this.changeBuffer = [];
    this.triggerHandlers('onBatch', batch);
  }

  /**
   * Calculate file hash for change detection
   */
  calculateFileHash(filePath) {
    try {
      const content = fs.readFileSync(filePath);
      return crypto.createHash('md5').update(content).digest('hex');
    } catch (error) {
      return null;
    }
  }

  /**
   * Register event handler
   */
  on(event, handler) {
    if (this.handlers[event]) {
      this.handlers[event].push(handler);
    }
    return this;
  }

  /**
   * Trigger event handlers
   */
  triggerHandlers(event, data) {
    const handlers = this.handlers[event] || [];
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (error) {
        console.error(chalk.red(`Error in ${event} handler:`), error);
      }
    }
  }

  /**
   * Get currently watched files
   */
  getWatchedFiles() {
    return Array.from(this.watchedPaths);
  }

  /**
   * Get file state
   */
  getFileState(filePath) {
    return this.fileStates.get(filePath);
  }

  /**
   * Get recent changes
   */
  getRecentChanges(limit = 10) {
    return this.changeBuffer.slice(-limit);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      filesWatched: this.watchedPaths.size,
      uptime: Date.now() - this.stats.startTime,
      bufferedChanges: this.changeBuffer.length
    };
  }

  /**
   * Check if path is being watched
   */
  isWatching(filePath) {
    return this.watchedPaths.has(filePath);
  }

  /**
   * Add path to watch
   */
  watch(filePath) {
    if (this.watcher) {
      this.watcher.add(filePath);
    }
  }

  /**
   * Remove path from watch
   */
  unwatch(filePath) {
    if (this.watcher) {
      this.watcher.unwatch(filePath);
      this.watchedPaths.delete(filePath);
      this.fileStates.delete(filePath);
    }
  }

  /**
   * Get change summary
   */
  getChangeSummary() {
    const types = { add: 0, change: 0, delete: 0 };
    
    for (const change of this.changeBuffer) {
      types[change.type] = (types[change.type] || 0) + 1;
    }

    return {
      total: this.changeBuffer.length,
      ...types
    };
  }

  /**
   * Check if path should be ignored
   */
  shouldIgnore(filePath) {
    // Common patterns to ignore
    const ignorePatterns = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.next',
      'out',
      'coverage',
      '.cache',
      '.vscode',
      '.idea',
      '*.log',
      '.DS_Store',
      'npm-debug.log',
      'yarn-error.log'
    ];

    const normalizedPath = filePath.replace(/\\/g, '/');
    
    // Check each pattern
    for (const pattern of ignorePatterns) {
      if (pattern.includes('*')) {
        // Wildcard pattern
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        if (regex.test(normalizedPath)) {
          return true;
        }
      } else {
        // Simple substring match
        if (normalizedPath.includes(pattern)) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Get list of watched paths
   */
  getWatchedPaths() {
    return Array.from(this.watchedPaths);
  }
}

module.exports = RealtimeFileWatcher;
