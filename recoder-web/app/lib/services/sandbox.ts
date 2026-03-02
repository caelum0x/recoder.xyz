/**
 * Sandbox Abstraction Layer
 *
 * Provides a unified interface for different sandbox backends:
 * - Docker (current default) - Full Linux container via docker-backend service
 * - WebContainer (browser-only) - WebContainer API for in-browser execution
 * - E2B (cloud) - E2B cloud sandbox for scalable execution
 *
 * This abstraction allows the application to seamlessly switch between
 * sandbox implementations based on environment, user preferences, or
 * availability.
 */

import { createScopedLogger } from '~/utils/logger';
import {
  dockerFetch,
  dockerGet,
  dockerPost,
  dockerPut,
  dockerDelete,
  dockerWriteFile,
  dockerReadFile,
  dockerDeleteFile,
  dockerWriteFiles,
  createDockerWebSocket,
  checkDockerHealth,
  DOCKER_URL,
  getSessionToken,
  type ConnectionState,
} from './docker-api';
import type { ReconnectingWebSocket } from '~/lib/utils/error-handler';

const logger = createScopedLogger('Sandbox');

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Supported sandbox types
 */
export type SandboxType = 'docker' | 'webcontainer' | 'e2b';

/**
 * Sandbox connection status
 */
export type SandboxStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'initializing';

/**
 * File entry in sandbox filesystem
 */
export interface SandboxFile {
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modifiedAt?: Date;
  content?: string;
}

/**
 * Shell/process execution options
 */
export interface ExecOptions {
  /** Working directory for the command */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Stream stdout/stderr */
  stream?: boolean;
  /** Callback for stdout data */
  onStdout?: (data: string) => void;
  /** Callback for stderr data */
  onStderr?: (data: string) => void;
}

/**
 * Result of executing a command
 */
export interface ExecResult {
  /** Exit code (0 = success) */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Whether the command timed out */
  timedOut?: boolean;
  /** Whether the command was killed */
  killed?: boolean;
}

/**
 * Process handle for long-running processes
 */
export interface SandboxProcess {
  /** Process ID */
  pid: number;
  /** Kill the process */
  kill: (signal?: string) => Promise<void>;
  /** Write to stdin */
  write: (data: string) => Promise<void>;
  /** Resize terminal (if applicable) */
  resize?: (cols: number, rows: number) => Promise<void>;
  /** Wait for process to exit */
  wait: () => Promise<ExecResult>;
}

/**
 * Terminal session in sandbox
 */
export interface SandboxTerminal {
  /** Terminal ID */
  id: string;
  /** WebSocket connection for terminal I/O */
  ws: ReconnectingWebSocket | WebSocket;
  /** Write data to terminal */
  write: (data: string) => void;
  /** Resize terminal */
  resize: (cols: number, rows: number) => void;
  /** Close terminal */
  close: () => void;
  /** Kill current process */
  kill: () => void;
}

/**
 * Preview URL information
 */
export interface PreviewInfo {
  /** Port number */
  port: number;
  /** URL to access the preview */
  url: string;
  /** Whether the port is responding */
  ready: boolean;
}

/**
 * Sandbox resource usage
 */
export interface ResourceUsage {
  /** CPU usage percentage (0-100) */
  cpu: number;
  /** Memory usage in bytes */
  memoryUsed: number;
  /** Memory limit in bytes */
  memoryLimit: number;
  /** Disk usage in bytes */
  diskUsed: number;
  /** Disk limit in bytes */
  diskLimit: number;
  /** Network bytes received */
  networkRx: number;
  /** Network bytes transmitted */
  networkTx: number;
}

/**
 * Sandbox capabilities
 */
export interface SandboxCapabilities {
  /** Can run shell commands */
  shell: boolean;
  /** Can access filesystem */
  filesystem: boolean;
  /** Can spawn processes */
  processes: boolean;
  /** Can expose network ports */
  networking: boolean;
  /** Can use WebSockets */
  websockets: boolean;
  /** Has persistent storage */
  persistence: boolean;
  /** Can install system packages */
  systemPackages: boolean;
  /** Maximum concurrent processes */
  maxProcesses: number;
  /** Maximum disk space in bytes */
  maxDiskSpace: number;
  /** Maximum memory in bytes */
  maxMemory: number;
}

/**
 * Configuration for creating a sandbox
 */
export interface SandboxConfig {
  /** Unique identifier for the sandbox */
  id: string;
  /** Base template/image to use */
  template?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Resource limits */
  resources?: {
    cpu?: number;
    memory?: number;
    disk?: number;
  };
  /** Timeout for sandbox operations */
  timeout?: number;
}

/**
 * Event types emitted by sandbox
 */
export type SandboxEventType =
  | 'status'
  | 'file-change'
  | 'process-exit'
  | 'port-ready'
  | 'error'
  | 'output';

/**
 * Sandbox event data
 */
export interface SandboxEvent {
  type: SandboxEventType;
  data: unknown;
  timestamp: Date;
}

/**
 * Event listener type
 */
export type SandboxEventListener = (event: SandboxEvent) => void;

// ============================================================================
// Sandbox Provider Interface
// ============================================================================

/**
 * Abstract interface for sandbox providers.
 * Implement this interface to add support for new sandbox backends.
 */
export interface SandboxProvider {
  /** Type identifier */
  readonly type: SandboxType;

  /** Current status */
  readonly status: SandboxStatus;

  /** Sandbox ID (project ID) */
  readonly id: string;

  /** Provider capabilities */
  readonly capabilities: SandboxCapabilities;

  // Lifecycle methods
  /**
   * Initialize and connect to the sandbox
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the sandbox
   */
  disconnect(): Promise<void>;

  /**
   * Check if sandbox is healthy and responsive
   */
  healthCheck(): Promise<{ healthy: boolean; latency: number }>;

  // File operations
  /**
   * Write content to a file
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Read content from a file
   */
  readFile(path: string): Promise<string>;

  /**
   * Delete a file or directory
   */
  deleteFile(path: string): Promise<void>;

  /**
   * List files in a directory
   */
  listFiles(path?: string): Promise<SandboxFile[]>;

  /**
   * Check if a file exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * Create a directory
   */
  mkdir(path: string, recursive?: boolean): Promise<void>;

  /**
   * Rename/move a file or directory
   */
  rename(oldPath: string, newPath: string): Promise<void>;

  /**
   * Write multiple files atomically
   */
  writeFiles(
    files: Array<{ path: string; content: string }>
  ): Promise<{ success: boolean; failed: Array<{ path: string; error: string }> }>;

  // Command execution
  /**
   * Execute a command and wait for completion
   */
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;

  /**
   * Spawn a long-running process
   */
  spawn(command: string, options?: ExecOptions): Promise<SandboxProcess>;

  /**
   * Create an interactive terminal session
   */
  createTerminal(): Promise<SandboxTerminal>;

  // Preview/networking
  /**
   * Get preview URL for a port
   */
  getPreviewUrl(port: number): Promise<string>;

  /**
   * Get information about exposed ports
   */
  getPreviewInfo(): Promise<PreviewInfo[]>;

  /**
   * Wait for a port to become ready
   */
  waitForPort(port: number, timeout?: number): Promise<boolean>;

  // Resource management
  /**
   * Get current resource usage
   */
  getResourceUsage(): Promise<ResourceUsage>;

  // Events
  /**
   * Subscribe to sandbox events
   */
  on(event: SandboxEventType, listener: SandboxEventListener): () => void;

  /**
   * Emit a sandbox event
   */
  emit(event: SandboxEvent): void;
}

// ============================================================================
// Docker Sandbox Implementation
// ============================================================================

/**
 * Docker sandbox implementation using docker-backend service.
 * This is the primary sandbox implementation for production use.
 */
export class DockerSandbox implements SandboxProvider {
  readonly type: SandboxType = 'docker';
  readonly id: string;

  #status: SandboxStatus = 'disconnected';
  #eventListeners: Map<SandboxEventType, Set<SandboxEventListener>> = new Map();
  #fileWatcherWs: ReconnectingWebSocket | null = null;

  constructor(config: SandboxConfig) {
    this.id = config.id;
  }

  get status(): SandboxStatus {
    return this.#status;
  }

  get capabilities(): SandboxCapabilities {
    return {
      shell: true,
      filesystem: true,
      processes: true,
      networking: true,
      websockets: true,
      persistence: true,
      systemPackages: true,
      maxProcesses: 100,
      maxDiskSpace: 10 * 1024 * 1024 * 1024, // 10GB
      maxMemory: 4 * 1024 * 1024 * 1024, // 4GB
    };
  }

  async connect(): Promise<void> {
    this.#status = 'connecting';
    this.emit({ type: 'status', data: { status: 'connecting' }, timestamp: new Date() });

    try {
      // Create container if it doesn't exist
      await dockerPost(`/api/create/${this.id}`);

      // Verify container is healthy
      const health = await this.healthCheck();
      if (!health.healthy) {
        throw new Error('Container health check failed');
      }

      // Start file watcher
      this.#startFileWatcher();

      this.#status = 'connected';
      this.emit({ type: 'status', data: { status: 'connected' }, timestamp: new Date() });
      logger.info(`Connected to Docker sandbox: ${this.id}`);
    } catch (error) {
      this.#status = 'error';
      this.emit({
        type: 'error',
        data: { error: error instanceof Error ? error.message : 'Connection failed' },
        timestamp: new Date(),
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.#fileWatcherWs) {
      this.#fileWatcherWs.close();
      this.#fileWatcherWs = null;
    }

    this.#status = 'disconnected';
    this.emit({ type: 'status', data: { status: 'disconnected' }, timestamp: new Date() });
    logger.info(`Disconnected from Docker sandbox: ${this.id}`);
  }

  async healthCheck(): Promise<{ healthy: boolean; latency: number }> {
    const start = Date.now();
    try {
      await dockerGet(`/api/preview/${this.id}/health`, { timeout: 5000 });
      return { healthy: true, latency: Date.now() - start };
    } catch {
      return { healthy: false, latency: Date.now() - start };
    }
  }

  // File operations
  async writeFile(path: string, content: string): Promise<void> {
    await dockerWriteFile(this.id, path, content);
  }

  async readFile(path: string): Promise<string> {
    return dockerReadFile(this.id, path);
  }

  async deleteFile(path: string): Promise<void> {
    await dockerDeleteFile(this.id, path);
  }

  async listFiles(path: string = '/'): Promise<SandboxFile[]> {
    const response = await dockerGet<{ files: Array<{ name: string; type: string; size?: number }> }>(
      `/api/files/${this.id}?path=${encodeURIComponent(path)}`
    );

    return (response.files || []).map((f) => ({
      path: path === '/' ? `/${f.name}` : `${path}/${f.name}`,
      type: f.type === 'directory' ? 'directory' : 'file',
      size: f.size,
    }));
  }

  async exists(path: string): Promise<boolean> {
    try {
      await dockerGet(`/api/file/${this.id}?path=${encodeURIComponent(path)}`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(path: string, recursive: boolean = true): Promise<void> {
    await dockerPost(`/api/mkdir/${this.id}`, { path, recursive });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await dockerPost(`/api/rename/${this.id}`, { oldPath, newPath });
  }

  async writeFiles(
    files: Array<{ path: string; content: string }>
  ): Promise<{ success: boolean; failed: Array<{ path: string; error: string }> }> {
    return dockerWriteFiles(this.id, files);
  }

  // Command execution
  async exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    const { cwd, env, timeout = 30000 } = options;

    const response = await dockerPost<{
      exitCode: number;
      stdout: string;
      stderr: string;
    }>(`/api/exec/${this.id}`, {
      command,
      cwd,
      env,
      timeout,
    }, { timeout: timeout + 5000 });

    return {
      exitCode: response.exitCode,
      stdout: response.stdout || '',
      stderr: response.stderr || '',
    };
  }

  async spawn(command: string, options: ExecOptions = {}): Promise<SandboxProcess> {
    const { cwd, env } = options;

    const response = await dockerPost<{ pid: number }>(`/api/spawn/${this.id}`, {
      command,
      cwd,
      env,
    });

    const pid = response.pid;

    return {
      pid,
      kill: async (signal?: string) => {
        await dockerPost(`/api/kill/${this.id}`, { pid, signal });
      },
      write: async (data: string) => {
        await dockerPost(`/api/stdin/${this.id}`, { pid, data });
      },
      resize: async (cols: number, rows: number) => {
        await dockerPost(`/api/resize/${this.id}`, { pid, cols, rows });
      },
      wait: async (): Promise<ExecResult> => {
        const result = await dockerGet<ExecResult>(`/api/wait/${this.id}/${pid}`);
        return result;
      },
    };
  }

  async createTerminal(): Promise<SandboxTerminal> {
    // Request a new terminal session
    const response = await dockerPost<{ terminalId: string }>(`/api/terminal/${this.id}`);
    const terminalId = response.terminalId;

    // Create WebSocket connection
    const wsUrl = `${DOCKER_URL.replace(/^http/, 'ws')}/api/terminal/${this.id}/${terminalId}`;
    const token = getSessionToken();
    const urlWithToken = token ? `${wsUrl}?token=${encodeURIComponent(token)}` : wsUrl;

    const ws = createDockerWebSocket(`/api/terminal/${this.id}/${terminalId}`, {
      onMessage: (data) => {
        this.emit({
          type: 'output',
          data: { terminalId, output: data },
          timestamp: new Date(),
        });
      },
    });

    return {
      id: terminalId,
      ws,
      write: (data: string) => {
        if (ws.isConnected()) {
          ws.send(JSON.stringify({ type: 'input', data }));
        }
      },
      resize: (cols: number, rows: number) => {
        if (ws.isConnected()) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      },
      close: () => {
        ws.close();
      },
      kill: () => {
        if (ws.isConnected()) {
          ws.send(JSON.stringify({ type: 'kill' }));
        }
      },
    };
  }

  // Preview/networking
  async getPreviewUrl(port: number): Promise<string> {
    const response = await dockerGet<{ url: string }>(`/api/preview/${this.id}/url?port=${port}`);
    return response.url;
  }

  async getPreviewInfo(): Promise<PreviewInfo[]> {
    const response = await dockerGet<{ ports: Array<{ port: number; url: string; responding: boolean }> }>(
      `/api/preview/${this.id}/health`,
      { timeout: 10000, skipRetry: true }
    );

    return (response.ports || []).map((p) => ({
      port: p.port,
      url: p.url,
      ready: p.responding,
    }));
  }

  async waitForPort(port: number, timeout: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 500;

    while (Date.now() - startTime < timeout) {
      const info = await this.getPreviewInfo();
      const portInfo = info.find((p) => p.port === port);

      if (portInfo?.ready) {
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return false;
  }

  // Resource management
  async getResourceUsage(): Promise<ResourceUsage> {
    const response = await dockerGet<{
      cpu: number;
      memory: { used: number; limit: number };
      disk: { used: number; limit: number };
      network: { rx: number; tx: number };
    }>(`/api/stats/${this.id}`);

    return {
      cpu: response.cpu || 0,
      memoryUsed: response.memory?.used || 0,
      memoryLimit: response.memory?.limit || 0,
      diskUsed: response.disk?.used || 0,
      diskLimit: response.disk?.limit || 0,
      networkRx: response.network?.rx || 0,
      networkTx: response.network?.tx || 0,
    };
  }

  // Events
  on(event: SandboxEventType, listener: SandboxEventListener): () => void {
    if (!this.#eventListeners.has(event)) {
      this.#eventListeners.set(event, new Set());
    }
    this.#eventListeners.get(event)!.add(listener);

    return () => {
      this.#eventListeners.get(event)?.delete(listener);
    };
  }

  emit(event: SandboxEvent): void {
    const listeners = this.#eventListeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          logger.error('Event listener error:', error);
        }
      }
    }
  }

  // Private methods
  #startFileWatcher(): void {
    this.#fileWatcherWs = createDockerWebSocket(`/api/watch/${this.id}`, {
      onMessage: (data: any) => {
        if (data?.type === 'file-change') {
          this.emit({
            type: 'file-change',
            data: { path: data.path, event: data.event },
            timestamp: new Date(),
          });
        }
      },
      onStatusChange: (state: ConnectionState) => {
        if (state.status === 'error') {
          this.emit({
            type: 'error',
            data: { error: 'File watcher disconnected' },
            timestamp: new Date(),
          });
        }
      },
    });
  }
}

// ============================================================================
// WebContainer Sandbox Implementation (Stub)
// ============================================================================

/**
 * WebContainer sandbox implementation for browser-only mode.
 * This is a stub implementation - full implementation requires @webcontainer/api.
 */
export class WebContainerSandbox implements SandboxProvider {
  readonly type: SandboxType = 'webcontainer';
  readonly id: string;

  #status: SandboxStatus = 'disconnected';
  #eventListeners: Map<SandboxEventType, Set<SandboxEventListener>> = new Map();
  #webcontainer: any = null;

  constructor(config: SandboxConfig) {
    this.id = config.id;
  }

  get status(): SandboxStatus {
    return this.#status;
  }

  get capabilities(): SandboxCapabilities {
    return {
      shell: true,
      filesystem: true,
      processes: true,
      networking: true,
      websockets: false, // Limited in browser
      persistence: false, // In-memory only
      systemPackages: false, // Cannot install system packages
      maxProcesses: 10,
      maxDiskSpace: 500 * 1024 * 1024, // 500MB
      maxMemory: 512 * 1024 * 1024, // 512MB
    };
  }

  async connect(): Promise<void> {
    this.#status = 'connecting';
    this.emit({ type: 'status', data: { status: 'connecting' }, timestamp: new Date() });

    try {
      // Dynamic import of WebContainer API
      const { WebContainer } = await import('@webcontainer/api');
      this.#webcontainer = await WebContainer.boot();

      this.#status = 'connected';
      this.emit({ type: 'status', data: { status: 'connected' }, timestamp: new Date() });
      logger.info(`Connected to WebContainer sandbox: ${this.id}`);
    } catch (error) {
      this.#status = 'error';
      this.emit({
        type: 'error',
        data: { error: error instanceof Error ? error.message : 'WebContainer boot failed' },
        timestamp: new Date(),
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.#webcontainer) {
      this.#webcontainer.teardown?.();
      this.#webcontainer = null;
    }

    this.#status = 'disconnected';
    this.emit({ type: 'status', data: { status: 'disconnected' }, timestamp: new Date() });
  }

  async healthCheck(): Promise<{ healthy: boolean; latency: number }> {
    const start = Date.now();
    const healthy = this.#webcontainer !== null && this.#status === 'connected';
    return { healthy, latency: Date.now() - start };
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (!this.#webcontainer) throw new Error('WebContainer not initialized');
    await this.#webcontainer.fs.writeFile(path, content);
  }

  async readFile(path: string): Promise<string> {
    if (!this.#webcontainer) throw new Error('WebContainer not initialized');
    const content = await this.#webcontainer.fs.readFile(path, 'utf-8');
    return content;
  }

  async deleteFile(path: string): Promise<void> {
    if (!this.#webcontainer) throw new Error('WebContainer not initialized');
    await this.#webcontainer.fs.rm(path, { recursive: true });
  }

  async listFiles(path: string = '/'): Promise<SandboxFile[]> {
    if (!this.#webcontainer) throw new Error('WebContainer not initialized');

    const entries = await this.#webcontainer.fs.readdir(path, { withFileTypes: true });
    return entries.map((entry: any) => ({
      path: `${path}/${entry.name}`.replace(/\/+/g, '/'),
      type: entry.isDirectory() ? 'directory' : 'file',
    }));
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.readFile(path);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(path: string, recursive: boolean = true): Promise<void> {
    if (!this.#webcontainer) throw new Error('WebContainer not initialized');
    await this.#webcontainer.fs.mkdir(path, { recursive });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    if (!this.#webcontainer) throw new Error('WebContainer not initialized');
    // WebContainer doesn't have native rename, so we copy and delete
    const content = await this.readFile(oldPath);
    await this.writeFile(newPath, content);
    await this.deleteFile(oldPath);
  }

  async writeFiles(
    files: Array<{ path: string; content: string }>
  ): Promise<{ success: boolean; failed: Array<{ path: string; error: string }> }> {
    const failed: Array<{ path: string; error: string }> = [];

    for (const file of files) {
      try {
        await this.writeFile(file.path, file.content);
      } catch (error) {
        failed.push({
          path: file.path,
          error: error instanceof Error ? error.message : 'Write failed',
        });
      }
    }

    return { success: failed.length === 0, failed };
  }

  async exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    if (!this.#webcontainer) throw new Error('WebContainer not initialized');

    const { cwd } = options;
    const [cmd, ...args] = command.split(' ');

    const process = await this.#webcontainer.spawn(cmd, args, { cwd });

    let stdout = '';
    let stderr = '';

    process.output.pipeTo(
      new WritableStream({
        write(data: string) {
          stdout += data;
          options.onStdout?.(data);
        },
      })
    );

    const exitCode = await process.exit;

    return { exitCode, stdout, stderr };
  }

  async spawn(command: string, options: ExecOptions = {}): Promise<SandboxProcess> {
    if (!this.#webcontainer) throw new Error('WebContainer not initialized');

    const { cwd } = options;
    const [cmd, ...args] = command.split(' ');

    const process = await this.#webcontainer.spawn(cmd, args, { cwd });

    return {
      pid: 0, // WebContainer doesn't expose PIDs
      kill: async () => {
        process.kill();
      },
      write: async (data: string) => {
        const writer = process.input.getWriter();
        await writer.write(data);
        writer.releaseLock();
      },
      resize: async (cols: number, rows: number) => {
        process.resize?.({ cols, rows });
      },
      wait: async (): Promise<ExecResult> => {
        const exitCode = await process.exit;
        return { exitCode, stdout: '', stderr: '' };
      },
    };
  }

  async createTerminal(): Promise<SandboxTerminal> {
    if (!this.#webcontainer) throw new Error('WebContainer not initialized');

    const process = await this.#webcontainer.spawn('jsh');

    // Create a fake WebSocket-like interface
    const terminal: SandboxTerminal = {
      id: `wc-terminal-${Date.now()}`,
      ws: null as any, // WebContainer uses streams, not WebSockets
      write: (data: string) => {
        const writer = process.input.getWriter();
        writer.write(data);
        writer.releaseLock();
      },
      resize: (cols: number, rows: number) => {
        process.resize?.({ cols, rows });
      },
      close: () => {
        process.kill();
      },
      kill: () => {
        process.kill();
      },
    };

    // Pipe output
    process.output.pipeTo(
      new WritableStream({
        write: (data: string) => {
          this.emit({
            type: 'output',
            data: { terminalId: terminal.id, output: data },
            timestamp: new Date(),
          });
        },
      })
    );

    return terminal;
  }

  async getPreviewUrl(port: number): Promise<string> {
    if (!this.#webcontainer) throw new Error('WebContainer not initialized');
    // WebContainer provides URLs through the server-ready event
    return `http://localhost:${port}`;
  }

  async getPreviewInfo(): Promise<PreviewInfo[]> {
    // WebContainer doesn't have a direct API for this
    return [];
  }

  async waitForPort(port: number, timeout: number = 30000): Promise<boolean> {
    if (!this.#webcontainer) return false;

    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeout);

      this.#webcontainer.on('server-ready', (p: number, url: string) => {
        if (p === port) {
          clearTimeout(timer);
          resolve(true);
        }
      });
    });
  }

  async getResourceUsage(): Promise<ResourceUsage> {
    // WebContainer doesn't expose resource metrics
    return {
      cpu: 0,
      memoryUsed: 0,
      memoryLimit: 512 * 1024 * 1024,
      diskUsed: 0,
      diskLimit: 500 * 1024 * 1024,
      networkRx: 0,
      networkTx: 0,
    };
  }

  on(event: SandboxEventType, listener: SandboxEventListener): () => void {
    if (!this.#eventListeners.has(event)) {
      this.#eventListeners.set(event, new Set());
    }
    this.#eventListeners.get(event)!.add(listener);

    return () => {
      this.#eventListeners.get(event)?.delete(listener);
    };
  }

  emit(event: SandboxEvent): void {
    const listeners = this.#eventListeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          logger.error('Event listener error:', error);
        }
      }
    }
  }
}

// ============================================================================
// E2B Sandbox Implementation (Stub)
// ============================================================================

/**
 * E2B cloud sandbox implementation.
 * This is a stub implementation - full implementation requires @e2b/sdk.
 */
export class E2BSandbox implements SandboxProvider {
  readonly type: SandboxType = 'e2b';
  readonly id: string;

  #status: SandboxStatus = 'disconnected';
  #eventListeners: Map<SandboxEventType, Set<SandboxEventListener>> = new Map();
  #sandbox: any = null;
  #apiKey: string;
  #template: string;

  constructor(config: SandboxConfig & { apiKey?: string }) {
    this.id = config.id;
    this.#apiKey = config.apiKey || process.env.E2B_API_KEY || '';
    this.#template = config.template || 'base';
  }

  get status(): SandboxStatus {
    return this.#status;
  }

  get capabilities(): SandboxCapabilities {
    return {
      shell: true,
      filesystem: true,
      processes: true,
      networking: true,
      websockets: true,
      persistence: false, // Ephemeral by default
      systemPackages: true,
      maxProcesses: 50,
      maxDiskSpace: 5 * 1024 * 1024 * 1024, // 5GB
      maxMemory: 2 * 1024 * 1024 * 1024, // 2GB
    };
  }

  async connect(): Promise<void> {
    this.#status = 'connecting';
    this.emit({ type: 'status', data: { status: 'connecting' }, timestamp: new Date() });

    try {
      // Dynamic import of E2B SDK
      const { Sandbox } = await (import('@e2b/code-interpreter' /* optional dep */) as Promise<{ Sandbox: any }>);
      this.#sandbox = await Sandbox.create(this.#template, { apiKey: this.#apiKey });

      this.#status = 'connected';
      this.emit({ type: 'status', data: { status: 'connected' }, timestamp: new Date() });
      logger.info(`Connected to E2B sandbox: ${this.id}`);
    } catch (error) {
      this.#status = 'error';
      this.emit({
        type: 'error',
        data: { error: error instanceof Error ? error.message : 'E2B connection failed' },
        timestamp: new Date(),
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.#sandbox) {
      await this.#sandbox.close();
      this.#sandbox = null;
    }

    this.#status = 'disconnected';
    this.emit({ type: 'status', data: { status: 'disconnected' }, timestamp: new Date() });
  }

  async healthCheck(): Promise<{ healthy: boolean; latency: number }> {
    const start = Date.now();
    const healthy = this.#sandbox !== null && this.#status === 'connected';
    return { healthy, latency: Date.now() - start };
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (!this.#sandbox) throw new Error('E2B sandbox not initialized');
    await this.#sandbox.filesystem.write(path, content);
  }

  async readFile(path: string): Promise<string> {
    if (!this.#sandbox) throw new Error('E2B sandbox not initialized');
    return await this.#sandbox.filesystem.read(path);
  }

  async deleteFile(path: string): Promise<void> {
    if (!this.#sandbox) throw new Error('E2B sandbox not initialized');
    await this.#sandbox.filesystem.remove(path);
  }

  async listFiles(path: string = '/'): Promise<SandboxFile[]> {
    if (!this.#sandbox) throw new Error('E2B sandbox not initialized');

    const entries = await this.#sandbox.filesystem.list(path);
    return entries.map((entry: any) => ({
      path: `${path}/${entry.name}`.replace(/\/+/g, '/'),
      type: entry.isDir ? 'directory' : 'file',
    }));
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.readFile(path);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(path: string, recursive: boolean = true): Promise<void> {
    if (!this.#sandbox) throw new Error('E2B sandbox not initialized');
    await this.#sandbox.filesystem.makeDir(path);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    if (!this.#sandbox) throw new Error('E2B sandbox not initialized');
    // E2B doesn't have native rename, so we copy and delete
    const content = await this.readFile(oldPath);
    await this.writeFile(newPath, content);
    await this.deleteFile(oldPath);
  }

  async writeFiles(
    files: Array<{ path: string; content: string }>
  ): Promise<{ success: boolean; failed: Array<{ path: string; error: string }> }> {
    const failed: Array<{ path: string; error: string }> = [];

    for (const file of files) {
      try {
        await this.writeFile(file.path, file.content);
      } catch (error) {
        failed.push({
          path: file.path,
          error: error instanceof Error ? error.message : 'Write failed',
        });
      }
    }

    return { success: failed.length === 0, failed };
  }

  async exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    if (!this.#sandbox) throw new Error('E2B sandbox not initialized');

    const { cwd, timeout = 30000 } = options;

    const result = await this.#sandbox.process.start({
      cmd: command,
      cwd,
      timeout: timeout / 1000,
    });

    await result.wait();

    return {
      exitCode: result.exitCode || 0,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    };
  }

  async spawn(command: string, options: ExecOptions = {}): Promise<SandboxProcess> {
    if (!this.#sandbox) throw new Error('E2B sandbox not initialized');

    const { cwd } = options;

    const process = await this.#sandbox.process.start({
      cmd: command,
      cwd,
      onStdout: options.onStdout,
      onStderr: options.onStderr,
    });

    return {
      pid: 0, // E2B abstracts PIDs
      kill: async () => {
        await process.kill();
      },
      write: async (data: string) => {
        await process.sendStdin(data);
      },
      wait: async (): Promise<ExecResult> => {
        await process.wait();
        return {
          exitCode: process.exitCode || 0,
          stdout: process.stdout || '',
          stderr: process.stderr || '',
        };
      },
    };
  }

  async createTerminal(): Promise<SandboxTerminal> {
    if (!this.#sandbox) throw new Error('E2B sandbox not initialized');

    const process = await this.#sandbox.process.start({ cmd: '/bin/bash' });

    const terminal: SandboxTerminal = {
      id: `e2b-terminal-${Date.now()}`,
      ws: null as any, // E2B uses its own streaming mechanism
      write: (data: string) => {
        process.sendStdin(data);
      },
      resize: () => {
        // E2B handles terminal sizing differently
      },
      close: () => {
        process.kill();
      },
      kill: () => {
        process.kill();
      },
    };

    return terminal;
  }

  async getPreviewUrl(port: number): Promise<string> {
    if (!this.#sandbox) throw new Error('E2B sandbox not initialized');
    return this.#sandbox.getHostname(port);
  }

  async getPreviewInfo(): Promise<PreviewInfo[]> {
    // E2B doesn't have a direct API for listing open ports
    return [];
  }

  async waitForPort(port: number, timeout: number = 30000): Promise<boolean> {
    // E2B automatically handles port readiness
    return true;
  }

  async getResourceUsage(): Promise<ResourceUsage> {
    // E2B doesn't expose detailed resource metrics
    return {
      cpu: 0,
      memoryUsed: 0,
      memoryLimit: 2 * 1024 * 1024 * 1024,
      diskUsed: 0,
      diskLimit: 5 * 1024 * 1024 * 1024,
      networkRx: 0,
      networkTx: 0,
    };
  }

  on(event: SandboxEventType, listener: SandboxEventListener): () => void {
    if (!this.#eventListeners.has(event)) {
      this.#eventListeners.set(event, new Set());
    }
    this.#eventListeners.get(event)!.add(listener);

    return () => {
      this.#eventListeners.get(event)?.delete(listener);
    };
  }

  emit(event: SandboxEvent): void {
    const listeners = this.#eventListeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          logger.error('Event listener error:', error);
        }
      }
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Detect the best sandbox type for the current environment
 */
export function detectSandboxType(): SandboxType {
  // Check for server-side rendering
  if (typeof window === 'undefined') {
    return 'docker';
  }

  // Check if docker-backend is available
  if (DOCKER_URL) {
    return 'docker';
  }

  // Check if WebContainer is supported
  if ('SharedArrayBuffer' in globalThis) {
    return 'webcontainer';
  }

  // Fallback to E2B if configured
  if (process.env.E2B_API_KEY) {
    return 'e2b';
  }

  // Default to docker
  return 'docker';
}

/**
 * Create a sandbox provider based on type
 */
export function createSandbox(
  type: SandboxType,
  config: SandboxConfig & { apiKey?: string }
): SandboxProvider {
  switch (type) {
    case 'docker':
      return new DockerSandbox(config);
    case 'webcontainer':
      return new WebContainerSandbox(config);
    case 'e2b':
      return new E2BSandbox(config);
    default:
      throw new Error(`Unknown sandbox type: ${type}`);
  }
}

/**
 * Create a sandbox provider automatically based on environment
 */
export function createAutoSandbox(config: SandboxConfig & { apiKey?: string }): SandboxProvider {
  const type = detectSandboxType();
  logger.info(`Auto-detected sandbox type: ${type}`);
  return createSandbox(type, config);
}

// ============================================================================
// Singleton Management
// ============================================================================

const sandboxInstances = new Map<string, SandboxProvider>();

/**
 * Get or create a sandbox instance for a project
 */
export async function getSandbox(
  projectId: string,
  options?: { type?: SandboxType; apiKey?: string }
): Promise<SandboxProvider> {
  const existingInstance = sandboxInstances.get(projectId);

  if (existingInstance) {
    // If type is specified and different, create new instance
    if (options?.type && existingInstance.type !== options.type) {
      await existingInstance.disconnect();
      sandboxInstances.delete(projectId);
    } else {
      return existingInstance;
    }
  }

  const type = options?.type || detectSandboxType();
  const sandbox = createSandbox(type, {
    id: projectId,
    apiKey: options?.apiKey,
  });

  sandboxInstances.set(projectId, sandbox);
  return sandbox;
}

/**
 * Remove a sandbox instance
 */
export async function removeSandbox(projectId: string): Promise<void> {
  const sandbox = sandboxInstances.get(projectId);
  if (sandbox) {
    await sandbox.disconnect();
    sandboxInstances.delete(projectId);
  }
}

/**
 * Get all active sandbox instances
 */
export function getActiveSandboxes(): Map<string, SandboxProvider> {
  return new Map(sandboxInstances);
}
