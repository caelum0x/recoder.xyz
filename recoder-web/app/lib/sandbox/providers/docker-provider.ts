/**
 * Docker Sandbox Provider
 * Provides sandbox functionality using the recoder-web Docker backend
 *
 * This provider connects to the recoder-web Docker backend which provides:
 * - Container management (create, delete, keep-alive)
 * - File operations (read, write, batch, list, export)
 * - Command execution (exec, terminal)
 * - Dev server management (Vite start/stop/restart)
 * - Snapshots (create, restore, diff)
 * - Git operations
 * - Package management (npm)
 * - LSP support
 * - MCP (Model Context Protocol)
 * - And more...
 */

import {
  SandboxProvider,
  type SandboxInfo,
  type CommandResult,
  type SandboxFile,
  type SandboxProviderConfig,
} from '../types';

export class DockerProvider extends SandboxProvider {
  private wsConnection: WebSocket | null = null;
  private apiEndpoint: string;
  private authToken: string | null;
  private projectId: string | null = null;

  constructor(config: SandboxProviderConfig = {}) {
    super(config);
    this.apiEndpoint = config.docker?.endpoint || 'http://localhost:4000';
    this.authToken = config.docker?.authToken || null;
    this.projectId = config.docker?.containerId || null;
  }

  /**
   * Create headers for API requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  /**
   * Get the project ID (required for most API calls)
   */
  private getProjectId(): string {
    if (!this.projectId) {
      throw new Error('No project ID set. Call createSandbox or setProjectId first.');
    }
    return this.projectId;
  }

  /**
   * Set the project ID for API calls
   */
  setProjectId(projectId: string): void {
    this.projectId = projectId;
    if (this.sandboxInfo) {
      this.sandboxInfo.sandboxId = projectId;
    }
  }

  async createSandbox(): Promise<SandboxInfo> {
    try {
      // Verify connection to Docker backend
      const healthResponse = await fetch(`${this.apiEndpoint}/health`, {
        headers: this.getHeaders(),
      });

      if (!healthResponse.ok) {
        throw new Error('Docker backend not available');
      }

      // If we have a project ID, try to create/connect to that container
      if (this.projectId) {
        const response = await fetch(`${this.apiEndpoint}/api/container`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            projectId: this.projectId,
          }),
        });

        if (response.ok) {
          const result = await response.json() as Record<string, unknown>;
          this.projectId = (result.projectId as string) || this.projectId;
        }
      }

      this.sandboxInfo = {
        sandboxId: this.projectId || 'default',
        url: this.apiEndpoint.replace('http://', 'https://').replace(':4000', ':5173'),
        provider: 'docker',
        createdAt: new Date(),
      };

      this.sandbox = true;
      return this.sandboxInfo;
    } catch (error) {
      console.error('[DockerProvider] Error creating sandbox:', error);
      throw error;
    }
  }

  async runCommand(command: string): Promise<CommandResult> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const projectId = this.getProjectId();

    try {
      const response = await fetch(`${this.apiEndpoint}/api/exec/${projectId}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ command }),
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          stdout: '',
          stderr: error,
          exitCode: 1,
          success: false,
        };
      }

      const result = await response.json() as Record<string, unknown>;

      return {
        stdout: (result.stdout as string) || (result.output as string) || '',
        stderr: (result.stderr as string) || '',
        exitCode: (result.exitCode as number) ?? ((result.success as boolean) ? 0 : 1),
        success: (result.success as boolean) ?? (result.exitCode as number) === 0,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Command failed';
      return {
        stdout: '',
        stderr: errorMessage,
        exitCode: 1,
        success: false,
      };
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const projectId = this.getProjectId();
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

    try {
      const response = await fetch(`${this.apiEndpoint}/api/file/${projectId}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          path: normalizedPath,
          content,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to write file: ${error}`);
      }

      this.existingFiles.add(normalizedPath);
    } catch (error) {
      console.error('[DockerProvider] Error writing file:', error);
      throw error;
    }
  }

  async writeFiles(files: SandboxFile[]): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const projectId = this.getProjectId();

    // Use batch endpoint for better performance
    try {
      const response = await fetch(`${this.apiEndpoint}/api/files/${projectId}/batch`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          files: files.map(f => ({
            path: f.path.startsWith('/') ? f.path.slice(1) : f.path,
            content: f.content,
          })),
        }),
      });

      if (!response.ok) {
        // Fall back to individual writes
        await Promise.all(
          files.map(async (file) => {
            await this.writeFile(file.path, file.content);
          })
        );
        return;
      }

      // Track all written files
      files.forEach(f => {
        const normalizedPath = f.path.startsWith('/') ? f.path.slice(1) : f.path;
        this.existingFiles.add(normalizedPath);
      });
    } catch (error) {
      console.error('[DockerProvider] Batch write failed, falling back:', error);
      // Fall back to individual writes
      await Promise.all(
        files.map(async (file) => {
          await this.writeFile(file.path, file.content);
        })
      );
    }
  }

  async readFile(path: string): Promise<string> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const projectId = this.getProjectId();
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

    try {
      const response = await fetch(
        `${this.apiEndpoint}/api/file/${projectId}?path=${encodeURIComponent(normalizedPath)}`,
        {
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to read file: ${error}`);
      }

      const result = await response.json() as Record<string, unknown>;
      return (result.content as string) || '';
    } catch (error) {
      console.error('[DockerProvider] Error reading file:', error);
      throw error;
    }
  }

  async listFiles(directory: string = '/'): Promise<string[]> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const projectId = this.getProjectId();

    try {
      const response = await fetch(
        `${this.apiEndpoint}/api/files/${projectId}?directory=${encodeURIComponent(directory)}`,
        {
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        return [];
      }

      const result = await response.json() as Record<string, unknown>;
      return (result.files as string[]) || (result.tree as string[]) || [];
    } catch (error) {
      console.error('[DockerProvider] Error listing files:', error);
      return [];
    }
  }

  async installPackages(packages: string[]): Promise<CommandResult> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const projectId = this.getProjectId();

    // Use the dedicated packages API endpoint
    try {
      const response = await fetch(`${this.apiEndpoint}/api/packages/${projectId}/install`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ packages }),
      });

      if (response.ok) {
        const result = await response.json() as Record<string, unknown>;
        return {
          stdout: (result.output as string) || (result.stdout as string) || 'Packages installed successfully',
          stderr: (result.stderr as string) || '',
          exitCode: (result.exitCode as number) ?? 0,
          success: (result.success as boolean) ?? true,
        };
      }
    } catch {
      // Fall back to command execution
    }

    // Fall back to running npm install command directly
    const packageList = packages.join(' ');
    return this.runCommand(`npm install ${packageList}`);
  }

  async setupViteApp(): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    // The Docker backend typically sets up the Vite app via starter templates
    // This is a fallback for manual setup

    // Create package.json
    const packageJson = {
      name: 'sandbox-app',
      version: '1.0.0',
      type: 'module',
      scripts: {
        dev: 'vite --host',
        build: 'vite build',
        preview: 'vite preview',
      },
      dependencies: {
        react: '^18.2.0',
        'react-dom': '^18.2.0',
      },
      devDependencies: {
        '@vitejs/plugin-react': '^4.0.0',
        vite: '^4.3.9',
        tailwindcss: '^3.3.0',
        postcss: '^8.4.31',
        autoprefixer: '^10.4.16',
      },
    };

    const files: SandboxFile[] = [
      { path: 'package.json', content: JSON.stringify(packageJson, null, 2) },
      {
        path: 'vite.config.js',
        content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    hmr: {
      clientPort: 443,
      protocol: 'wss'
    }
  }
})`,
      },
      {
        path: 'tailwind.config.js',
        content: `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`,
      },
      {
        path: 'postcss.config.js',
        content: `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`,
      },
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sandbox App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`,
      },
      {
        path: 'src/main.jsx',
        content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`,
      },
      {
        path: 'src/App.jsx',
        content: `function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="text-center max-w-2xl">
        <p className="text-lg text-gray-400">
          Docker Sandbox Ready<br/>
          Start building your React app with Vite and Tailwind CSS!
        </p>
      </div>
    </div>
  )
}

export default App`,
      },
      {
        path: 'src/index.css',
        content: `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background-color: rgb(17 24 39);
}`,
      },
    ];

    // Write all files in batch
    await this.writeFiles(files);

    // Install dependencies
    await this.installPackages([]);

    // Start Vite dev server
    await this.startDevServer();
  }

  /**
   * Start the dev server using the backend's dev-server API
   */
  async startDevServer(): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const projectId = this.getProjectId();

    try {
      const response = await fetch(`${this.apiEndpoint}/api/dev-server/start`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ projectId }),
      });

      if (!response.ok) {
        // Fall back to running npm run dev
        await this.runCommand('npm run dev &');
      }
    } catch {
      // Fall back to running npm run dev
      await this.runCommand('npm run dev &');
    }
  }

  /**
   * Stop the dev server
   */
  async stopDevServer(): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const projectId = this.getProjectId();

    try {
      await fetch(`${this.apiEndpoint}/api/dev-server/stop`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ projectId }),
      });
    } catch {
      // Fall back to killing Vite process
      await this.runCommand('pkill -f vite || true');
    }
  }

  async restartViteServer(): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const projectId = this.getProjectId();

    // Try using the backend's restart endpoint
    try {
      const response = await fetch(`${this.apiEndpoint}/api/dev-server/restart`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ projectId }),
      });

      if (response.ok) {
        return;
      }
    } catch {
      // Fall back to manual restart
    }

    // Manual restart
    await this.stopDevServer();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await this.startDevServer();
  }

  /**
   * Get dev server status
   */
  async getDevServerStatus(): Promise<{ running: boolean; port?: number; url?: string }> {
    if (!this.sandbox) {
      return { running: false };
    }

    const projectId = this.getProjectId();

    try {
      const response = await fetch(`${this.apiEndpoint}/api/dev-server/status/${projectId}`, {
        headers: this.getHeaders(),
      });

      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Ignore errors
    }

    return { running: false };
  }

  async getViteLogs(): Promise<string> {
    const result = await this.runCommand('cat /tmp/vite.log 2>/dev/null || echo "No logs available"');
    return result.stdout;
  }

  // =============================================================================
  // Snapshot Methods
  // =============================================================================

  /**
   * Create a snapshot of the current state
   */
  async createSnapshot(message?: string): Promise<{ snapshotId: string }> {
    const projectId = this.getProjectId();

    const response = await fetch(`${this.apiEndpoint}/api/snapshot/${projectId}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      throw new Error('Failed to create snapshot');
    }

    return response.json();
  }

  /**
   * List all snapshots
   */
  async listSnapshots(): Promise<Array<{ id: string; message?: string; createdAt: string }>> {
    const projectId = this.getProjectId();

    const response = await fetch(`${this.apiEndpoint}/api/snapshots/${projectId}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      return [];
    }

    const result = await response.json() as Record<string, unknown>;
    return (result.snapshots as Array<{ id: string; message?: string; createdAt: string }>) || [];
  }

  /**
   * Restore to a snapshot
   */
  async restoreSnapshot(snapshotId: string): Promise<void> {
    const projectId = this.getProjectId();

    const response = await fetch(`${this.apiEndpoint}/api/snapshot/${projectId}/restore`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ snapshotId }),
    });

    if (!response.ok) {
      throw new Error('Failed to restore snapshot');
    }
  }

  /**
   * Get diff from a snapshot
   */
  async getSnapshotDiff(snapshotId?: string): Promise<{ files: Array<{ path: string; status: string }> }> {
    const projectId = this.getProjectId();
    const url = snapshotId
      ? `${this.apiEndpoint}/api/snapshot/${projectId}/diff?snapshotId=${snapshotId}`
      : `${this.apiEndpoint}/api/snapshot/${projectId}/diff`;

    const response = await fetch(url, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      return { files: [] };
    }

    return response.json();
  }

  // =============================================================================
  // Git Methods
  // =============================================================================

  /**
   * Get git status
   */
  async getGitStatus(): Promise<{
    branch: string;
    clean: boolean;
    staged: string[];
    unstaged: string[];
    untracked: string[];
  }> {
    const projectId = this.getProjectId();

    const response = await fetch(`${this.apiEndpoint}/api/git/${projectId}/status`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get git status');
    }

    return response.json();
  }

  /**
   * Git commit
   */
  async gitCommit(message: string): Promise<void> {
    const projectId = this.getProjectId();

    const response = await fetch(`${this.apiEndpoint}/api/git/${projectId}/commit`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      throw new Error('Failed to commit');
    }
  }

  /**
   * Git stage files
   */
  async gitStage(files: string[]): Promise<void> {
    const projectId = this.getProjectId();

    const response = await fetch(`${this.apiEndpoint}/api/git/${projectId}/stage`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ files }),
    });

    if (!response.ok) {
      throw new Error('Failed to stage files');
    }
  }

  // =============================================================================
  // Search Methods
  // =============================================================================

  /**
   * Search files in the project
   */
  async searchFiles(
    query: string,
    options?: { regex?: boolean; caseSensitive?: boolean; filePattern?: string }
  ): Promise<Array<{ file: string; line: number; content: string }>> {
    const projectId = this.getProjectId();

    const response = await fetch(`${this.apiEndpoint}/api/search/${projectId}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ query, ...options }),
    });

    if (!response.ok) {
      return [];
    }

    const result = await response.json() as Record<string, unknown>;
    return (result.matches as Array<{ file: string; line: number; content: string }>) || [];
  }

  /**
   * Search and replace in files
   */
  async searchAndReplace(
    search: string,
    replace: string,
    options?: { regex?: boolean; caseSensitive?: boolean; filePattern?: string }
  ): Promise<{ replacedCount: number; files: string[] }> {
    const projectId = this.getProjectId();

    const response = await fetch(`${this.apiEndpoint}/api/replace/${projectId}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ search, replace, ...options }),
    });

    if (!response.ok) {
      throw new Error('Failed to search and replace');
    }

    return response.json();
  }

  // =============================================================================
  // MCP Methods
  // =============================================================================

  /**
   * Get available MCP tools
   */
  async getMcpTools(): Promise<Array<{ name: string; description: string; inputSchema: unknown }>> {
    const projectId = this.getProjectId();

    const response = await fetch(`${this.apiEndpoint}/api/mcp/${projectId}/tools`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      return [];
    }

    const result = await response.json() as Record<string, unknown>;
    return (result.tools as Array<{ name: string; description: string; inputSchema: unknown }>) || [];
  }

  /**
   * Call an MCP tool
   */
  async callMcpTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ result: unknown; error?: string }> {
    const projectId = this.getProjectId();

    const response = await fetch(`${this.apiEndpoint}/api/mcp/${projectId}/call`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ tool: toolName, arguments: args }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { result: null, error };
    }

    return response.json();
  }

  // =============================================================================
  // Core Provider Methods
  // =============================================================================

  getSandboxUrl(): string | null {
    return this.sandboxInfo?.url || null;
  }

  getSandboxInfo(): SandboxInfo | null {
    return this.sandboxInfo;
  }

  async terminate(): Promise<void> {
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }

    // Try to stop the dev server
    if (this.sandbox && this.projectId) {
      try {
        await this.stopDevServer();
      } catch {
        // Ignore errors during termination
      }

      // Optionally delete the container
      try {
        await fetch(`${this.apiEndpoint}/api/container/${this.projectId}`, {
          method: 'DELETE',
          headers: this.getHeaders(),
        });
      } catch {
        // Ignore errors during termination
      }
    }

    this.sandbox = null;
    this.sandboxInfo = null;
    this.projectId = null;
    this.existingFiles.clear();
  }

  isAlive(): boolean {
    return !!this.sandbox;
  }

  async reconnect(sandboxId: string): Promise<boolean> {
    try {
      // Verify the backend is available
      const response = await fetch(`${this.apiEndpoint}/health`, {
        headers: this.getHeaders(),
      });

      if (response.ok) {
        this.projectId = sandboxId;
        this.sandboxInfo = {
          sandboxId,
          url: this.apiEndpoint.replace('http://', 'https://').replace(':4000', ':5173'),
          provider: 'docker',
          createdAt: new Date(),
        };
        this.sandbox = true;
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  // =============================================================================
  // Keep-Alive
  // =============================================================================

  /**
   * Send keep-alive signal to prevent container termination
   */
  async keepAlive(): Promise<void> {
    if (!this.sandbox || !this.projectId) {
      return;
    }

    try {
      await fetch(`${this.apiEndpoint}/api/keep-alive/${this.projectId}`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
    } catch {
      // Ignore errors
    }
  }

  /**
   * Export project as zip
   */
  async exportProject(): Promise<Blob> {
    const projectId = this.getProjectId();

    const response = await fetch(`${this.apiEndpoint}/api/export/${projectId}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to export project');
    }

    return response.blob();
  }

  /**
   * Delete a file
   */
  async deleteFile(path: string): Promise<void> {
    const projectId = this.getProjectId();
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

    const response = await fetch(`${this.apiEndpoint}/api/file/${projectId}?path=${encodeURIComponent(normalizedPath)}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to delete file');
    }

    this.existingFiles.delete(normalizedPath);
  }

  /**
   * Rename a file
   */
  async renameFile(oldPath: string, newPath: string): Promise<void> {
    const projectId = this.getProjectId();
    const normalizedOldPath = oldPath.startsWith('/') ? oldPath.slice(1) : oldPath;
    const normalizedNewPath = newPath.startsWith('/') ? newPath.slice(1) : newPath;

    const response = await fetch(`${this.apiEndpoint}/api/file/${projectId}/rename`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({
        oldPath: normalizedOldPath,
        newPath: normalizedNewPath,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to rename file');
    }

    this.existingFiles.delete(normalizedOldPath);
    this.existingFiles.add(normalizedNewPath);
  }

  /**
   * Create a folder
   */
  async createFolder(path: string): Promise<void> {
    const projectId = this.getProjectId();
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

    const response = await fetch(`${this.apiEndpoint}/api/folder/${projectId}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ path: normalizedPath }),
    });

    if (!response.ok) {
      throw new Error('Failed to create folder');
    }
  }
}
