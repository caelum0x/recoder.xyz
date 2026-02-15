/**
 * File Watcher - Detects file changes in container and notifies frontend
 * Used for CLI integration (claude, recoder-code) to auto-refresh preview
 *
 * Features:
 * - Polls container filesystem for changes with adaptive polling interval
 * - Deduplicates events within 2-second window with LRU eviction
 * - Graceful error handling with consecutive error tracking and exponential backoff
 * - Auto-stops watching after too many consecutive errors with client notification
 * - Health status reporting to connected clients
 */

import Docker from 'dockerode';
import { EventEmitter } from 'events';

const docker = new Docker();

interface FileChangeEvent {
  type: 'create' | 'modify' | 'delete';
  path: string;
  timestamp: number;
}

interface WatcherStatus {
  projectId: string;
  status: 'healthy' | 'degraded' | 'dead';
  consecutiveErrors: number;
  currentPollInterval: number;
  lastSuccessfulPoll?: number;
  message?: string;
}

// Configuration for error handling
const MAX_CONSECUTIVE_ERRORS = 10;  // Stop watching after this many consecutive errors
const ERROR_LOG_INTERVAL = 5;       // Log every Nth error to avoid spam

// Configuration for adaptive polling
const MIN_POLL_INTERVAL = 1000;     // Start with 1 second polling
const MAX_POLL_INTERVAL = 5000;     // Escalate to 5 seconds if no changes
const POLL_ESCALATION_THRESHOLD = 10; // Escalate after 10 polls with no changes
const POLL_RESET_ON_CHANGE = true;  // Reset to fast polling when changes detected

// Configuration for deduplication buffer
const MAX_DEDUP_BUFFER_SIZE = 1000; // Maximum entries per project in dedup buffer

export class FileWatcher extends EventEmitter {
  private watchers = new Map<string, {
    interval: NodeJS.Timeout;
    lastCheck: Map<string, number>;
    consecutiveErrors: number;
    containerId: string;
    currentPollInterval: number;
    pollsWithoutChanges: number;
    lastSuccessfulPoll: number;
  }>();
  private recentEvents = new Map<string, Map<string, number>>(); // projectId -> Map of event keys -> timestamp (for LRU)
  private readonly DEBOUNCE_MS = 3000; // Deduplicate events within 3 seconds (aligned with frontend)

  // Write exclusion: paths written via the API that should be ignored on the next poll
  private writeExclusions = new Map<string, Map<string, number>>(); // projectId -> path -> expiry timestamp
  private readonly WRITE_EXCLUSION_MS = 5000; // Ignore self-written paths for 5 seconds

  /**
   * Get formatted timestamp for logging
   */
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Log with timestamp
   */
  private log(level: 'info' | 'warn' | 'error', message: string, extra?: Record<string, unknown>): void {
    const timestamp = this.getTimestamp();
    const extraStr = extra ? ` ${JSON.stringify(extra)}` : '';
    const formattedMessage = `[${timestamp}] [FileWatcher] ${message}${extraStr}`;

    switch (level) {
      case 'info':
        console.log(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'error':
        console.error(formattedMessage);
        break;
    }
  }

  /**
   * Send watcher health status to clients
   */
  sendWatcherStatus(projectId: string): void {
    const watcher = this.watchers.get(projectId);

    if (!watcher) {
      const status: WatcherStatus = {
        projectId,
        status: 'dead',
        consecutiveErrors: 0,
        currentPollInterval: 0,
        message: 'Watcher not running',
      };
      this.emit('watcher_status', status);
      return;
    }

    let status: WatcherStatus['status'] = 'healthy';
    let message: string | undefined;

    if (watcher.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      status = 'dead';
      message = 'Watcher stopped due to too many errors';
    } else if (watcher.consecutiveErrors > 0) {
      status = 'degraded';
      message = `Experiencing errors (${watcher.consecutiveErrors} consecutive)`;
    }

    const watcherStatus: WatcherStatus = {
      projectId,
      status,
      consecutiveErrors: watcher.consecutiveErrors,
      currentPollInterval: watcher.currentPollInterval,
      lastSuccessfulPoll: watcher.lastSuccessfulPoll,
      message,
    };

    this.emit('watcher_status', watcherStatus);
  }

  /**
   * Mark paths as recently written via the API, so the next poll skips them.
   * This prevents the FileWatcher from sending change events back to the
   * same client that just wrote the files.
   */
  excludeWrittenPaths(projectId: string, paths: string[]): void {
    if (!this.writeExclusions.has(projectId)) {
      this.writeExclusions.set(projectId, new Map());
    }
    const exclusions = this.writeExclusions.get(projectId)!;
    const expiry = Date.now() + this.WRITE_EXCLUSION_MS;
    for (const p of paths) {
      exclusions.set(p, expiry);
    }
  }

  /**
   * Check if a path is currently excluded (was just written via API).
   * Automatically cleans expired entries.
   */
  private isPathExcluded(projectId: string, path: string): boolean {
    const exclusions = this.writeExclusions.get(projectId);
    if (!exclusions) return false;

    const expiry = exclusions.get(path);
    if (!expiry) return false;

    if (Date.now() > expiry) {
      exclusions.delete(path);
      if (exclusions.size === 0) this.writeExclusions.delete(projectId);
      return false;
    }
    return true;
  }

  /**
   * Reset error count for a project's watcher (call after successful reconnect)
   */
  resetErrorCount(projectId: string): void {
    const watcher = this.watchers.get(projectId);
    if (watcher) {
      watcher.consecutiveErrors = 0;
      watcher.currentPollInterval = MIN_POLL_INTERVAL;
      this.log('info', `Reset error count for ${projectId}`);
      this.sendWatcherStatus(projectId);
    }
  }

  /**
   * Adjust polling interval based on activity
   */
  private adjustPollInterval(projectId: string, hadChanges: boolean): void {
    const watcher = this.watchers.get(projectId);
    if (!watcher) return;

    if (hadChanges && POLL_RESET_ON_CHANGE) {
      // Reset to fast polling when changes are detected
      if (watcher.currentPollInterval !== MIN_POLL_INTERVAL) {
        this.log('info', `${projectId}: Changes detected, resetting to fast polling`, {
          from: watcher.currentPollInterval,
          to: MIN_POLL_INTERVAL,
        });
      }
      watcher.currentPollInterval = MIN_POLL_INTERVAL;
      watcher.pollsWithoutChanges = 0;
    } else {
      watcher.pollsWithoutChanges++;

      // Escalate polling interval if no changes for a while
      if (watcher.pollsWithoutChanges >= POLL_ESCALATION_THRESHOLD &&
          watcher.currentPollInterval < MAX_POLL_INTERVAL) {
        const newInterval = Math.min(watcher.currentPollInterval * 1.5, MAX_POLL_INTERVAL);
        this.log('info', `${projectId}: No changes, escalating poll interval`, {
          from: watcher.currentPollInterval,
          to: Math.round(newInterval),
          pollsWithoutChanges: watcher.pollsWithoutChanges,
        });
        watcher.currentPollInterval = Math.round(newInterval);
        watcher.pollsWithoutChanges = 0;

        // Restart the interval with new timing
        this.restartPollingInterval(projectId);
      }
    }
  }

  /**
   * Restart polling interval with current poll interval setting
   */
  private restartPollingInterval(projectId: string): void {
    const watcher = this.watchers.get(projectId);
    if (!watcher) return;

    clearInterval(watcher.interval);
    const container = docker.getContainer(watcher.containerId);
    watcher.interval = this.createPollingInterval(container, projectId, watcher.lastCheck);
  }

  /**
   * Create the polling interval
   */
  private createPollingInterval(
    container: Docker.Container,
    projectId: string,
    lastCheck: Map<string, number>
  ): NodeJS.Timeout {
    const poll = async () => {
      const watcher = this.watchers.get(projectId);
      if (!watcher) return;

      try {
        const files = await this.getFileList(container);
        const currentFiles = new Map<string, number>();
        const changes: FileChangeEvent[] = [];

        // Reset error counter on success and update last successful poll
        watcher.consecutiveErrors = 0;
        watcher.lastSuccessfulPoll = Date.now();

        for (const file of files) {
          currentFiles.set(file.path, file.mtime);

          const lastMtime = lastCheck.get(file.path);
          if (!lastMtime) {
            // New file
            changes.push({ type: 'create', path: file.path, timestamp: file.mtime });
          } else if (file.mtime > lastMtime) {
            // Modified file
            changes.push({ type: 'modify', path: file.path, timestamp: file.mtime });
          }
        }

        // Check for deleted files
        for (const [path] of lastCheck) {
          if (!currentFiles.has(path)) {
            changes.push({ type: 'delete', path, timestamp: Date.now() });
          }
        }

        // Update lastCheck
        lastCheck.clear();
        for (const [path, mtime] of currentFiles) {
          lastCheck.set(path, mtime);
        }

        // Adjust polling interval based on whether changes were detected
        this.adjustPollInterval(projectId, changes.length > 0);

        // Emit changes (after exclusion filtering and deduplication)
        if (changes.length > 0) {
          // Filter out paths that were just written via the API
          const nonExcluded = changes.filter(c => !this.isPathExcluded(projectId, c.path));
          if (nonExcluded.length < changes.length) {
            this.log('info', `${projectId}: Filtered ${changes.length - nonExcluded.length} self-written paths`);
          }

          if (nonExcluded.length > 0) {
            const dedupedChanges = this.deduplicateEvents(projectId, nonExcluded);
            if (dedupedChanges.length > 0) {
              this.log('info', `${projectId}: ${dedupedChanges.length} file changes detected`, {
                duplicatesFiltered: nonExcluded.length - dedupedChanges.length,
              });
              this.emit('changes', { projectId, changes: dedupedChanges });
            }
          }
        }
      } catch (e) {
        watcher.consecutiveErrors++;

        // Log errors periodically to avoid spam
        if (watcher.consecutiveErrors % ERROR_LOG_INTERVAL === 1) {
          this.log('warn', `Error polling ${projectId}`, {
            consecutiveErrors: watcher.consecutiveErrors,
            error: (e as Error).message || String(e),
          });
        }

        // Send degraded status when errors occur
        if (watcher.consecutiveErrors === 1 || watcher.consecutiveErrors % ERROR_LOG_INTERVAL === 0) {
          this.sendWatcherStatus(projectId);
        }

        // Stop watching if too many consecutive errors (container likely stopped)
        if (watcher.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          this.log('error', `Too many errors for ${projectId}, stopping watcher`, {
            consecutiveErrors: watcher.consecutiveErrors,
            maxAllowed: MAX_CONSECUTIVE_ERRORS,
          });

          // Emit watcher_died event BEFORE stopping so clients can be notified
          this.emit('watcher_died', {
            projectId,
            containerId: watcher.containerId,
            consecutiveErrors: watcher.consecutiveErrors,
            lastSuccessfulPoll: watcher.lastSuccessfulPoll,
            message: 'File watcher stopped due to too many consecutive errors. Container may have stopped.',
          });

          this.stopWatching(projectId);
        }
      }
    };

    // Execute first poll immediately, then set up interval
    poll();
    const currentWatcher = this.watchers.get(projectId);
    return setInterval(poll, currentWatcher?.currentPollInterval || MIN_POLL_INTERVAL);
  }

  /**
   * Start watching a container's /workspace directory
   */
  async startWatching(containerId: string, projectId: string): Promise<void> {
    const existingWatcher = this.watchers.get(projectId);
    if (existingWatcher) {
      // If already watching the same container, just return
      if (existingWatcher.containerId === containerId) {
        this.log('info', `Already watching ${projectId}`);
        return;
      }
      // If container ID changed, stop old watcher and start new one
      this.log('info', `Container ID changed for ${projectId}, restarting watcher`);
      this.stopWatching(projectId);
    }

    const container = docker.getContainer(containerId);
    const lastCheck = new Map<string, number>();

    // Initial file scan
    try {
      const files = await this.getFileList(container);
      for (const file of files) {
        lastCheck.set(file.path, file.mtime);
      }
      this.log('info', `Initial scan for ${projectId}`, { fileCount: files.length });
    } catch (e) {
      // Don't fail completely - container might still be starting up
      this.log('warn', `Initial file scan failed for ${projectId}, will retry during polling`, {
        error: (e as Error).message || String(e),
      });
    }

    // Initialize watcher state
    const watcherState = {
      interval: null as unknown as NodeJS.Timeout,
      lastCheck,
      consecutiveErrors: 0,
      containerId,
      currentPollInterval: MIN_POLL_INTERVAL,
      pollsWithoutChanges: 0,
      lastSuccessfulPoll: Date.now(),
    };

    this.watchers.set(projectId, watcherState);

    // Start polling for changes
    watcherState.interval = this.createPollingInterval(container, projectId, lastCheck);

    this.log('info', `Started watching ${projectId}`, {
      containerId: containerId.slice(0, 12),
      pollInterval: MIN_POLL_INTERVAL,
    });

    // Send initial healthy status
    this.sendWatcherStatus(projectId);
  }

  /**
   * Stop watching a container
   */
  stopWatching(projectId: string): void {
    const watcher = this.watchers.get(projectId);
    if (watcher) {
      clearInterval(watcher.interval);
      this.watchers.delete(projectId);
      this.recentEvents.delete(projectId);
      this.writeExclusions.delete(projectId);
      this.log('info', `Stopped watching ${projectId}`);
    }
  }

  /**
   * Evict oldest entries from dedup buffer using LRU strategy
   */
  private evictOldestEntries(recentMap: Map<string, number>, targetSize: number): void {
    if (recentMap.size <= targetSize) return;

    // Sort by timestamp (oldest first) and remove oldest entries
    const entries = Array.from(recentMap.entries())
      .sort((a, b) => a[1] - b[1]);

    const toRemove = entries.slice(0, recentMap.size - targetSize);
    for (const [key] of toRemove) {
      recentMap.delete(key);
    }

    this.log('info', `Evicted ${toRemove.length} oldest entries from dedup buffer`, {
      beforeSize: entries.length,
      afterSize: recentMap.size,
    });
  }

  /**
   * Deduplicate file change events to prevent infinite loops
   * Same file+event type should not trigger multiple times within DEBOUNCE_MS
   * Implements LRU eviction when buffer exceeds MAX_DEDUP_BUFFER_SIZE
   */
  private deduplicateEvents(projectId: string, changes: FileChangeEvent[]): FileChangeEvent[] {
    if (!this.recentEvents.has(projectId)) {
      this.recentEvents.set(projectId, new Map());
    }

    const recentMap = this.recentEvents.get(projectId)!;
    const dedupedChanges: FileChangeEvent[] = [];
    const now = Date.now();

    // First, clean up expired entries
    for (const [key, timestamp] of recentMap) {
      if (now - timestamp > this.DEBOUNCE_MS) {
        recentMap.delete(key);
      }
    }

    // Check if we need to evict due to size limit
    if (recentMap.size >= MAX_DEDUP_BUFFER_SIZE) {
      this.evictOldestEntries(recentMap, Math.floor(MAX_DEDUP_BUFFER_SIZE * 0.75));
    }

    for (const change of changes) {
      const eventKey = `${change.type}:${change.path}`;
      const lastSeen = recentMap.get(eventKey);

      if (!lastSeen || now - lastSeen > this.DEBOUNCE_MS) {
        // New event or expired, add it
        dedupedChanges.push(change);
        recentMap.set(eventKey, now);
      }
    }

    return dedupedChanges;
  }

  /**
   * Get file list with modification times from container
   */
  private async getFileList(container: Docker.Container): Promise<Array<{ path: string; mtime: number }>> {
    const exec = await container.exec({
      Cmd: ['find', '/workspace', '-type', 'f', '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.git/*', '-printf', '%T@ %p\\n'],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true, stdin: false });
    
    return new Promise((resolve, reject) => {
      let output = '';
      
      stream.on('data', (chunk: Buffer) => {
        // Docker stream has 8-byte header
        output += chunk.slice(8).toString();
      });

      stream.on('end', () => {
        const files: Array<{ path: string; mtime: number }> = [];
        const lines = output.trim().split('\n').filter(Boolean);
        
        for (const line of lines) {
          const match = line.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
          if (match) {
            const mtime = Math.floor(parseFloat(match[1]) * 1000);
            const path = match[2].replace('/workspace/', '');
            files.push({ path, mtime });
          }
        }
        
        resolve(files);
      });

      stream.on('error', reject);
      
      // Timeout after 5 seconds
      setTimeout(() => resolve([]), 5000);
    });
  }
}

export const fileWatcher = new FileWatcher();
