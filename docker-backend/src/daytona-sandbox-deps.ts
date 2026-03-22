/**
 * Daytona-backed SandboxDependencies adapter.
 *
 * Implements the SandboxDependencies interface from the public API
 * using the DaytonaClient instead of raw Docker/Dockerode.
 *
 * This gives the public sandbox API access to Daytona sandboxes:
 * - Isolated containers with auto-stop/archive
 * - File system, exec, preview URLs
 * - Consistent with the Python backend's Daytona usage
 */

import { getDaytonaClient, isDaytonaConfigured } from './daytona-client.js';
import type { SandboxDependencies } from './public-api/routes/sandboxes.js';
import { createLogger } from './logger.js';

const logger = createLogger('daytona-sandbox-deps');

// Map from our sandbox IDs to Daytona sandbox IDs
const sandboxIdMap = new Map<string, string>();

/**
 * Create SandboxDependencies backed by Daytona.
 * Falls back to null if Daytona is not configured.
 */
export function createDaytonaSandboxDeps(): SandboxDependencies | null {
  if (!isDaytonaConfigured()) {
    logger.warn('Daytona not configured — sandbox API will use Docker fallback');
    return null;
  }

  const client = getDaytonaClient();
  logger.info('Daytona sandbox dependencies initialized');

  return {
    async createContainer(options) {
      const sandbox = await client.createSandbox({
        snapshot: 'daytonaio/sandbox:0.5.0-slim',
        labels: {
          projectId: options.projectId,
          template: options.template,
          source: 'docker-backend-public-api',
        },
        envVars: options.env,
        autoStopInterval: 60,
        autoArchiveInterval: 120,
        public: true,
      });

      // Store mapping
      sandboxIdMap.set(sandbox.id, sandbox.id);

      logger.info({ sandboxId: sandbox.id, projectId: options.projectId }, 'Daytona sandbox created for public API');

      return {
        containerId: sandbox.id,
        port: 3000, // Default preview port
      };
    },

    async startContainer(containerId: string) {
      await client.startSandbox(containerId);
    },

    async stopContainer(containerId: string) {
      await client.stopSandbox(containerId);
    },

    async deleteContainer(containerId: string) {
      await client.deleteSandbox(containerId);
      sandboxIdMap.delete(containerId);
    },

    async execInContainer(containerId: string, command: string, options?) {
      const startTime = Date.now();
      try {
        const result = await client.execCommand(containerId, command, {
          cwd: options?.cwd,
          timeoutSecs: options?.timeoutMs ? Math.ceil(options.timeoutMs / 1000) : 30,
        });

        return {
          exitCode: result.exitCode,
          stdout: result.output,
          stderr: '',
          executionTimeMs: Date.now() - startTime,
          timedOut: false,
          killed: false,
        };
      } catch (err) {
        const isTimeout = (err as Error).message?.includes('abort');
        return {
          exitCode: isTimeout ? 124 : 1,
          stdout: '',
          stderr: (err as Error).message,
          executionTimeMs: Date.now() - startTime,
          timedOut: isTimeout,
          killed: isTimeout,
        };
      }
    },

    async writeFile(containerId: string, path: string, content: string) {
      await client.uploadFile(containerId, path, content);
    },

    async readFile(containerId: string, path: string) {
      const content = await client.downloadFile(containerId, path);
      return {
        content,
        size: Buffer.byteLength(content, 'utf-8'),
        mimeType: 'text/plain',
      };
    },

    async listFiles(containerId: string, path: string) {
      const files = await client.listFiles(containerId, path);
      return files.map((f: any) => ({
        name: f.name,
        path: `${path}/${f.name}`.replace(/\/\//g, '/'),
        size: f.size || 0,
        isDirectory: f.isDir || false,
        mimeType: f.isDir ? 'inode/directory' : 'application/octet-stream',
        modifiedAt: f.modTime || new Date().toISOString(),
      }));
    },

    async deleteFile(containerId: string, path: string) {
      await client.deleteFile(containerId, path);
    },

    getPreviewUrl(port: number) {
      // Daytona preview URLs use the sandbox ID
      // This is called per-sandbox, but we don't have the sandbox ID here
      // The caller should use client.getPreviewUrl(sandboxId, port) instead
      return `https://${port}-sandbox.sandbox.recoder.xyz`;
    },

    getTerminalUrl(sandboxId: string) {
      return `wss://sandbox.recoder.xyz/terminal/${sandboxId}`;
    },
  };
}
