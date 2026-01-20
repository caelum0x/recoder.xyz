/**
 * 'recoder web watch' command
 * Live sync - watch for local changes and sync to web in real-time
 */

import type { CommandModule } from 'yargs';
import path from 'node:path';
import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import { RecoderWebService } from '../../services/RecoderWebService.js';
import { RecoderAuthService } from '../../services/RecoderAuthService.js';

interface WatchArgs {
  urlId?: string;
  directory?: string;
  'push-only'?: boolean;
  'pull-only'?: boolean;
  interval?: number;
}

const DOCKER_BACKEND_URL = process.env['RECODER_DOCKER_URL'] || 'https://docker.recoder.xyz';

// Directories and files to ignore
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.vercel',
  '.cache',
  'coverage',
  '__pycache__',
]);

const IGNORED_FILES = new Set([
  '.DS_Store',
  '.env',
  '.env.local',
  '.env.production',
  '.recoder-web',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
]);

// Track pending changes
interface PendingChange {
  path: string;
  type: 'add' | 'change' | 'unlink';
  timestamp: number;
}

export const watchCommand: CommandModule<{}, WatchArgs> = {
  command: 'watch [urlId]',
  describe: 'Live sync - watch for changes and sync to web in real-time',
  builder: (yargs) =>
    yargs
      .positional('urlId', {
        type: 'string',
        description: 'Project URL ID (optional, will read from .recoder-web if present)',
      })
      .option('directory', {
        type: 'string',
        alias: 'd',
        description: 'Directory to watch (defaults to current directory)',
        default: process.cwd(),
      })
      .option('push-only', {
        type: 'boolean',
        description: 'Only push local changes to web (no pull)',
        default: false,
      })
      .option('pull-only', {
        type: 'boolean',
        description: 'Only pull web changes to local (no push)',
        default: false,
      })
      .option('interval', {
        type: 'number',
        alias: 'i',
        description: 'Debounce interval in milliseconds',
        default: 500,
      })
      .check((argv) => {
        if (argv['push-only'] && argv['pull-only']) {
          throw new Error('Cannot use both --push-only and --pull-only');
        }
        return true;
      }),
  handler: async (argv) => {
    const webService = new RecoderWebService();
    const authService = new RecoderAuthService();

    try {
      // Check authentication
      const isAuth = await authService.isAuthenticated();
      if (!isAuth) {
        console.error('Not authenticated');
        console.log('Run: recoder auth login');
        process.exit(1);
      }

      const targetDir = path.resolve(argv.directory || process.cwd());
      let urlId = argv.urlId;

      // Try to read .recoder-web metadata if no urlId provided
      if (!urlId) {
        try {
          const metadataPath = path.join(targetDir, '.recoder-web');
          const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
          urlId = metadata.urlId || metadata.projectId;
          console.log(`Found project ID from .recoder-web: ${urlId}`);
        } catch {
          console.error('No project ID provided and no .recoder-web file found');
          console.log('Usage: recoder web watch <urlId>');
          console.log('   Or run from a linked directory (use recoder web link first)');
          process.exit(1);
        }
      }

      // Get token
      const token = await authService.getAccessToken();
      if (!token) {
        console.error('Failed to get access token');
        process.exit(1);
      }

      // Generate a unique client ID for this watch session
      const clientId = `cli-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      console.log('\n' + '='.repeat(60));
      console.log('             RECODER LIVE SYNC');
      console.log('='.repeat(60));
      console.log(`Project: ${urlId}`);
      console.log(`Directory: ${targetDir}`);
      console.log(`Mode: ${argv['push-only'] ? 'Push only' : argv['pull-only'] ? 'Pull only' : 'Bidirectional'}`);
      console.log(`Client ID: ${clientId.substring(0, 16)}...`);
      console.log('='.repeat(60));
      console.log('\nWatching for changes... (Press Ctrl+C to stop)\n');

      // Track pending changes with debouncing
      const pendingChanges = new Map<string, PendingChange>();
      let syncTimeout: NodeJS.Timeout | null = null;

      // Function to sync pending changes
      const syncPendingChanges = async () => {
        if (pendingChanges.size === 0) return;

        const changes = Array.from(pendingChanges.values());
        pendingChanges.clear();

        console.log(`\nSyncing ${changes.length} changes...`);

        try {
          // Group by type
          const added: string[] = [];
          const modified: string[] = [];
          const deleted: string[] = [];

          for (const change of changes) {
            if (change.type === 'unlink') {
              deleted.push(change.path);
            } else if (change.type === 'add') {
              added.push(change.path);
            } else {
              modified.push(change.path);
            }
          }

          // Read file contents for added and modified files
          const files: Record<string, string> = {};
          for (const filePath of [...added, ...modified]) {
            try {
              const fullPath = path.join(targetDir, filePath);
              const content = await fs.readFile(fullPath, 'utf-8');
              files[filePath] = content;
            } catch {
              // File might have been deleted since we recorded the change
            }
          }

          // Push to backend
          const response = await fetch(`${DOCKER_BACKEND_URL}/api/sync/${urlId}/push`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              files,
              clientId,
            }),
          });

          if (response.ok) {
            const data = await response.json() as { applied: { added: number; modified: number; deleted: number } };
            const { applied } = data;
            const total = applied.added + applied.modified + applied.deleted;

            if (total > 0) {
              const parts = [];
              if (applied.added > 0) parts.push(`+${applied.added}`);
              if (applied.modified > 0) parts.push(`~${applied.modified}`);
              if (applied.deleted > 0) parts.push(`-${applied.deleted}`);

              console.log(`  Synced: ${parts.join(', ')} files`);
            }
          } else {
            const error = await response.json().catch(() => ({ error: 'Unknown error' })) as { error: string };
            console.error(`  Sync failed: ${error.error}`);

            // If container not found, try to push via web API
            if (error.error?.includes('Container not found')) {
              console.log('  Container not running. Pushing via web API...');
              await webService.uploadProject(urlId!, files);
              console.log('  Uploaded to web API');
            }
          }
        } catch (error: any) {
          console.error(`  Sync error: ${error.message}`);
        }
      };

      // Schedule sync with debouncing
      const schedulSync = () => {
        if (syncTimeout) {
          clearTimeout(syncTimeout);
        }
        syncTimeout = setTimeout(syncPendingChanges, argv.interval);
      };

      // Check if a path should be ignored
      const shouldIgnore = (filePath: string): boolean => {
        const parts = filePath.split(path.sep);

        // Check if any parent directory is ignored
        for (const part of parts) {
          if (IGNORED_DIRS.has(part)) {
            return true;
          }
        }

        // Check if file itself is ignored
        const fileName = path.basename(filePath);
        if (IGNORED_FILES.has(fileName)) {
          return true;
        }

        return false;
      };

      // Get relative path from target directory
      const getRelativePath = (fullPath: string): string => {
        return path.relative(targetDir, fullPath);
      };

      // Set up file watcher
      // Using recursive watch (works on macOS and Windows, limited on Linux)
      const watcher = watch(targetDir, { recursive: true }, async (eventType, filename) => {
        if (!filename) return;
        if (argv['pull-only']) return;

        const relativePath = filename.toString().replace(/\\/g, '/');

        if (shouldIgnore(relativePath)) {
          return;
        }

        const fullPath = path.join(targetDir, relativePath);

        try {
          const stats = await fs.stat(fullPath);

          if (stats.isDirectory()) {
            return; // Skip directory events
          }

          // Determine change type
          let changeType: 'add' | 'change' | 'unlink' = 'change';

          // Check if this is a new file
          const existingChange = pendingChanges.get(relativePath);
          if (!existingChange) {
            // Try to determine if it's new or modified
            // This is a heuristic - if file was created in last 100ms, consider it new
            const mtime = stats.mtimeMs;
            const ctime = stats.ctimeMs;
            if (Math.abs(mtime - ctime) < 100) {
              changeType = 'add';
            }
          }

          pendingChanges.set(relativePath, {
            path: relativePath,
            type: changeType,
            timestamp: Date.now(),
          });

          const icon = changeType === 'add' ? '+' : '~';
          console.log(`  ${icon} ${relativePath}`);

          schedulSync();
        } catch (error: any) {
          // File was deleted
          if (error.code === 'ENOENT') {
            pendingChanges.set(relativePath, {
              path: relativePath,
              type: 'unlink',
              timestamp: Date.now(),
            });

            console.log(`  - ${relativePath}`);
            schedulSync();
          }
        }
      });

      // Set up WebSocket for receiving remote changes (bidirectional sync)
      let ws: WebSocket | null = null;

      if (!argv['push-only']) {
        try {
          const wsUrl = DOCKER_BACKEND_URL.replace('http', 'ws');
          ws = new WebSocket(`${wsUrl}/cli-sync/${urlId}?clientId=${clientId}`);

          ws.onopen = () => {
            console.log('Connected to live sync server');
          };

          ws.onmessage = async (event) => {
            try {
              const data = JSON.parse(event.data.toString());

              if (data.type === 'file-change' && data.source !== 'cli') {
                // Remote change - apply to local
                const filePath = data.path;
                const content = data.content;
                const fullPath = path.join(targetDir, filePath);

                if (content !== undefined) {
                  // File created or modified
                  const dir = path.dirname(fullPath);
                  await fs.mkdir(dir, { recursive: true });
                  await fs.writeFile(fullPath, content, 'utf-8');
                  console.log(`  < ${filePath} (from web)`);
                } else {
                  // File deleted
                  try {
                    await fs.unlink(fullPath);
                    console.log(`  < ${filePath} (deleted from web)`);
                  } catch {
                    // File doesn't exist locally, that's fine
                  }
                }
              }

              if (data.type === 'connected') {
                console.log('Bidirectional sync enabled');
              }
            } catch {
              // Ignore parse errors
            }
          };

          ws.onerror = () => {
            console.log('WebSocket connection failed - running in push-only mode');
          };

          ws.onclose = () => {
            console.log('Disconnected from live sync server');
          };
        } catch {
          console.log('Could not connect to live sync server - running in push-only mode');
        }
      }

      // Handle graceful shutdown
      const cleanup = () => {
        console.log('\n\nStopping watch...');

        watcher.close();

        if (ws) {
          ws.close();
        }

        if (syncTimeout) {
          clearTimeout(syncTimeout);
        }

        // Sync any remaining changes
        if (pendingChanges.size > 0) {
          console.log('Syncing remaining changes...');
          syncPendingChanges().then(() => {
            console.log('Watch stopped.');
            process.exit(0);
          });
        } else {
          console.log('Watch stopped.');
          process.exit(0);
        }
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);

      // Keep the process running
      await new Promise(() => {});

    } catch (error: any) {
      console.error(`${error.message}`);
      process.exit(1);
    }
  },
};
