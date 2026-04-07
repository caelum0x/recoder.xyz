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
import { EventEmitter } from 'events';
export declare class FileWatcher extends EventEmitter {
    private watchers;
    private recentEvents;
    private readonly DEBOUNCE_MS;
    private writeExclusions;
    private readonly WRITE_EXCLUSION_MS;
    /**
     * Get formatted timestamp for logging
     */
    private getTimestamp;
    /**
     * Log with timestamp
     */
    private log;
    /**
     * Send watcher health status to clients
     */
    sendWatcherStatus(projectId: string): void;
    /**
     * Mark paths as recently written via the API, so the next poll skips them.
     * This prevents the FileWatcher from sending change events back to the
     * same client that just wrote the files.
     */
    excludeWrittenPaths(projectId: string, paths: string[]): void;
    /**
     * Check if a path is currently excluded (was just written via API).
     * Automatically cleans expired entries.
     */
    private isPathExcluded;
    /**
     * Reset error count for a project's watcher (call after successful reconnect)
     */
    resetErrorCount(projectId: string): void;
    /**
     * Adjust polling interval based on activity
     */
    private adjustPollInterval;
    /**
     * Restart polling interval with current poll interval setting
     */
    private restartPollingInterval;
    /**
     * Create the polling interval
     */
    private createPollingInterval;
    /**
     * Start watching a container's /workspace directory
     */
    startWatching(containerId: string, projectId: string): Promise<void>;
    /**
     * Stop watching a container
     */
    stopWatching(projectId: string): void;
    /**
     * Evict oldest entries from dedup buffer using LRU strategy
     */
    private evictOldestEntries;
    /**
     * Deduplicate file change events to prevent infinite loops
     * Same file+event type should not trigger multiple times within DEBOUNCE_MS
     * Implements LRU eviction when buffer exceeds MAX_DEDUP_BUFFER_SIZE
     */
    private deduplicateEvents;
    /**
     * Get file list with modification times from container
     */
    private getFileList;
}
export declare const fileWatcher: FileWatcher;
