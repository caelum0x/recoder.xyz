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
import { DAYTONA_WORKSPACE_ROOT } from './daytona-runtime.js';

const logger = createLogger('daytona-client');

function shellQuoteSingle(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

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

export interface PortPreviewUrl {
  sandboxId: string;
  url: string;
  token: string;
}

export interface SignedPortPreviewUrl {
  sandboxId: string;
  port: number;
  token: string;
  url: string;
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
  private workDirCache = new Map<string, string>();

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

  private getCachedWorkDir(sandboxId: string): string {
    return this.workDirCache.get(sandboxId) || DAYTONA_WORKSPACE_ROOT;
  }

  private async getSandboxWorkDirOrFallback(sandboxId: string): Promise<string> {
    const cached = this.workDirCache.get(sandboxId);
    if (cached) {
      return cached;
    }

    try {
      return await this.getWorkDir(sandboxId);
    } catch {
      return DAYTONA_WORKSPACE_ROOT;
    }
  }

  private async resolveSandboxPath(sandboxId: string, sandboxPath: string): Promise<string> {
    if (sandboxPath.startsWith('/')) {
      return sandboxPath;
    }

    const workDir = await this.getSandboxWorkDirOrFallback(sandboxId);
    return `${workDir.replace(/\/$/, '')}/${sandboxPath.replace(/^\/+/, '')}`;
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
    // Path format on this Daytona deployment:
    // /api/toolbox/{sandboxId}/toolbox/{operation}
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${toolboxBase}/${sandboxId}/toolbox${normalizedPath}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs || this.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        // This deployment exposes sandbox exec/toolbox under the main Daytona
        // API surface (/api/toolbox/...), so it requires the main Daytona API
        // bearer token rather than the old proxy-specific secret.
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

    // Daytona toolbox path on this deployment is exposed under the main API:
    //   http://host.docker.internal:3900/api/toolbox/{sandboxId}/toolbox/{operation}
    // From inside Docker, use host.docker.internal to reach the host.
    const isDocker = require('fs').existsSync('/.dockerenv');
    this._toolboxProxyUrl = isDocker
      ? 'http://host.docker.internal:3900/api/toolbox'
      : `${this.baseUrl}/toolbox`;
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
      autoStopInterval: options?.autoStopInterval ?? 43200,
      autoArchiveInterval: options?.autoArchiveInterval ?? 43200,
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

  rememberWorkDir(sandboxId: string, workDir: string | null | undefined): void {
    if (!workDir) return;
    this.workDirCache.set(sandboxId, workDir);
  }

  async getWorkDir(sandboxId: string): Promise<string> {
    const cached = this.workDirCache.get(sandboxId);
    if (cached) {
      return cached;
    }

    const result = await this.toolboxRequest<{ dir?: string }>(
      'GET',
      sandboxId,
      '/work-dir',
    );

    const workDir = result?.dir || DAYTONA_WORKSPACE_ROOT;
    this.workDirCache.set(sandboxId, workDir);
    return workDir;
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
    // Build the full command with optional cwd prefix
    let fullCommand = command;
    if (options?.cwd) {
      const safeCwd = options.cwd.replace(/'/g, "'\\''");
      const fallbackCwd = (await this.getSandboxWorkDirOrFallback(sandboxId)).replace(/'/g, "'\\''");
      fullCommand = `cd '${safeCwd}' 2>/dev/null || cd '${fallbackCwd}' 2>/dev/null || true; ${command}`;
    }

    let execCmd: string;

    // Short commands: inline sh -c (fast, no temp file overhead)
    // Long commands: write to temp file then execute (avoids JSON.stringify mangling)
    if (fullCommand.length < 500) {
      execCmd = `sh -c ${shellQuoteSingle(fullCommand)}`;
    } else {
      // Encode command as base64 and decode in the sandbox to avoid any escaping issues
      const b64 = Buffer.from(fullCommand, 'utf-8').toString('base64');
      const tmpScript = `/tmp/_cmd_${Date.now()}.sh`;
      // The toolbox endpoint executes argv directly, not through a shell.
      // Wrap the bootstrap in `sh -c` so pipes, redirects, and `&&` work.
      const shellScript = `printf '%s' '${b64}' | base64 -d > ${tmpScript} && sh ${tmpScript}; __e=$?; rm -f ${tmpScript}; exit $__e`;
      execCmd = `sh -c ${JSON.stringify(shellScript)}`;
    }

    const payload: Record<string, unknown> = {
      command: execCmd,
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
    return this.downloadFileExec(sandboxId, filePath);
  }

  /**
   * List files in a sandbox directory using the native Toolbox filesystem API.
   * Falls back to exec-based listing if the native endpoint fails.
   */
  async listFiles(sandboxId: string, dirPath: string): Promise<DaytonaFileInfo[]> {
    return this.listFilesExec(sandboxId, dirPath);
  }

  /**
   * Delete a file in a sandbox using the native Toolbox filesystem API.
   * Falls back to exec-based delete if the native endpoint fails.
   */
  async deleteFile(sandboxId: string, filePath: string): Promise<void> {
    await this.deleteFileExec(sandboxId, filePath);
  }

  // ── Native Toolbox Filesystem Methods ──

  /**
   * Upload a file via the Toolbox filesystem API.
   * POST /filesystem/upload with base64-encoded content.
   */
  async uploadFileNative(sandboxId: string, filePath: string, content: string): Promise<void> {
    const absPath = await this.resolveSandboxPath(sandboxId, filePath);
    const workDir = await this.getSandboxWorkDirOrFallback(sandboxId);

    // Create parent directory first
    const dir = absPath.substring(0, absPath.lastIndexOf('/'));
    if (dir && dir !== workDir) {
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
    const absPath = await this.resolveSandboxPath(sandboxId, filePath);
    const toolboxBase = await this.getToolboxProxyUrl();
    const url = `${toolboxBase}/${sandboxId}/filesystem/download?path=${encodeURIComponent(absPath)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.toolboxHeaders,
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
    const absPath = await this.resolveSandboxPath(sandboxId, dirPath);
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
    const absPath = await this.resolveSandboxPath(sandboxId, dirPath);
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
    const absPath = await this.resolveSandboxPath(sandboxId, filePath);
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
  /**
   * ROOT CAUSE FIX for file writes failing silently:
   *
   * Problem: execCommand() wraps commands in sh -c "echo '{base64_of_command}' | base64 -d | sh"
   * When the command contains 65KB+ of base64 file content, the outer echo argument
   * exceeds shell limits (~128KB), causing silent failure (exit 0, empty output).
   *
   * Fix: Call the Daytona /process/execute API directly with sh -c and the raw command.
   * The API passes the command string to exec(), which passes it to sh.
   * sh -c "printf '%s' '{b64}' | base64 -d > file" works because printf handles
   * the argument directly, and the command goes through the API's JSON body
   * (no size limit) not through shell argument parsing.
   *
   * For very large files (>50KB of content = ~68KB base64), we chunk the base64
   * into a temp file first, then decode in a separate call.
   */
  private async rawShellExec(
    sandboxId: string,
    cmd: string,
    timeoutSecs = 30,
  ): Promise<{ exitCode: number; output: string }> {
    const shCmd = `sh -c ${JSON.stringify(cmd)}`;
    const result = await this.toolboxRequest<{ result?: string; exitCode?: number; code?: number }>(
      'POST', sandboxId, '/process/execute',
      { command: shCmd, timeout: timeoutSecs },
      timeoutSecs * 1000 + 5000,
    );
    return {
      output: result?.result || '',
      exitCode: result?.exitCode ?? result?.code ?? 0,
    };
  }

  private async uploadFileExec(sandboxId: string, filePath: string, content: string): Promise<void> {
    const absPath = await this.resolveSandboxPath(sandboxId, filePath);
    const safePath = absPath.replace(/'/g, "'\\''");
    const b64Content = Buffer.from(content, 'utf-8').toString('base64');

    // Create parent directory
    const dir = absPath.substring(0, absPath.lastIndexOf('/'));
    if (dir) {
      const mkdirResult = await this.rawShellExec(sandboxId, `mkdir -p '${dir.replace(/'/g, "'\\''")}'`, 10);
      if (mkdirResult.exitCode !== 0) {
        throw new Error(`Parent directory create failed for ${absPath} (exit ${mkdirResult.exitCode}): ${mkdirResult.output}`);
      }
    }

    // For files up to ~40KB base64 (fits in a single printf argument)
    const SINGLE_LIMIT = 40000;
    if (b64Content.length <= SINGLE_LIMIT) {
      const r = await this.rawShellExec(sandboxId, `printf '%s' '${b64Content}' | base64 -d > '${safePath}'`);
      if (r.exitCode !== 0) {
        throw new Error(`File write to ${absPath} failed (exit ${r.exitCode}): ${r.output}`);
      }
      return;
    }

    // Large files: write base64 chunks to temp file, then decode
    const tmpFile = `/tmp/_upload_${Date.now()}.b64`;
    const CHUNK = 40000;

    for (let i = 0; i < b64Content.length; i += CHUNK) {
      const chunk = b64Content.slice(i, i + CHUNK);
      const op = i === 0 ? '>' : '>>';
      const r = await this.rawShellExec(sandboxId, `printf '%s' '${chunk}' ${op} '${tmpFile}'`);
      if (r.exitCode !== 0) {
        throw new Error(`File write chunk failed at offset ${i} for ${absPath}: ${r.output}`);
      }
    }

    // Decode and move to target
    const r = await this.rawShellExec(sandboxId, `base64 -d < '${tmpFile}' > '${safePath}' && rm -f '${tmpFile}'`);
    if (r.exitCode !== 0) {
      throw new Error(`File decode failed for ${absPath} (exit ${r.exitCode}): ${r.output}`);
    }
  }

  /**
   * Read a file from a sandbox using exec + cat.
   * Kept as fallback for when native filesystem API is unavailable.
   */
  private async downloadFileExec(sandboxId: string, filePath: string): Promise<string> {
    const absPath = await this.resolveSandboxPath(sandboxId, filePath);
    const result = await this.rawShellExec(
      sandboxId,
      `cat '${absPath.replace(/'/g, "'\\''")}'`,
      30,
    );

    if (result.exitCode !== 0) {
      throw new Error(`File read from ${absPath} failed (exit ${result.exitCode}): ${result.output}`);
    }

    return result.output;
  }

  /**
   * List files in a sandbox directory using exec + find.
   * Kept as fallback for when native filesystem API is unavailable.
   */
  private async listFilesExec(sandboxId: string, dirPath: string): Promise<DaytonaFileInfo[]> {
    const absPath = await this.resolveSandboxPath(sandboxId, dirPath);
    const escaped = absPath.replace(/'/g, "'\\''");
    const cmd = [
      `if [ ! -d '${escaped}' ]; then exit 0; fi`,
      `find '${escaped}' -maxdepth 1 -mindepth 1 -printf '%f\\t%y\\n' 2>/dev/null || true`,
    ].join('; ');

    const result = await this.rawShellExec(sandboxId, cmd, 20);
    if (result.exitCode !== 0) {
      throw new Error(`File list for ${dirPath} failed (exit ${result.exitCode}): ${result.output}`);
    }

    return result.output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, type] = line.split('\t');
        return {
          name,
          isDir: type === 'd',
        } satisfies DaytonaFileInfo;
      });
  }

  /**
   * Delete a file in a sandbox using exec + rm.
   * Kept as fallback for when native filesystem API is unavailable.
   */
  private async deleteFileExec(sandboxId: string, filePath: string): Promise<void> {
    const absPath = await this.resolveSandboxPath(sandboxId, filePath);
    const result = await this.execCommand(sandboxId, `rm -f '${absPath.replace(/'/g, "'\\''")}'`, { timeoutSecs: 10 });

    if (result.exitCode !== 0) {
      throw new Error(`File delete of ${absPath} failed (exit ${result.exitCode}): ${result.output}`);
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
    try {
      const result = await this.toolboxRequest<{ sessionId?: string; id?: string }>(
        'POST', sandboxId, '/process/session',
        { sessionId, name: sessionId },
      );
      return result?.sessionId || result?.id || sessionId;
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('409') || msg.includes('conflict: session already exists')) {
        return sessionId;
      }
      throw err;
    }
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
    options?: { runAsync?: boolean; suppressInputEcho?: boolean },
  ): Promise<{ cmdId: string }> {
    const payload = {
      command,
      runAsync: options?.runAsync ?? true,
      ...(options?.suppressInputEcho ? { suppressInputEcho: true } : {}),
    };

    try {
      const result = await this.toolboxRequest<{ cmdId?: string; id?: string; commandId?: string }>(
        'POST', sandboxId, `/process/session/${sessionId}/exec`,
        payload,
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
            payload,
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
    let effectiveCmdId = cmdId;

    if (!effectiveCmdId) {
      const session = await this.toolboxRequest<{ commands?: Array<{ id?: string }> }>(
        'GET',
        sandboxId,
        `/process/session/${sessionId}`,
      );
      const commands = Array.isArray(session?.commands) ? session.commands : [];
      effectiveCmdId = commands[commands.length - 1]?.id;
      if (!effectiveCmdId) {
        return '';
      }
    }

    const result = await this.toolboxRequest<{ logs?: string; output?: string; result?: string }>(
      'GET',
      sandboxId,
      `/process/session/${sessionId}/command/${effectiveCmdId}/logs`,
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
   * Get the authenticated preview URL and token for a sandbox port.
   * GET /sandbox/:sandboxId/ports/:port/preview-url
   */
  async getPortPreviewUrl(sandboxId: string, port: number): Promise<PortPreviewUrl> {
    return this.request<PortPreviewUrl>(
      'GET',
      `/sandbox/${encodeURIComponent(sandboxId)}/ports/${port}/preview-url`,
    );
  }

  /**
   * Get a signed preview URL for a sandbox port.
   * GET /sandbox/:sandboxId/ports/:port/signed-preview-url
   */
  async getSignedPortPreviewUrl(
    sandboxId: string,
    port: number,
    expiresInSeconds?: number,
  ): Promise<SignedPortPreviewUrl> {
    const expiresParam = typeof expiresInSeconds === 'number'
      ? `?expiresInSeconds=${encodeURIComponent(String(expiresInSeconds))}`
      : '';
    return this.request<SignedPortPreviewUrl>(
      'GET',
      `/sandbox/${encodeURIComponent(sandboxId)}/ports/${port}/signed-preview-url${expiresParam}`,
    );
  }

  /**
   * Build the raw preview URL pattern for a sandbox port.
   * Prefer getPortPreviewUrl() when you need the official Daytona auth token.
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
