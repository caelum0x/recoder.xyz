/**
 * Daytona REST Client for docker-backend
 *
 * Communicates with the self-hosted Daytona API server via REST.
 * The Python backend uses the Daytona Python SDK; this module provides
 * equivalent functionality for the Express/TypeScript backend without
 * requiring an npm SDK dependency.
 *
 * Architecture:
 * - Sandbox lifecycle (create/get/list/start/stop/delete) goes through the
 *   Daytona API at http://localhost:3900/api
 * - Toolbox operations (exec, file I/O) go through the toolbox proxy URL,
 *   which is dynamically discovered from GET /api/config → proxyToolboxUrl.
 *   Toolbox endpoints use path format: {proxyToolboxUrl}/{sandboxId}/process/execute
 *
 * File operations use the native Toolbox filesystem API endpoints
 * (upload, download, mkdir, list, delete) with automatic fallback to
 * exec-based shell commands if the native endpoints fail or return 404.
 */

import { createLogger } from './logger.js';

const logger = createLogger('daytona-client');

// ──────────────────────────── Types ────────────────────────────

export interface DaytonaSandboxInfo {
  id: string;
  state: string;
  snapshot?: string;
  target?: string;
  cpu?: number;
  gpu?: number;
  memory?: number;
  disk?: number;
  labels?: Record<string, string>;
  env?: Record<string, string>;
  public?: boolean;
  createdAt?: string;
  updatedAt?: string;
  autoStopInterval?: number;
  autoArchiveInterval?: number;
  toolboxProxyUrl?: string;
}

export interface CreateSandboxOptions {
  /** Snapshot/image to use (default: daytonaio/sandbox:0.5.0-slim) */
  snapshot?: string;
  /** Environment variables to inject */
  envVars?: Record<string, string>;
  /** Make sandbox publicly accessible */
  public?: boolean;
  /** Labels for tagging/identification */
  labels?: Record<string, string>;
  /** Auto-stop interval in minutes (default: 60) */
  autoStopInterval?: number;
  /** Auto-archive interval in minutes (default: 120) */
  autoArchiveInterval?: number;
  /** Target/region (default: us) */
  target?: string;
  /** Resource limits */
  resources?: {
    cpu?: number;
    memory?: number;
    disk?: number;
  };
}

export interface ExecResult {
  /** Command output (stdout) */
  output: string;
  /** Exit code of the command */
  exitCode: number;
}

export interface DaytonaFileInfo {
  name: string;
  size?: number;
  modTime?: string;
  isDir?: boolean;
  mode?: string;
  owner?: string;
  group?: string;
  permissions?: string;
}

export interface DaytonaClientConfig {
  /** Base URL of the Daytona API (e.g. http://localhost:3900/api) */
  baseUrl?: string;
  /** API key for authentication */
  apiKey?: string;
  /** Default target/region */
  target?: string;
  /** Default snapshot image */
  defaultSnapshot?: string;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Toolbox proxy URL override (auto-discovered from /api/config if not set) */
  toolboxProxyUrl?: string;
  /**
   * Separate API key for the toolbox proxy.
   * Daytona's proxy uses PROXY_API_KEY (default: "super_secret_key") which is
   * different from the Daytona API key used for sandbox lifecycle operations.
   * Set DAYTONA_TOOLBOX_API_KEY env var or pass this config option.
   */
  toolboxApiKey?: string;
}

// ──────────────────────────── Client ────────────────────────────

export class DaytonaClient {
  private baseUrl: string;
  private apiKey: string;
  private toolboxApiKey: string;
  private target: string;
  private defaultSnapshot: string;
  private timeoutMs: number;
  private _toolboxProxyUrl: string | null;

  constructor(config?: DaytonaClientConfig) {
    this.baseUrl = (config?.baseUrl || process.env.DAYTONA_SERVER_URL || 'http://localhost:3900/api').replace(/\/$/, '');
    this.apiKey = config?.apiKey || process.env.DAYTONA_API_KEY || '';
    // The daytona-proxy uses PROXY_API_KEY=super_secret_key (different from the API key)
    this.toolboxApiKey = config?.toolboxApiKey || process.env.DAYTONA_TOOLBOX_API_KEY || 'super_secret_key';
    this.target = config?.target || process.env.DAYTONA_TARGET || 'us';
    this.defaultSnapshot = config?.defaultSnapshot || process.env.DAYTONA_SNAPSHOT || 'daytonaio/sandbox:0.5.0-slim';
    this.timeoutMs = config?.timeoutMs || 30000;
    // Default toolbox URL to the internal proxy port to avoid SSL round-trip
    this._toolboxProxyUrl = config?.toolboxProxyUrl || process.env.DAYTONA_TOOLBOX_PROXY_URL || null;

    if (!this.apiKey) {
      logger.warn('DaytonaClient initialized without API key — sandbox operations will fail');
    } else {
      logger.info({ baseUrl: this.baseUrl, target: this.target }, 'DaytonaClient initialized');
    }
  }

  // ── Helpers ──

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
    };
  }

  /** Headers for toolbox proxy requests (uses PROXY_API_KEY, not the Daytona API key). */
  private get toolboxHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.toolboxApiKey ? { Authorization: `Bearer ${this.toolboxApiKey}` } : {}),
    };
  }

  /**
   * Make an authenticated request to the Daytona API server.
   */
  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs?: number,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs || this.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: this.headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Daytona API ${method} ${path} failed: ${response.status} ${response.statusText} — ${text}`);
      }

      // Some endpoints return empty body with 200
      const contentLength = response.headers.get('content-length');
      if (response.status === 204 || contentLength === '0') {
        return undefined as T;
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return (await response.json()) as T;
      }

      // Return raw text for non-JSON responses
      return (await response.text()) as unknown as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Make an authenticated request to the Daytona toolbox proxy.
   * Toolbox endpoints handle exec, file I/O, LSP, etc.
   */
  private async toolboxRequest<T = unknown>(
    method: string,
    sandboxId: string,
    path: string,
    body?: unknown,
    timeoutMs?: number,
  ): Promise<T> {
    const toolboxBase = await this.getToolboxProxyUrl();
    // Path format: /toolbox/{sandboxId}/{operation}
    const url = `${toolboxBase}/${sandboxId}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs || this.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        // Use Daytona API key (main API at port 3900)
        headers: this.headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Daytona toolbox ${method} ${path} failed: ${response.status} ${response.statusText} — ${text}`);
      }

      const contentLength = response.headers.get('content-length');
      if (response.status === 204 || contentLength === '0') {
        return undefined as T;
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return (await response.json()) as T;
      }

      return (await response.text()) as unknown as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Get the toolbox proxy URL, discovering it from the config API if needed.
   */
  private async getToolboxProxyUrl(): Promise<string> {
    if (this._toolboxProxyUrl) {
      return this._toolboxProxyUrl;
    }

    // Use the main Daytona API at port 3900 for toolbox operations.
    // The toolbox endpoint path is: /toolbox/{sandboxId}/toolbox/{operation}
    // NOT /api/toolbox/ — the /api prefix returns 404.
    // From inside Docker, use host.docker.internal to reach the host.
    const isDocker = require('fs').existsSync('/.dockerenv');
    this._toolboxProxyUrl = isDocker
      ? 'http://host.docker.internal:3900/toolbox'
      : `${this.baseUrl.replace(/\/api$/, '')}/toolbox`;
    logger.info({ toolboxProxyUrl: this._toolboxProxyUrl }, 'Using Daytona API toolbox URL');
    return this._toolboxProxyUrl;
  }

  // ── Health / Availability ──

  /**
   * Check if the Daytona API server is reachable and responsive.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.request('GET', '/sandbox', undefined, 5000);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Health check returning latency information.
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      await this.request('GET', '/sandbox', undefined, 5000);
      return { healthy: true, latencyMs: Date.now() - start };
    } catch (err) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: (err as Error).message,
      };
    }
  }

  // ── Sandbox Lifecycle (via main API) ──

  /**
   * Create a new Daytona sandbox.
   */
  async createSandbox(options?: CreateSandboxOptions): Promise<DaytonaSandboxInfo> {
    const payload = {
      snapshot: options?.snapshot || this.defaultSnapshot,
      target: options?.target || this.target,
      public: options?.public ?? true,
      env_vars: options?.envVars || {},
      labels: options?.labels || {},
      auto_stop_interval: options?.autoStopInterval ?? 60,
      auto_archive_interval: options?.autoArchiveInterval ?? 120,
      ...(options?.resources ? {
        resources: {
          cpu: options.resources.cpu,
          memory: options.resources.memory,
          disk: options.resources.disk,
        },
      } : {}),
    };

    logger.info({ snapshot: payload.snapshot, target: payload.target }, 'Creating Daytona sandbox');

    // Sandbox creation can take time — use a longer timeout
    const sandbox = await this.request<DaytonaSandboxInfo>('POST', '/sandbox', payload, 120000);

    logger.info({ sandboxId: sandbox.id, state: sandbox.state }, 'Daytona sandbox created');
    return sandbox;
  }

  /**
   * Get sandbox info by ID.
   */
  async getSandbox(sandboxId: string): Promise<DaytonaSandboxInfo> {
    return this.request<DaytonaSandboxInfo>('GET', `/sandbox/${sandboxId}`);
  }

  /**
   * List all sandboxes.
   */
  async listSandboxes(): Promise<DaytonaSandboxInfo[]> {
    return this.request<DaytonaSandboxInfo[]>('GET', '/sandbox');
  }

  /**
   * Start a stopped/archived sandbox.
   */
  async startSandbox(sandboxId: string): Promise<void> {
    await this.request('POST', `/sandbox/${sandboxId}/start`, undefined, 60000);
    logger.info({ sandboxId }, 'Daytona sandbox started');
  }

  /**
   * Stop a running sandbox.
   */
  async stopSandbox(sandboxId: string): Promise<void> {
    await this.request('POST', `/sandbox/${sandboxId}/stop`);
    logger.info({ sandboxId }, 'Daytona sandbox stopped');
  }

  /**
   * Delete a sandbox permanently.
   */
  async deleteSandbox(sandboxId: string): Promise<void> {
    await this.request('DELETE', `/sandbox/${sandboxId}`);
    logger.info({ sandboxId }, 'Daytona sandbox deleted');
  }

  // ── Command Execution (via toolbox proxy) ──

  /**
   * Execute a command in a sandbox.
   * Uses the toolbox proxy endpoint: POST /{sandboxId}/process/execute
   *
   * NOTE: The Daytona toolbox executes the command directly via exec() —
   * it does NOT run through a shell by default. This means shell operators
   * (&&, ||, >, |, etc.) won't work unless explicitly wrapped in `sh -c`.
   * This method automatically wraps the command in `sh -c "..."` to match
   * the behavior of the Python SDK.
   */
  async execCommand(
    sandboxId: string,
    command: string,
    options?: { cwd?: string; timeoutSecs?: number },
  ): Promise<ExecResult> {
    // Wrap in sh -c to enable shell features (pipes, redirects, &&, etc.)
    // The Python SDK does the same: base64-encodes + sh -c
    const b64Cmd = Buffer.from(command, 'utf-8').toString('base64');
    const wrappedCommand = `sh -c "echo '${b64Cmd}' | base64 -d | sh"`;

    const payload: Record<string, unknown> = {
      command: wrappedCommand,
      ...(options?.cwd ? { cwd: options.cwd } : {}),
      ...(options?.timeoutSecs ? { timeout: options.timeoutSecs } : {}),
    };

    const timeoutMs = options?.timeoutSecs
      ? options.timeoutSecs * 1000 + 5000 // extra 5s buffer
      : this.timeoutMs;

    const result = await this.toolboxRequest<{ result?: string; exitCode?: number; code?: number }>(
      'POST',
      sandboxId,
      '/process/execute',
      payload,
      timeoutMs,
    );

    return {
      output: result?.result || '',
      exitCode: result?.exitCode ?? result?.code ?? 0,
    };
  }

  // ── File Operations — Native Toolbox Filesystem API ──
  // These use the Daytona Toolbox filesystem endpoints directly,
  // which is more efficient and reliable than exec-based shell commands.
  // The exec-based methods are kept as fallbacks below.

  /**
   * Write a file to a sandbox using the native Toolbox filesystem API.
   * Falls back to exec-based upload if the native endpoint fails.
   */
  async uploadFile(sandboxId: string, filePath: string, content: string): Promise<void> {
    // Use exec-based upload directly — the native /filesystem/upload endpoint
    // returns 404 on our Daytona version (0.5.0). Exec-based write is reliable.
    await this.uploadFileExec(sandboxId, filePath, content);
  }

  /**
   * Read a file from a sandbox using the native Toolbox filesystem API.
   * Falls back to exec-based download if the native endpoint fails.
   */
  async downloadFile(sandboxId: string, filePath: string): Promise<string> {
    try {
      return await this.downloadFileNative(sandboxId, filePath);
    } catch (nativeErr) {
      logger.warn(
        { sandboxId: sandboxId.slice(0, 12), filePath, error: (nativeErr as Error).message },
        'Native filesystem download failed, falling back to exec-based download',
      );
      return this.downloadFileExec(sandboxId, filePath);
    }
  }

  /**
   * List files in a sandbox directory using the native Toolbox filesystem API.
   * Falls back to exec-based listing if the native endpoint fails.
   */
  async listFiles(sandboxId: string, dirPath: string): Promise<DaytonaFileInfo[]> {
    try {
      return await this.listFilesNative(sandboxId, dirPath);
    } catch (nativeErr) {
      logger.warn(
        { sandboxId: sandboxId.slice(0, 12), dirPath, error: (nativeErr as Error).message },
        'Native filesystem list failed, falling back to legacy /files/ endpoint',
      );
      // Fallback to the old /files/ endpoint
      const encodedPath = encodeURIComponent(dirPath);
      return this.toolboxRequest<DaytonaFileInfo[]>(
        'GET',
        sandboxId,
        `/files/?path=${encodedPath}`,
      );
    }
  }

  /**
   * Delete a file in a sandbox using the native Toolbox filesystem API.
   * Falls back to exec-based delete if the native endpoint fails.
   */
  async deleteFile(sandboxId: string, filePath: string): Promise<void> {
    try {
      await this.deleteFileNative(sandboxId, filePath);
    } catch (nativeErr) {
      logger.warn(
        { sandboxId: sandboxId.slice(0, 12), filePath, error: (nativeErr as Error).message },
        'Native filesystem delete failed, falling back to exec-based delete',
      );
      await this.deleteFileExec(sandboxId, filePath);
    }
  }

  // ── Native Toolbox Filesystem Methods ──

  /**
   * Upload a file via the Toolbox filesystem API.
   * POST /filesystem/upload with base64-encoded content.
   */
  async uploadFileNative(sandboxId: string, filePath: string, content: string): Promise<void> {
    const absPath = filePath.startsWith('/') ? filePath : `/home/daytona/${filePath}`;

    // Create parent directory first
    const dir = absPath.substring(0, absPath.lastIndexOf('/'));
    if (dir && dir !== '/home/daytona') {
      await this.createDirectoryNative(sandboxId, dir);
    }

    // Upload file content (base64-encoded to handle binary/special chars)
    await this.toolboxRequest('POST', sandboxId, '/filesystem/upload', {
      path: absPath,
      content: Buffer.from(content, 'utf-8').toString('base64'),
      encoding: 'base64',
    });
  }

  /**
   * Download a file via the Toolbox filesystem API.
   * GET /filesystem/download?path=...
   */
  async downloadFileNative(sandboxId: string, filePath: string): Promise<string> {
    const absPath = filePath.startsWith('/') ? filePath : `/home/daytona/${filePath}`;
    const toolboxBase = await this.getToolboxProxyUrl();
    const url = `${toolboxBase}/${sandboxId}/filesystem/download?path=${encodeURIComponent(absPath)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Daytona filesystem download failed: ${response.status} ${response.statusText} — ${text}`);
      }

      // The download endpoint may return raw file content (not JSON)
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const result = (await response.json()) as { content?: string; encoding?: string };
        if (result.encoding === 'base64' && result.content) {
          return Buffer.from(result.content, 'base64').toString('utf-8');
        }
        return result?.content || '';
      }

      // Raw text response — return directly
      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Create a directory via the Toolbox filesystem API.
   * POST /filesystem/mkdir
   */
  async createDirectoryNative(sandboxId: string, dirPath: string): Promise<void> {
    const absPath = dirPath.startsWith('/') ? dirPath : `/home/daytona/${dirPath}`;
    await this.toolboxRequest('POST', sandboxId, '/filesystem/mkdir', {
      path: absPath,
      mode: '0755',
    });
  }

  /**
   * List directory contents via the Toolbox filesystem API.
   * GET /filesystem/list?path=...
   */
  async listFilesNative(sandboxId: string, dirPath: string): Promise<DaytonaFileInfo[]> {
    const absPath = dirPath.startsWith('/') ? dirPath : `/home/daytona/${dirPath}`;
    const result = await this.toolboxRequest<
      DaytonaFileInfo[] | { entries?: Array<{ name: string; isDir?: boolean; size?: number; modTime?: string }> }
    >(
      'GET',
      sandboxId,
      `/filesystem/list?path=${encodeURIComponent(absPath)}`,
    );

    // Handle both array response and { entries: [...] } wrapper
    if (Array.isArray(result)) {
      return result;
    }
    if (result && 'entries' in result && Array.isArray(result.entries)) {
      return result.entries.map(e => ({
        name: e.name,
        isDir: e.isDir,
        size: e.size,
        modTime: e.modTime,
      }));
    }
    return [];
  }

  /**
   * Delete a file or directory via the Toolbox filesystem API.
   * DELETE /filesystem/delete?path=...
   */
  async deleteFileNative(sandboxId: string, filePath: string): Promise<void> {
    const absPath = filePath.startsWith('/') ? filePath : `/home/daytona/${filePath}`;
    await this.toolboxRequest(
      'DELETE',
      sandboxId,
      `/filesystem/delete?path=${encodeURIComponent(absPath)}`,
    );
  }

  // ── Exec-based File Operations (fallbacks) ──

  /**
   * Write a file to a sandbox using exec + base64 encoding.
   * Kept as fallback for when native filesystem API is unavailable.
   */
  private async uploadFileExec(sandboxId: string, filePath: string, content: string): Promise<void> {
    const safePath = filePath.replace(/'/g, "'\\''");
    const b64Content = Buffer.from(content, 'utf-8').toString('base64');
    const CHUNK_SIZE = 65000; // Match Python backend's chunk size to avoid shell arg overflow

    // Create parent directory
    await this.execCommand(sandboxId, `mkdir -p "$(dirname '${safePath}')"`, { timeoutSecs: 10 });

    if (b64Content.length <= CHUNK_SIZE) {
      // Small file — single write
      const command = `echo '${b64Content}' | base64 -d > '${safePath}' && echo '__WRITE_OK__'`;
      const result = await this.execCommand(sandboxId, command, { timeoutSecs: 30 });
      if (result.exitCode !== 0 || !result.output.includes('__WRITE_OK__')) {
        throw new Error(`File write to ${filePath} failed (exit ${result.exitCode}): ${result.output}`);
      }
    } else {
      // Large file — write in chunks to avoid shell argument overflow
      await this.execCommand(sandboxId, `> '${safePath}'`, { timeoutSecs: 10 });
      for (let i = 0; i < b64Content.length; i += CHUNK_SIZE) {
        const chunk = b64Content.slice(i, i + CHUNK_SIZE);
        const command = `echo '${chunk}' | base64 -d >> '${safePath}' && echo '__CHUNK_OK__'`;
        const result = await this.execCommand(sandboxId, command, { timeoutSecs: 30 });
        if (result.exitCode !== 0 || !result.output.includes('__CHUNK_OK__')) {
          throw new Error(`File write chunk to ${filePath} failed at offset ${i}`);
        }
      }
    }
  }

  /**
   * Read a file from a sandbox using exec + cat.
   * Kept as fallback for when native filesystem API is unavailable.
   */
  private async downloadFileExec(sandboxId: string, filePath: string): Promise<string> {
    const result = await this.execCommand(sandboxId, `cat '${filePath.replace(/'/g, "'\\''")}'`, { timeoutSecs: 30 });

    if (result.exitCode !== 0) {
      throw new Error(`File read from ${filePath} failed (exit ${result.exitCode}): ${result.output}`);
    }

    return result.output;
  }

  /**
   * Delete a file in a sandbox using exec + rm.
   * Kept as fallback for when native filesystem API is unavailable.
   */
  private async deleteFileExec(sandboxId: string, filePath: string): Promise<void> {
    const result = await this.execCommand(sandboxId, `rm -f '${filePath.replace(/'/g, "'\\''")}'`, { timeoutSecs: 10 });

    if (result.exitCode !== 0) {
      throw new Error(`File delete of ${filePath} failed (exit ${result.exitCode}): ${result.output}`);
    }
  }

  // ── Session / PTY Operations (via toolbox proxy) ──

  /**
   * Create a persistent session in a Daytona sandbox.
   * Sessions allow multiple commands to share state (cwd, env, etc.)
   * and support PTY-based terminal emulation.
   *
   * POST /{sandboxId}/toolbox/process/session
   */
  async createSession(sandboxId: string, sessionName?: string): Promise<string> {
    const sessionId = sessionName || `session-${Date.now()}`;
    const result = await this.toolboxRequest<{ sessionId?: string; id?: string }>(
      'POST', sandboxId, '/process/session',
      { sessionId, name: sessionId },
    );
    return result?.sessionId || result?.id || sessionId;
  }

  /**
   * Execute a command within an existing session.
   * The command inherits the session's cwd, env, and PTY state.
   *
   * POST /{sandboxId}/toolbox/process/session/{sessionId}/exec
   */
  async execInSession(
    sandboxId: string,
    sessionId: string,
    command: string,
  ): Promise<{ cmdId: string }> {
    try {
      const result = await this.toolboxRequest<{ cmdId?: string; id?: string; commandId?: string }>(
        'POST', sandboxId, `/process/session/${sessionId}/exec`,
        { command },
      );
      return { cmdId: result?.cmdId || result?.id || result?.commandId || '' };
    } catch (err: any) {
      const msg = err?.message || '';
      // Broken pipe = session died. Recreate and retry once.
      if (msg.includes('broken pipe') || msg.includes('session not found') || msg.includes('no such process')) {
        logger.warn({ sandboxId, sessionId, error: msg }, 'Session dead, recreating...');
        try {
          await this.createSession(sandboxId, sessionId);
          const retry = await this.toolboxRequest<{ cmdId?: string; id?: string; commandId?: string }>(
            'POST', sandboxId, `/process/session/${sessionId}/exec`,
            { command },
          );
          return { cmdId: retry?.cmdId || retry?.id || retry?.commandId || '' };
        } catch (retryErr: any) {
          throw new Error(`Session exec failed after recreate: ${retryErr.message}`);
        }
      }
      throw err;
    }
  }

  /**
   * Retrieve logs/output from a session or a specific command within a session.
   *
   * GET /{sandboxId}/toolbox/process/session/{sessionId}/logs
   * GET /{sandboxId}/toolbox/process/session/{sessionId}/command/{cmdId}/logs
   */
  async getSessionLogs(
    sandboxId: string,
    sessionId: string,
    cmdId?: string,
  ): Promise<string> {
    const path = cmdId
      ? `/process/session/${sessionId}/command/${cmdId}/logs`
      : `/process/session/${sessionId}/logs`;
    const result = await this.toolboxRequest<{ logs?: string; output?: string; result?: string }>(
      'GET', sandboxId, path,
    );
    return result?.logs || result?.output || result?.result || '';
  }

  /**
   * Delete/destroy a session in a Daytona sandbox.
   *
   * DELETE /{sandboxId}/toolbox/process/session/{sessionId}
   */
  async deleteSession(sandboxId: string, sessionId: string): Promise<void> {
    try {
      await this.toolboxRequest('DELETE', sandboxId, `/process/session/${sessionId}`);
    } catch (err) {
      // Best-effort cleanup — session may already be gone
      logger.warn(
        { sandboxId: sandboxId.slice(0, 12), sessionId, error: (err as Error).message },
        'Failed to delete Daytona session (may already be cleaned up)',
      );
    }
  }

  /**
   * Resize the PTY attached to a session.
   * Some Daytona versions support this on the session endpoint.
   *
   * POST /{sandboxId}/toolbox/process/session/{sessionId}/resize
   */
  async resizeSession(
    sandboxId: string,
    sessionId: string,
    cols: number,
    rows: number,
  ): Promise<boolean> {
    try {
      await this.toolboxRequest('POST', sandboxId, `/process/session/${sessionId}/resize`, {
        cols,
        rows,
      });
      return true;
    } catch {
      // Resize may not be supported — silently ignore
      return false;
    }
  }

  // ── Git Operations (native Daytona toolbox API) ──

  /**
   * Clone a git repository into a sandbox path.
   * POST /git/clone
   */
  async gitClone(sandboxId: string, url: string, path: string, options?: { branch?: string }): Promise<void> {
    await this.toolboxRequest('POST', sandboxId, '/git/clone', { url, path, ...options }, 120000);
  }

  /**
   * Stage files in a git repository.
   * POST /git/add
   */
  async gitAdd(sandboxId: string, path: string, files: string[]): Promise<void> {
    await this.toolboxRequest('POST', sandboxId, '/git/add', { path, files });
  }

  /**
   * Create a git commit.
   * POST /git/commit
   */
  async gitCommit(sandboxId: string, path: string, message: string, author?: { name: string; email: string }): Promise<void> {
    await this.toolboxRequest('POST', sandboxId, '/git/commit', { path, message, author });
  }

  /**
   * Push to a remote repository.
   * POST /git/push
   */
  async gitPush(sandboxId: string, path: string): Promise<void> {
    await this.toolboxRequest('POST', sandboxId, '/git/push', { path });
  }

  /**
   * Pull from a remote repository.
   * POST /git/pull
   */
  async gitPull(sandboxId: string, path: string): Promise<void> {
    await this.toolboxRequest('POST', sandboxId, '/git/pull', { path });
  }

  /**
   * List branches in a git repository.
   * GET /git/branches
   */
  async gitBranches(sandboxId: string, path: string): Promise<string[]> {
    const result = await this.toolboxRequest<{ branches?: Array<{ name: string }> } | string[]>(
      'GET',
      sandboxId,
      `/git/branches?path=${encodeURIComponent(path)}`,
    );
    // Handle both array of strings and { branches: [...] } response formats
    if (Array.isArray(result)) {
      return result.map((b: any) => typeof b === 'string' ? b : b.name || String(b));
    }
    if (result && typeof result === 'object' && 'branches' in result) {
      return ((result as any).branches || []).map((b: any) => typeof b === 'string' ? b : b.name || String(b));
    }
    return [];
  }

  /**
   * Create a new branch.
   * POST /git/branch/create
   */
  async gitBranchCreate(sandboxId: string, path: string, name: string): Promise<void> {
    await this.toolboxRequest('POST', sandboxId, '/git/branch/create', { path, name });
  }

  /**
   * Checkout a branch.
   * POST /git/branch/checkout
   */
  async gitBranchCheckout(sandboxId: string, path: string, name: string): Promise<void> {
    await this.toolboxRequest('POST', sandboxId, '/git/branch/checkout', { path, name });
  }

  /**
   * Get git status.
   * GET /git/status
   */
  async gitStatus(sandboxId: string, path: string): Promise<any> {
    return this.toolboxRequest('GET', sandboxId, `/git/status?path=${encodeURIComponent(path)}`);
  }

  // ── Preview URLs ──

  /**
   * Get the preview URL for a port exposed by a sandbox.
   * Uses the configured DNS pattern: https://{port}-{sandboxId}.sandbox.recoder.xyz
   */
  getPreviewUrl(sandboxId: string, port: number): string {
    return `https://${port}-${sandboxId}.sandbox.recoder.xyz`;
  }

  // ── Convenience: Get or Start ──

  /**
   * Get a sandbox by ID. If stopped/archived, start it and wait for it to be ready.
   * Mirrors the Python backend's get_or_start_sandbox() behavior.
   */
  async getOrStartSandbox(
    sandboxId: string,
    maxWaitMs: number = 30000,
  ): Promise<DaytonaSandboxInfo> {
    let sandbox = await this.getSandbox(sandboxId);

    const needsStart = ['stopped', 'archived', 'archiving'].includes(sandbox.state);
    if (needsStart) {
      logger.info({ sandboxId, state: sandbox.state }, 'Sandbox needs starting');
      await this.startSandbox(sandboxId);
    }

    // Wait for sandbox to reach running state (handles 'creating', 'starting', etc.)
    if (sandbox.state !== 'started' && sandbox.state !== 'running') {
      const deadline = Date.now() + maxWaitMs;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        sandbox = await this.getSandbox(sandboxId);
        if (sandbox.state === 'started' || sandbox.state === 'running') {
          break;
        }
        logger.info({ sandboxId, state: sandbox.state }, 'Waiting for sandbox to be ready...');
      }

      if (sandbox.state !== 'started' && sandbox.state !== 'running') {
        throw new Error(`Sandbox ${sandboxId} not ready within ${maxWaitMs}ms (state: ${sandbox.state})`);
      }
    }

    return sandbox;
  }
}

// ──────────────────────────── Singleton ────────────────────────────

let _instance: DaytonaClient | null = null;

/**
 * Get or create the singleton DaytonaClient instance.
 * Reads configuration from environment variables on first call.
 */
export function getDaytonaClient(): DaytonaClient {
  if (!_instance) {
    _instance = new DaytonaClient();
  }
  return _instance;
}

/**
 * Check if Daytona integration is configured (API key present).
 */
export function isDaytonaConfigured(): boolean {
  return !!(process.env.DAYTONA_API_KEY);
}
