import Docker from 'dockerode';
import http from 'http';
import { autoRestoreManager } from './auto-restore.js';

const docker = new Docker();

interface DevServerInfo {
  projectId: string;
  pid?: number;
  port?: number;
  framework: string;
  startedAt: number;
  status: 'starting' | 'running' | 'stopped' | 'error';
}

/**
 * Dev Server Manager - handles background dev server processes
 * Keeps dev server logs separate from interactive terminals
 */
export class DevServerManager {
  private servers = new Map<string, DevServerInfo>();

  /**
   * Start a dev server in background for a project
   */
  async start(
    containerId: string, 
    projectId: string, 
    framework: string = 'vite',
    ports: number[]
  ): Promise<{ ready: boolean; port?: number; logs?: string }> {
    const container = docker.getContainer(containerId);
    const command = this.getStartCommand(framework);

    console.log(`[DevServer] Starting ${framework} for project ${projectId}`);

    // Kill any existing dev server first
    try {
      await this.execCommand(container, `pkill -f "npm run dev|vite|next dev|bun run dev" || true`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch {}

    // Ensure workspace directory exists
    await this.execCommand(container, 'mkdir -p /workspace');

    // Start the dev server using setsid for proper daemonization
    // BROWSER=none prevents Vite from trying to open xdg-open (which doesn't exist in Docker)
    const startScript = `cd /workspace && BROWSER=none exec setsid ${command} > /tmp/dev.log 2>&1 < /dev/null`;

    const exec = await container.exec({
      Cmd: ['/bin/bash', '-c', startScript],
      AttachStdout: false,
      AttachStderr: false,
      Tty: false,
    });

    await exec.start({ Detach: true });

    this.servers.set(projectId, {
      projectId,
      framework,
      startedAt: Date.now(),
      status: 'starting',
    });

    console.log(`[DevServer] Process started for ${projectId}, waiting for ready...`);

    // Wait for server to be ready
    const healthCheck = await this.waitForReady(ports, 30000);

    if (healthCheck.ready) {
      const info = this.servers.get(projectId);
      if (info) {
        info.status = 'running';
        info.port = healthCheck.port;
      }
      console.log(`[DevServer] ✅ Ready on port ${healthCheck.port}`);
      return { ready: true, port: healthCheck.port };
    }

    // Check if there's an error
    const logs = await this.getLogs(containerId, projectId, 50);
    console.log(`[DevServer] ⚠️ Not ready yet, logs:\n${logs}`);

    return { ready: false, logs };
  }

  /**
   * Stop the dev server for a project
   */
  async stop(containerId: string, projectId: string): Promise<boolean> {
    const container = docker.getContainer(containerId);
    
    try {
      await this.execCommand(container, `pkill -f "npm run dev|vite|next dev|bun run dev" || true`);
      this.servers.delete(projectId);
      console.log(`[DevServer] Stopped for ${projectId}`);
      return true;
    } catch (error: any) {
      console.error(`[DevServer] Failed to stop: ${error.message}`);
      return false;
    }
  }

  /**
   * Restart the dev server
   */
  async restart(containerId: string, projectId: string, ports: number[]): Promise<{ ready: boolean; port?: number }> {
    const info = this.servers.get(projectId);
    const framework = info?.framework || 'vite';
    
    await this.stop(containerId, projectId);
    await new Promise(resolve => setTimeout(resolve, 1000));
    return this.start(containerId, projectId, framework, ports);
  }

  /**
   * Get dev server logs
   */
  async getLogs(containerId: string, projectId: string, tail: number = 100): Promise<string> {
    const container = docker.getContainer(containerId);
    
    try {
      const logs = await this.execCommand(container, `tail -n ${tail} /tmp/dev.log 2>/dev/null || echo "No logs found"`);
      
      // Check for errors and trigger auto-restore if needed
      const { hasError, errors } = autoRestoreManager.detectErrors(logs);
      if (hasError) {
        console.log(`[DevServer] Errors detected in ${projectId}:`, errors);
        
        const result = await autoRestoreManager.attemptRestore(containerId, projectId);
        if (result.success) {
          console.log(`[DevServer] Auto-restored ${projectId} to ${result.restoredTo}`);
        }
      } else {
        // Reset error count on successful build
        autoRestoreManager.resetErrors(projectId);
      }
      
      return logs;
    } catch {
      return 'Failed to read logs';
    }
  }

  /**
   * Stream logs via WebSocket
   */
  async streamLogs(containerId: string, projectId: string, onData: (data: string) => void): Promise<() => void> {
    const container = docker.getContainer(containerId);
    let running = true;
    let lastPosition = 0;

    const poll = async () => {
      while (running) {
        try {
          const logs = await this.execCommand(container, `tail -c +${lastPosition + 1} /tmp/dev.log 2>/dev/null || true`);
          if (logs.length > 0) {
            lastPosition += logs.length;
            onData(logs);
          }
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    };

    poll();

    return () => { running = false; };
  }

  /**
   * Get status of dev server
   */
  getStatus(projectId: string): DevServerInfo | undefined {
    return this.servers.get(projectId);
  }

  /**
   * Check if dev server is running
   */
  isRunning(projectId: string): boolean {
    const info = this.servers.get(projectId);
    return info?.status === 'running';
  }

  private getStartCommand(framework: string): string {
    // Prefer bun for 10x faster startup
    const commands: Record<string, string> = {
      vite: 'bun run dev -- --host 0.0.0.0 2>/dev/null || npm run dev -- --host 0.0.0.0',
      next: 'bun run dev 2>/dev/null || npm run dev',
      react: 'bun start 2>/dev/null || npm start',
      vue: 'bun run serve 2>/dev/null || npm run serve',
      bun: 'bun run dev',
      expo: 'bunx expo start --web 2>/dev/null || npx expo start --web',
    };
    return commands[framework] || 'bun run dev -- --host 0.0.0.0 2>/dev/null || npm run dev -- --host 0.0.0.0';
  }

  private async waitForReady(ports: number[], maxWaitMs: number = 60000): Promise<{ ready: boolean; port?: number }> {
    const startTime = Date.now();
    const checkInterval = 1000;

    console.log(`[DevServer] Waiting for ready on ports: ${ports.join(', ')}`);

    while (Date.now() - startTime < maxWaitMs) {
      for (const port of ports) {
        try {
          const isReady = await new Promise<boolean>((resolve) => {
            const req = http.get(`http://127.0.0.1:${port}`, { timeout: 2000 }, (res) => {
              resolve(res.statusCode !== undefined && res.statusCode < 500);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
          });

          if (isReady) {
            return { ready: true, port };
          }
        } catch {}
      }

      const elapsed = Date.now() - startTime;
      if (elapsed % 5000 < checkInterval) {
        console.log(`[DevServer] Still waiting... (${Math.round(elapsed / 1000)}s elapsed)`);
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    return { ready: false };
  }

  private async execCommand(container: Docker.Container, cmd: string): Promise<string> {
    const exec = await container.exec({
      Cmd: ['/bin/bash', '-c', cmd],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({});
    const output = await new Promise<string>((resolve, reject) => {
      let out = '';
      stream.on('data', (chunk: Buffer) => {
        out += chunk.slice(8).toString();
      });
      stream.on('end', () => resolve(out.trim()));
      stream.on('error', reject);
    });

    return output;
  }
}

// Export singleton instance
export const devServerManager = new DevServerManager();
