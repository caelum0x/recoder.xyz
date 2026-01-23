/**
 * File Watcher - Detects file changes in container and notifies frontend
 * Used for CLI integration (claude, recoder-code) to auto-refresh preview
 */

import Docker from 'dockerode';
import { EventEmitter } from 'events';

const docker = new Docker();

interface FileChangeEvent {
  type: 'create' | 'modify' | 'delete';
  path: string;
  timestamp: number;
}

class FileWatcher extends EventEmitter {
  private watchers = new Map<string, { interval: NodeJS.Timeout; lastCheck: Map<string, number> }>();
  private pollInterval = 1000; // Check every 1 second
  private recentEvents = new Map<string, Set<string>>(); // projectId -> Set of event keys
  private readonly DEBOUNCE_MS = 2000; // Deduplicate events within 2 seconds

  /**
   * Start watching a container's /workspace directory
   */
  async startWatching(containerId: string, projectId: string): Promise<void> {
    if (this.watchers.has(projectId)) {
      console.log(`[FileWatcher] Already watching ${projectId}`);
      return;
    }

    const container = docker.getContainer(containerId);
    const lastCheck = new Map<string, number>();

    // Initial file scan
    try {
      const files = await this.getFileList(container);
      for (const file of files) {
        lastCheck.set(file.path, file.mtime);
      }
    } catch (e) {
      console.error(`[FileWatcher] Failed to get initial file list for ${projectId}:`, e);
    }

    // Start polling for changes
    const interval = setInterval(async () => {
      try {
        const files = await this.getFileList(container);
        const currentFiles = new Map<string, number>();
        const changes: FileChangeEvent[] = [];

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

        // Emit changes (after deduplication)
        if (changes.length > 0) {
          const dedupedChanges = this.deduplicateEvents(projectId, changes);
          if (dedupedChanges.length > 0) {
            console.log(`[FileWatcher] ${projectId}: ${dedupedChanges.length} file changes detected (${changes.length - dedupedChanges.length} duplicates filtered)`);
            this.emit('changes', { projectId, changes: dedupedChanges });
          }
        }
      } catch (e) {
        // Container might be stopped, ignore errors
      }
    }, this.pollInterval);

    this.watchers.set(projectId, { interval, lastCheck });
    console.log(`[FileWatcher] Started watching ${projectId}`);
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
      console.log(`[FileWatcher] Stopped watching ${projectId}`);
    }
  }

  /**
   * Deduplicate file change events to prevent infinite loops
   * Same file+event type should not trigger multiple times within DEBOUNCE_MS
   */
  private deduplicateEvents(projectId: string, changes: FileChangeEvent[]): FileChangeEvent[] {
    if (!this.recentEvents.has(projectId)) {
      this.recentEvents.set(projectId, new Set());
    }

    const recentSet = this.recentEvents.get(projectId)!;
    const dedupedChanges: FileChangeEvent[] = [];

    for (const change of changes) {
      const eventKey = `${change.type}:${change.path}`;

      if (!recentSet.has(eventKey)) {
        // New event, add it
        dedupedChanges.push(change);
        recentSet.add(eventKey);

        // Remove from set after debounce period
        setTimeout(() => {
          recentSet.delete(eventKey);
        }, this.DEBOUNCE_MS);
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
