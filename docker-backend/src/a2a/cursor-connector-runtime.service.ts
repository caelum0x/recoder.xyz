/**
 * @module cursor-connector-runtime.service
 *
 * Runtime service that spawns and manages Cursor IDE bridge processes.
 *
 * Cursor exposes a bridge mode (protocol TBD) for programmatic access.
 * This service follows the same pattern as Claude/Codex connectors:
 *
 * 1. **Spawns** the `cursor` child process with bridge arguments.
 * 2. **Communicates** via JSON-RPC 2.0 over stdin/stdout.
 * 3. **Matches** pending requests to responses by JSON-RPC `id`.
 * 4. **Executes** tasks by converting TaskEnvelopes to Cursor wire format.
 * 5. **Streams** partial responses via an EventEmitter.
 * 6. **Manages** process lifecycle: start, stop, restart, health checks.
 * 7. **Handles** errors: process crash, timeout, stderr.
 *
 * NOTE: This is a Tier-2 scaffold. The wire protocol methods are stubbed
 * pending Cursor's bridge API specification (RFC: shared/src/a2a/rfcs/tier2/cursor.md).
 *
 * Consumed by: cursor-connector.routes.ts, server.ts
 */

import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import type {
  RecoderA2AEnvelope,
  RecoderAgentIdentity,
} from '@recoder/shared/a2a';
import { getTaskLifecycleService } from './task-lifecycle.service';
import { getAgentRegistryService } from './agent-registry.service';
import { createLogger } from '../logger';

const logger = createLogger('cursor-connector-runtime');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CursorConnectorStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';

export interface CursorConnectorConfig {
  /** The command to run (defaults to 'cursor'). */
  command: string;
  /** Arguments to pass to the command (defaults to ['--bridge']). */
  args: string[];
  /** Additional environment variables for the child process. */
  env?: Record<string, string>;
  /** Working directory for the child process. */
  cwd?: string;
  /** Timeout for individual requests in milliseconds. */
  requestTimeoutMs: number;
  /** Timeout for startup in milliseconds. */
  startupTimeoutMs: number;
  /** Maximum number of automatic restart attempts. */
  maxRestartAttempts: number;
  /** Delay between restart attempts in milliseconds. */
  restartDelayMs: number;
  /** Whether to auto-restart on process crash. */
  autoRestart: boolean;
}

export interface CursorConnectorState {
  status: CursorConnectorStatus;
  pid: number | null;
  startedAt: string | null;
  lastActivity: string | null;
  restartCount: number;
  error: string | null;
  pendingRequests: number;
}

export interface CursorExecuteInput {
  taskId: string;
  prompt: string;
  requester: RecoderAgentIdentity;
  workspaceId?: string;
  threadId?: string;
  artifacts?: Array<{ filename: string; content: string }>;
}

export interface CursorExecuteResult {
  taskId: string;
  success: boolean;
  resultText?: string;
  error?: string;
  artifacts?: Array<{ filename: string; content: string }>;
  raw?: unknown;
  envelope?: RecoderA2AEnvelope;
}

export interface CursorStreamChunk {
  taskId: string;
  type: 'progress' | 'partial' | 'complete' | 'error';
  content?: string;
  raw?: unknown;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  method: string;
  createdAt: number;
  timer: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: CursorConnectorConfig = {
  command: process.env.CURSOR_COMMAND || 'cursor',
  args: (process.env.CURSOR_ARGS || '--bridge').split(','),
  env: {},
  cwd: process.env.CURSOR_CWD || undefined,
  requestTimeoutMs: Number(process.env.CURSOR_CONNECTOR_REQUEST_TIMEOUT_MS || 120_000),
  startupTimeoutMs: Number(process.env.CURSOR_CONNECTOR_STARTUP_TIMEOUT_MS || 30_000),
  maxRestartAttempts: Number(process.env.CURSOR_CONNECTOR_MAX_RESTART_ATTEMPTS || 3),
  restartDelayMs: Number(process.env.CURSOR_CONNECTOR_RESTART_DELAY_MS || 2_000),
  autoRestart: process.env.CURSOR_CONNECTOR_AUTO_RESTART !== 'false',
};

// ---------------------------------------------------------------------------
// Agent identity for the Cursor connector
// ---------------------------------------------------------------------------

const CURSOR_CONNECTOR_IDENTITY: RecoderAgentIdentity = {
  id: 'cursor-connector',
  name: 'Cursor IDE Connector',
  platform: 'cursor',
};

// ---------------------------------------------------------------------------
// CursorConnectorRuntime
// ---------------------------------------------------------------------------

export class CursorConnectorRuntime extends EventEmitter {
  private config: CursorConnectorConfig;
  private _process: ChildProcess | null = null;
  private status: CursorConnectorStatus = 'stopped';
  private pendingRequests = new Map<string, PendingRequest>();
  private requestIdCounter = 0;
  private buffer = '';
  private startedAt: string | null = null;
  private lastActivity: string | null = null;
  private restartCount = 0;
  private lastError: string | null = null;
  private stderrBuffer: string[] = [];

  /** Implements ConnectorProcess.connectorId */
  readonly connectorId = 'cursor';
  /** Implements ConnectorProcess.platform */
  readonly platform = 'cursor' as const;

  constructor(config?: Partial<CursorConnectorConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  get processRef(): ChildProcess | null {
    return this._process;
  }

  isRunning(): boolean {
    return this.status === 'running';
  }

  getState(): CursorConnectorState {
    return {
      status: this.status,
      pid: this._process?.pid ?? null,
      startedAt: this.startedAt,
      lastActivity: this.lastActivity,
      restartCount: this.restartCount,
      error: this.lastError,
      pendingRequests: this.pendingRequests.size,
    };
  }

  getPid(): number | null {
    return this._process?.pid ?? null;
  }

  getHealth() {
    const now = new Date().toISOString();
    if (this.status === 'running') {
      const uptime = this.startedAt
        ? Date.now() - new Date(this.startedAt).getTime()
        : 0;
      return {
        status: 'healthy' as const,
        pid: this.getPid(),
        uptime,
        lastCheckedAt: now,
      };
    }
    return {
      status: (this.status === 'error' ? 'unhealthy' : 'unknown') as 'unhealthy' | 'unknown',
      pid: null,
      uptime: 0,
      lastCheckedAt: now,
      message: this.lastError || `Connector is ${this.status}`,
    };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.status === 'running') {
      logger.warn('Cursor connector is already running');
      return;
    }

    this.status = 'starting';
    this.lastError = null;
    this.emit('starting');

    try {
      await this.spawnProcess();
      this.status = 'running';
      this.startedAt = new Date().toISOString();
      this.emit('started', { pid: this._process?.pid });
      logger.info({ pid: this._process?.pid }, 'Cursor connector started');
    } catch (err) {
      this.status = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.status === 'stopped') return;

    this.status = 'stopping';
    this.emit('stopping');

    // Reject all pending requests
    for (const [id, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error('Connector stopping'));
      this.pendingRequests.delete(id);
    }

    if (this._process) {
      const proc = this._process;
      this._process = null;

      // Graceful: SIGTERM then force-kill after 5s
      await new Promise<void>((resolve) => {
        const forceKillTimer = setTimeout(() => {
          try { proc.kill('SIGKILL'); } catch { /* already dead */ }
          resolve();
        }, 5_000);

        proc.once('exit', () => {
          clearTimeout(forceKillTimer);
          resolve();
        });

        try { proc.kill('SIGTERM'); } catch { resolve(); }
      });
    }

    this.status = 'stopped';
    this.emit('stopped');
    logger.info('Cursor connector stopped');
  }

  async restart(): Promise<void> {
    await this.stop();
    this.restartCount++;
    await this.start();
  }

  // -------------------------------------------------------------------------
  // Task execution (Tier-2 stub — wire protocol TBD)
  // -------------------------------------------------------------------------

  /**
   * Execute a task via the Cursor bridge.
   *
   * NOTE: This is a stub. The actual wire protocol (method names, payload
   * schemas) will be implemented once Cursor's bridge API spec is available.
   * See: shared/src/a2a/rfcs/tier2/cursor.md
   */
  async executeTask(input: CursorExecuteInput): Promise<CursorExecuteResult> {
    if (!this.isRunning()) {
      return {
        taskId: input.taskId,
        success: false,
        error: 'Cursor connector is not running',
      };
    }

    this.lastActivity = new Date().toISOString();

    try {
      // Transition task to 'working' state
      const lifecycle = getTaskLifecycleService();
      lifecycle.startTask(input.taskId, CURSOR_CONNECTOR_IDENTITY.id);

      // --- STUB: Send request to Cursor bridge ---
      // When the wire protocol is known, this will call:
      //   const wireMsg = envelopeToCursor(envelope);
      //   const response = await this.sendJsonRpc('cursor/execute', wireMsg);
      //   const result = cursorToEnvelope(response);
      const response = await this.sendJsonRpc('cursor/execute', {
        prompt: input.prompt,
        workspace_id: input.workspaceId,
        thread_id: input.threadId,
        artifacts: input.artifacts,
      });

      const resultText = typeof response === 'string' ? response : JSON.stringify(response);

      // Transition task to 'completed'
      lifecycle.completeTask(
        input.taskId,
        { text: resultText, data: { raw: response } },
        CURSOR_CONNECTOR_IDENTITY.id,
      );

      return {
        taskId: input.taskId,
        success: true,
        resultText,
        raw: response,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // Transition task to 'failed'
      try {
        const lifecycle = getTaskLifecycleService();
        lifecycle.failTask(
          input.taskId,
          {
            code: 'CONNECTOR_ERROR',
            category: 'connector',
            message: errMsg,
            severity: 'high',
            retryable: true,
          },
          CURSOR_CONNECTOR_IDENTITY.id,
        );
      } catch { /* best effort */ }

      return {
        taskId: input.taskId,
        success: false,
        error: errMsg,
      };
    }
  }

  // -------------------------------------------------------------------------
  // JSON-RPC communication
  // -------------------------------------------------------------------------

  private sendJsonRpc(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this._process?.stdin?.writable) {
        return reject(new Error('Cursor process stdin is not writable'));
      }

      const id = String(++this.requestIdCounter);
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      }) + '\n';

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Cursor JSON-RPC request timed out after ${this.config.requestTimeoutMs}ms (method: ${method})`));
      }, this.config.requestTimeoutMs);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        method,
        createdAt: Date.now(),
        timer,
      });

      this._process.stdin.write(message, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingRequests.delete(id);
          reject(new Error(`Failed to write to Cursor process: ${err.message}`));
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // Process management
  // -------------------------------------------------------------------------

  private spawnProcess(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const env = { ...process.env, ...this.config.env };

      logger.info(
        { cmd: this.config.command, args: this.config.args },
        'Spawning Cursor bridge process',
      );

      const proc = spawn(this.config.command, this.config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        cwd: this.config.cwd,
      });

      this._process = proc;

      // Track process exit
      proc.once('exit', (code, signal) => {
        logger.info({ code, signal }, 'Cursor process exited');
        const wasRunning = this.status === 'running';
        this._process = null;

        if (wasRunning && this.config.autoRestart && this.restartCount < this.config.maxRestartAttempts) {
          this.status = 'error';
          this.lastError = `Process exited with code ${code}, signal ${signal}`;
          this.emit('crashed', { code, signal });

          setTimeout(() => {
            this.restartCount++;
            this.start().catch((e) => {
              logger.error({ err: e }, 'Auto-restart failed');
            });
          }, this.config.restartDelayMs);
        } else if (wasRunning) {
          this.status = 'error';
          this.lastError = `Process exited with code ${code}, signal ${signal}`;
          this.emit('crashed', { code, signal });
        }
      });

      proc.on('error', (err) => {
        logger.error({ err: err.message }, 'Cursor process error');
        this.lastError = err.message;
        reject(err);
      });

      // Handle stdout (JSON-RPC responses)
      proc.stdout?.on('data', (chunk: Buffer) => {
        this.buffer += chunk.toString();
        this.processBuffer();
      });

      // Capture stderr for diagnostics
      proc.stderr?.on('data', (chunk: Buffer) => {
        const line = chunk.toString().trim();
        if (line) {
          this.stderrBuffer.push(line);
          if (this.stderrBuffer.length > 50) this.stderrBuffer.shift();
          logger.debug({ stderr: line }, 'Cursor stderr');
        }
      });

      // Wait for process to be ready (or timeout)
      const startupTimeout = setTimeout(() => {
        if (this.status === 'starting') {
          reject(new Error(`Cursor process failed to start within ${this.config.startupTimeoutMs}ms`));
        }
      }, this.config.startupTimeoutMs);

      // Check if the process spawned successfully
      const checkReady = setTimeout(() => {
        clearTimeout(startupTimeout);
        if (proc.pid && !proc.killed) {
          resolve();
        } else {
          reject(new Error('Cursor process failed to spawn'));
        }
      }, 500);

      proc.once('error', () => {
        clearTimeout(startupTimeout);
        clearTimeout(checkReady);
      });
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const msg = JSON.parse(trimmed);
        this.handleJsonRpcMessage(msg);
      } catch {
        logger.debug({ raw: trimmed }, 'Non-JSON line from Cursor');
      }
    }
  }

  private handleJsonRpcMessage(msg: { id?: string; result?: unknown; error?: { code: number; message: string; data?: unknown } }): void {
    this.lastActivity = new Date().toISOString();

    if (msg.id && this.pendingRequests.has(msg.id)) {
      const pending = this.pendingRequests.get(msg.id)!;
      clearTimeout(pending.timer);
      this.pendingRequests.delete(msg.id);

      if (msg.error) {
        pending.reject(new Error(`Cursor JSON-RPC error ${msg.error.code}: ${msg.error.message}`));
      } else {
        pending.resolve(msg.result);
      }
    }

    // Emit for stream subscribers
    this.emit('message', msg);
  }

  // -------------------------------------------------------------------------
  // Agent registry integration
  // -------------------------------------------------------------------------

  registerWithAgentRegistry(): void {
    try {
      const registry = getAgentRegistryService();
      registry.registerAgent({
        agent_id: CURSOR_CONNECTOR_IDENTITY.id,
        name: CURSOR_CONNECTOR_IDENTITY.name,
        platform: 'cursor',
        capabilities: ['execute', 'code-edit', 'code-review'],
        url: '',
        metadata: {
          connector_type: 'cursor-bridge',
          tier: 'tier-2',
          status: 'pilot',
        },
      });
      logger.info('Cursor connector registered with agent registry');
    } catch (err) {
      logger.warn({ err }, 'Failed to register Cursor connector with agent registry');
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: CursorConnectorRuntime | null = null;

export function getCursorConnectorRuntime(config?: Partial<CursorConnectorConfig>): CursorConnectorRuntime {
  if (!instance) {
    instance = new CursorConnectorRuntime(config);
  }
  return instance;
}

export function resetCursorConnectorRuntime(): void {
  if (instance?.isRunning()) {
    instance.stop().catch(() => { /* best effort */ });
  }
  instance = null;
}

export function getCursorConnectorIdentity(): RecoderAgentIdentity {
  return { ...CURSOR_CONNECTOR_IDENTITY };
}
