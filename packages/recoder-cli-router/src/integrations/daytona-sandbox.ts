/**
 * Daytona Sandbox Executor for Recoder CLI Router
 *
 * Provides isolated code execution via the Daytona sandbox API.
 * Supports Python, Node.js, and shell commands in secure containers.
 *
 * Configuration via environment variables:
 *   RECODER_DAYTONA_URL - Daytona API base URL (default: http://localhost:3900/api)
 *   DAYTONA_API_KEY     - API key for Daytona authentication
 */

export interface SandboxConfig {
  apiUrl: string;
  apiKey: string;
  defaultImage: string;
  autoStopInterval: number;
  startupWaitMs: number;
}

export interface SandboxInstance {
  id: string;
  state: string;
  createdAt: string;
}

export interface SandboxExecResult {
  exitCode: number;
  output: string;
  error?: string;
  sandboxId: string;
  executionTimeMs: number;
}

export interface SandboxFileResult {
  success: boolean;
  path: string;
  content?: string;
  error?: string;
}

export class DaytonaSandboxExecutor {
  private config: SandboxConfig;
  private activeSandboxes: Map<string, SandboxInstance> = new Map();

  constructor(config?: Partial<SandboxConfig>) {
    this.config = {
      apiUrl: config?.apiUrl || process.env.RECODER_DAYTONA_URL || 'http://localhost:3900/api',
      apiKey: config?.apiKey || process.env.DAYTONA_API_KEY || '',
      defaultImage: config?.defaultImage || 'daytonaio/sandbox:0.5.0-slim',
      autoStopInterval: config?.autoStopInterval ?? 5,
      startupWaitMs: config?.startupWaitMs ?? 8000,
    };
  }

  /**
   * Check if the Daytona executor is properly configured
   */
  isConfigured(): boolean {
    return this.config.apiKey.length > 0;
  }

  /**
   * Get authorization headers for Daytona API
   */
  private getHeaders(contentType = true): Record<string, string> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.apiKey}`,
    };
    if (contentType) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  }

  /**
   * Get the toolbox API base URL from the sandbox API URL
   */
  private getToolboxBaseUrl(): string {
    return this.config.apiUrl.replace(/\/api\/?$/, '') + '/api/toolbox';
  }

  /**
   * Create a new sandbox instance
   */
  async createSandbox(image?: string): Promise<SandboxInstance> {
    if (!this.isConfigured()) {
      throw new Error('Daytona sandbox not configured: DAYTONA_API_KEY is required');
    }

    const response = await fetch(`${this.config.apiUrl}/sandbox`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        snapshot: image || this.config.defaultImage,
        public: true,
        autoStopInterval: this.config.autoStopInterval,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Failed to create sandbox: HTTP ${response.status} - ${text.slice(0, 200)}`);
    }

    const data = await response.json() as { id?: string; state?: string };
    if (!data.id) {
      throw new Error(`Failed to create sandbox: no ID returned - ${JSON.stringify(data).slice(0, 200)}`);
    }

    const sandbox: SandboxInstance = {
      id: data.id,
      state: data.state || 'creating',
      createdAt: new Date().toISOString(),
    };

    this.activeSandboxes.set(sandbox.id, sandbox);
    return sandbox;
  }

  /**
   * Wait for a sandbox to be ready for command execution
   */
  private async waitForReady(sandboxId: string): Promise<void> {
    const maxWait = this.config.startupWaitMs;
    const pollInterval = 1000;
    const deadline = Date.now() + maxWait;

    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${this.config.apiUrl}/sandbox/${sandboxId}`, {
          method: 'GET',
          headers: this.getHeaders(false),
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const data = await response.json() as { state?: string };
          if (data.state === 'started' || data.state === 'running') {
            return;
          }
        }
      } catch {
        // Ignore transient errors during startup polling
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Final fallback: just wait the remaining time
    const remaining = deadline - Date.now();
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining));
    }
  }

  /**
   * Execute a command in a sandbox
   */
  async executeCommand(sandboxId: string, command: string, timeoutMs = 60000): Promise<SandboxExecResult> {
    if (!this.isConfigured()) {
      throw new Error('Daytona sandbox not configured: DAYTONA_API_KEY is required');
    }

    const startTime = Date.now();
    const toolboxUrl = `${this.getToolboxBaseUrl()}/${sandboxId}/toolbox/process/execute`;

    const response = await fetch(toolboxUrl, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ command }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Command execution failed: HTTP ${response.status} - ${text.slice(0, 200)}`);
    }

    const data = await response.json() as { exitCode?: number; result?: string; error?: string };
    const executionTimeMs = Date.now() - startTime;

    return {
      exitCode: data.exitCode ?? -1,
      output: data.result || '',
      error: data.error,
      sandboxId,
      executionTimeMs,
    };
  }

  /**
   * Write a file into a sandbox
   */
  async writeFile(sandboxId: string, filePath: string, content: string): Promise<SandboxFileResult> {
    if (!this.isConfigured()) {
      throw new Error('Daytona sandbox not configured: DAYTONA_API_KEY is required');
    }

    // Use command execution to write file via heredoc
    const command = `mkdir -p $(dirname '${filePath}') && cat > '${filePath}' << 'RECODER_EOF'\n${content}\nRECODER_EOF`;

    try {
      const result = await this.executeCommand(sandboxId, command);
      return {
        success: result.exitCode === 0,
        path: filePath,
        error: result.exitCode !== 0 ? result.output : undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        path: filePath,
        error: error.message,
      };
    }
  }

  /**
   * Read a file from a sandbox
   */
  async readFile(sandboxId: string, filePath: string): Promise<SandboxFileResult> {
    if (!this.isConfigured()) {
      throw new Error('Daytona sandbox not configured: DAYTONA_API_KEY is required');
    }

    try {
      const result = await this.executeCommand(sandboxId, `cat '${filePath}'`);
      return {
        success: result.exitCode === 0,
        path: filePath,
        content: result.exitCode === 0 ? result.output : undefined,
        error: result.exitCode !== 0 ? result.output : undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        path: filePath,
        error: error.message,
      };
    }
  }

  /**
   * Destroy a sandbox and clean up resources
   */
  async destroySandbox(sandboxId: string): Promise<void> {
    try {
      await fetch(`${this.config.apiUrl}/sandbox/${sandboxId}`, {
        method: 'DELETE',
        headers: this.getHeaders(false),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      // Best-effort cleanup
    }
    this.activeSandboxes.delete(sandboxId);
  }

  /**
   * Run a command in a fresh ephemeral sandbox (create, execute, destroy).
   * This is the primary high-level API for one-shot execution.
   */
  async run(command: string, options?: { image?: string; timeoutMs?: number }): Promise<SandboxExecResult> {
    if (!this.isConfigured()) {
      throw new Error('Daytona sandbox not configured. Set DAYTONA_API_KEY environment variable.');
    }

    let sandbox: SandboxInstance | null = null;

    try {
      // Create sandbox
      sandbox = await this.createSandbox(options?.image);

      // Wait for it to become ready
      await this.waitForReady(sandbox.id);

      // Execute command
      const result = await this.executeCommand(sandbox.id, command, options?.timeoutMs);
      return result;

    } finally {
      // Always clean up
      if (sandbox) {
        await this.destroySandbox(sandbox.id);
      }
    }
  }

  /**
   * Run a multi-step script: write files, install deps, execute
   */
  async runScript(steps: {
    files?: Array<{ path: string; content: string }>;
    installCommand?: string;
    runCommand: string;
    image?: string;
    timeoutMs?: number;
  }): Promise<SandboxExecResult> {
    if (!this.isConfigured()) {
      throw new Error('Daytona sandbox not configured. Set DAYTONA_API_KEY environment variable.');
    }

    let sandbox: SandboxInstance | null = null;

    try {
      sandbox = await this.createSandbox(steps.image);
      await this.waitForReady(sandbox.id);

      // Write files if provided
      if (steps.files) {
        for (const file of steps.files) {
          const writeResult = await this.writeFile(sandbox.id, file.path, file.content);
          if (!writeResult.success) {
            return {
              exitCode: 1,
              output: `Failed to write file ${file.path}: ${writeResult.error}`,
              sandboxId: sandbox.id,
              executionTimeMs: 0,
            };
          }
        }
      }

      // Install dependencies if specified
      if (steps.installCommand) {
        const installResult = await this.executeCommand(sandbox.id, steps.installCommand, steps.timeoutMs);
        if (installResult.exitCode !== 0) {
          return {
            exitCode: installResult.exitCode,
            output: `Install failed: ${installResult.output}`,
            error: installResult.error,
            sandboxId: sandbox.id,
            executionTimeMs: installResult.executionTimeMs,
          };
        }
      }

      // Run the main command
      return await this.executeCommand(sandbox.id, steps.runCommand, steps.timeoutMs);

    } finally {
      if (sandbox) {
        await this.destroySandbox(sandbox.id);
      }
    }
  }

  /**
   * List all active sandboxes tracked by this executor
   */
  getActiveSandboxes(): SandboxInstance[] {
    return Array.from(this.activeSandboxes.values());
  }

  /**
   * Destroy all active sandboxes (cleanup on shutdown)
   */
  async destroyAll(): Promise<void> {
    const ids = Array.from(this.activeSandboxes.keys());
    await Promise.allSettled(ids.map(id => this.destroySandbox(id)));
  }

  /**
   * Get executor status for health checks
   */
  getStatus(): { configured: boolean; apiUrl: string; activeSandboxes: number } {
    return {
      configured: this.isConfigured(),
      apiUrl: this.config.apiUrl,
      activeSandboxes: this.activeSandboxes.size,
    };
  }
}

// Singleton instance
export const daytonaSandbox = new DaytonaSandboxExecutor();
export default daytonaSandbox;
