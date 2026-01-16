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

        // Emit changes
        if (changes.length > 0) {
          console.log(`[FileWatcher] ${projectId}: ${changes.length} file changes detected`);
          this.emit('changes', { projectId, changes });
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
      console.log(`[FileWatcher] Stopped watching ${projectId}`);
    }
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
