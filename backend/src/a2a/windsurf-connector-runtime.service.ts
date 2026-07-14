/**
 * @module windsurf-connector-runtime.service
 *
 * Runtime service that spawns and manages Windsurf IDE bridge processes.
 *
 * Windsurf exposes a bridge mode (protocol TBD) for programmatic access.
 * This service follows the same pattern as Claude/Codex/Cursor connectors:
 *
 * 1. **Spawns** the `windsurf` child process with bridge arguments.
 * 2. **Communicates** via JSON-RPC 2.0 over stdin/stdout.
 * 3. **Matches** pending requests to responses by JSON-RPC `id`.
 * 4. **Executes** tasks by converting TaskEnvelopes to Windsurf wire format.
 * 5. **Streams** partial responses via an EventEmitter.
 * 6. **Manages** process lifecycle: start, stop, restart, health checks.
 * 7. **Handles** errors: process crash, timeout, stderr.
 *
 * NOTE: Windsurf's exact bridge method names are configurable because the
 * public wire protocol is still settling. The runtime now treats execute,
 * task-status, cancel, and approval as first-class JSON-RPC operations
 * instead of faking control-plane state only in the local lifecycle layer.
 *
 * Consumed by: windsurf-connector.routes.ts, server.ts
 */

import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import type {
  RecoderA2AEnvelope,
  RecoderAgentIdentity,
} from '@recoder/shared/a2a';
import { getTaskLifecycleService } from './task-lifecycle.service';
import { getAgentRegistryService } from './agent-registry.service';
import { getA2AEventBus, A2AEventType } from './a2a-event-bus';
import { extractTaskStreamChunk } from './task-stream-payload';
import { createLogger } from '../logger';

const logger = createLogger('windsurf-connector-runtime');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WindsurfConnectorStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';

export interface WindsurfConnectorConfig {
  /** The command to run (defaults to 'windsurf'). */
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
  /** JSON-RPC method used to execute a task. */
  executeMethod: string;
  /** JSON-RPC method used to query task status. */
  taskStatusMethod: string;
  /** JSON-RPC method used to cancel a task. */
  cancelMethod: string;
  /** JSON-RPC method used to respond to an approval request. */
  approvalResponseMethod: string;
  /** Notification method emitted by the bridge when approval is required. */
  approvalRequestMethod: string;
  /** Notification method emitted by the bridge for task progress/state. */
  taskUpdateMethod: string;
}

export interface WindsurfConnectorState {
  status: WindsurfConnectorStatus;
  pid: number | null;
  startedAt: string | null;
  lastActivity: string | null;
  restartCount: number;
  error: string | null;
  pendingRequests: number;
  activeTasks: number;
}

export interface WindsurfExecuteInput {
  taskId: string;
  prompt: string;
  requester: RecoderAgentIdentity;
  workspaceId?: string;
  threadId?: string;
  artifacts?: Array<{ filename: string; content: string }>;
}

export interface WindsurfExecuteResult {
  taskId: string;
  success: boolean;
  resultText?: string;
  error?: string;
  artifacts?: Array<{ filename: string; content: string }>;
  raw?: unknown;
  envelope?: RecoderA2AEnvelope;
}

export interface WindsurfStreamChunk {
  taskId: string;
  type: 'progress' | 'partial' | 'complete' | 'error';
  content?: string;
  raw?: unknown;
}

export interface WindsurfApprovalRequest {
  taskId: string;
  approvalId: string;
  action?: string;
  description?: string;
  details?: Record<string, unknown>;
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

const DEFAULT_CONFIG: WindsurfConnectorConfig = {
  command: process.env.WINDSURF_COMMAND || 'windsurf',
  args: (process.env.WINDSURF_ARGS || '--bridge').split(','),
  env: {},
  cwd: process.env.WINDSURF_CWD || undefined,
  requestTimeoutMs: Number(process.env.WINDSURF_CONNECTOR_REQUEST_TIMEOUT_MS || 120_000),
  startupTimeoutMs: Number(process.env.WINDSURF_CONNECTOR_STARTUP_TIMEOUT_MS || 30_000),
  maxRestartAttempts: Number(process.env.WINDSURF_CONNECTOR_MAX_RESTART_ATTEMPTS || 3),
  restartDelayMs: Number(process.env.WINDSURF_CONNECTOR_RESTART_DELAY_MS || 2_000),
  autoRestart: process.env.WINDSURF_CONNECTOR_AUTO_RESTART !== 'false',
  executeMethod: process.env.WINDSURF_EXECUTE_METHOD || 'windsurf/execute',
  taskStatusMethod: process.env.WINDSURF_TASK_STATUS_METHOD || 'tasks/get',
  cancelMethod: process.env.WINDSURF_CANCEL_METHOD || 'tasks/cancel',
  approvalResponseMethod: process.env.WINDSURF_APPROVAL_RESPONSE_METHOD || 'approvals/respond',
  approvalRequestMethod: process.env.WINDSURF_APPROVAL_REQUEST_METHOD || 'approvals/request',
  taskUpdateMethod: process.env.WINDSURF_TASK_UPDATE_METHOD || 'tasks/update',
};

// ---------------------------------------------------------------------------
// Agent identity for the Windsurf connector
// ---------------------------------------------------------------------------

const WINDSURF_CONNECTOR_IDENTITY: RecoderAgentIdentity = {
  id: 'windsurf-connector',
  name: 'Windsurf IDE Connector',
  platform: 'windsurf',
};

// ---------------------------------------------------------------------------
// WindsurfConnectorRuntime
// ---------------------------------------------------------------------------

export class WindsurfConnectorRuntime extends EventEmitter {
  private config: WindsurfConnectorConfig;
  private _process: ChildProcess | null = null;
  private status: WindsurfConnectorStatus = 'stopped';
  private pendingRequests = new Map<string, PendingRequest>();
  private requestIdCounter = 0;
  private buffer = '';
  private startedAt: string | null = null;
  private lastActivity: string | null = null;
  private restartCount = 0;
  private lastError: string | null = null;
  private stderrBuffer: string[] = [];
  private activeTasks = new Set<string>();
  private taskContexts = new Map<string, { workspaceId?: string; threadId?: string }>();

  /** Implements ConnectorProcess.connectorId */
  readonly connectorId = 'windsurf';
  /** Implements ConnectorProcess.platform */
  readonly platform = 'windsurf' as const;

  constructor(config?: Partial<WindsurfConnectorConfig>) {
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

  getState(): WindsurfConnectorState {
    return {
      status: this.status,
      pid: this._process?.pid ?? null,
      startedAt: this.startedAt,
      lastActivity: this.lastActivity,
      restartCount: this.restartCount,
      error: this.lastError,
      pendingRequests: this.pendingRequests.size,
      activeTasks: this.activeTasks.size,
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
      logger.warn('Windsurf connector is already running');
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
      logger.info({ pid: this._process?.pid }, 'Windsurf connector started');
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
    this.activeTasks.clear();

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
    logger.info('Windsurf connector stopped');
  }

  async restart(): Promise<void> {
    await this.stop();
    this.restartCount++;
    await this.start();
  }

  // -------------------------------------------------------------------------
  // Task execution
  // -------------------------------------------------------------------------

  /**
   * Execute a task via the Windsurf bridge.
   */
  async executeTask(input: WindsurfExecuteInput): Promise<WindsurfExecuteResult> {
    if (!this.isRunning()) {
      return {
        taskId: input.taskId,
        success: false,
        error: 'Windsurf connector is not running',
      };
    }

    this.lastActivity = new Date().toISOString();
    this.activeTasks.add(input.taskId);
    this.taskContexts.set(input.taskId, {
      workspaceId: input.workspaceId,
      threadId: input.threadId,
    });

    try {
      // Transition task to 'working' state
      const lifecycle = getTaskLifecycleService();
      lifecycle.startTask(input.taskId, WINDSURF_CONNECTOR_IDENTITY.id);

      const response = await this.sendJsonRpc(this.config.executeMethod, {
        id: input.taskId,
        prompt: input.prompt,
        workspace_id: input.workspaceId,
        thread_id: input.threadId,
        artifacts: input.artifacts,
      });

      const responseObj = response as Record<string, unknown> | string | null;
      const resultText =
        typeof responseObj === 'string'
          ? responseObj
          : typeof responseObj?.result === 'string'
            ? responseObj.result
            : typeof responseObj?.message === 'string'
              ? responseObj.message
              : JSON.stringify(response);

      // Transition task to 'completed'
      lifecycle.completeTask(
        input.taskId,
        { text: resultText, data: { raw: response } },
        WINDSURF_CONNECTOR_IDENTITY.id,
      );
      this.publishTaskStream(input.taskId, resultText, true);
      this.activeTasks.delete(input.taskId);
      this.taskContexts.delete(input.taskId);

      return {
        taskId: input.taskId,
        success: true,
        resultText,
        raw: response,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.activeTasks.delete(input.taskId);
      this.taskContexts.delete(input.taskId);
      this.publishTaskStream(input.taskId, errMsg, true);

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
          WINDSURF_CONNECTOR_IDENTITY.id,
        );
      } catch { /* best effort */ }

      return {
        taskId: input.taskId,
        success: false,
        error: errMsg,
      };
    }
  }

  async getTaskStatus(taskId: string): Promise<unknown> {
    return this.sendJsonRpc(this.config.taskStatusMethod, { id: taskId });
  }

  async cancelTask(taskId: string, reason?: string): Promise<unknown> {
    this.activeTasks.delete(taskId);
    return this.sendJsonRpc(this.config.cancelMethod, { id: taskId, reason });
  }

  async respondToApproval(
    approvalId: string,
    approved: boolean,
    reason?: string,
  ): Promise<unknown> {
    return this.sendJsonRpc(this.config.approvalResponseMethod, {
      id: approvalId,
      approved,
      reason,
    });
  }

  // -------------------------------------------------------------------------
  // JSON-RPC communication
  // -------------------------------------------------------------------------

  private sendJsonRpc(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this._process?.stdin?.writable) {
        return reject(new Error('Windsurf process stdin is not writable'));
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
        reject(new Error(`Windsurf JSON-RPC request timed out after ${this.config.requestTimeoutMs}ms (method: ${method})`));
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
          reject(new Error(`Failed to write to Windsurf process: ${err.message}`));
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
        'Spawning Windsurf bridge process',
      );

      const proc = spawn(this.config.command, this.config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        cwd: this.config.cwd,
      });

      this._process = proc;

      // Track process exit
      proc.once('exit', (code, signal) => {
        logger.info({ code, signal }, 'Windsurf process exited');
        const wasRunning = this.status === 'running';
        this._process = null;
        this.rejectAllPending(`Windsurf process exited (code=${code}, signal=${signal})`);
        this.activeTasks.clear();

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
        logger.error({ err: err.message }, 'Windsurf process error');
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
          logger.debug({ stderr: line }, 'Windsurf stderr');
        }
      });

      // Wait for process to be ready (or timeout)
      const startupTimeout = setTimeout(() => {
        if (this.status === 'starting') {
          reject(new Error(`Windsurf process failed to start within ${this.config.startupTimeoutMs}ms`));
        }
      }, this.config.startupTimeoutMs);

      // Check if the process spawned successfully
      const checkReady = setTimeout(() => {
        clearTimeout(startupTimeout);
        if (proc.pid && !proc.killed) {
          resolve();
        } else {
          reject(new Error('Windsurf process failed to spawn'));
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
        logger.debug({ raw: trimmed }, 'Non-JSON line from Windsurf');
      }
    }
  }

  private handleJsonRpcMessage(msg: {
    id?: string;
    method?: string;
    params?: Record<string, unknown>;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
  }): void {
    this.lastActivity = new Date().toISOString();

    if (msg.id && this.pendingRequests.has(msg.id)) {
      const pending = this.pendingRequests.get(msg.id)!;
      clearTimeout(pending.timer);
      this.pendingRequests.delete(msg.id);

      if (msg.error) {
        pending.reject(new Error(`Windsurf JSON-RPC error ${msg.error.code}: ${msg.error.message}`));
      } else {
        pending.resolve(msg.result);
      }
    }

    if (msg.method === this.config.approvalRequestMethod) {
      this.emit('approval-request', {
        taskId: typeof msg.params?.taskId === 'string' ? msg.params.taskId : '',
        approvalId: typeof msg.params?.id === 'string' ? msg.params.id : '',
        action: typeof msg.params?.action === 'string' ? msg.params.action : undefined,
        description: typeof msg.params?.description === 'string' ? msg.params.description : undefined,
        details: msg.params,
      } as WindsurfApprovalRequest);
    }

    if (msg.method === this.config.taskUpdateMethod) {
      const taskId = typeof msg.params?.taskId === 'string'
        ? msg.params.taskId
        : typeof msg.params?.id === 'string'
          ? msg.params.id
          : null;
      const state = typeof msg.params?.state === 'string' ? msg.params.state : null;

      if (taskId && state && ['completed', 'failed', 'cancelled', 'stopped'].includes(state)) {
        this.activeTasks.delete(taskId);
      }

      this.emit('task-update', msg.params);
      if (taskId) {
        this.publishTaskStream(taskId, extractTaskStreamChunk(msg.params));
      }
    }

    // Emit for stream subscribers
    this.emit('message', msg);
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      this.pendingRequests.delete(id);
    }
  }

  private publishTaskStream(taskId: string, chunk: string, done = false): void {
    if (!taskId || (!chunk && !done)) return;

    const context = this.taskContexts.get(taskId);
    getA2AEventBus().publish({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      type: A2AEventType.TaskStream,
      timestamp: new Date().toISOString(),
      taskId,
      workspaceId: context?.workspaceId,
      data: {
        agentId: WINDSURF_CONNECTOR_IDENTITY.id,
        chunk,
        done,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Agent registry integration
  // -------------------------------------------------------------------------

  registerWithAgentRegistry(): void {
    try {
      const registry = getAgentRegistryService();
      registry.registerAgent({
        agent_id: WINDSURF_CONNECTOR_IDENTITY.id,
        name: WINDSURF_CONNECTOR_IDENTITY.name,
        platform: 'windsurf',
        capabilities: ['execute', 'code-edit', 'code-review'],
        url: '',
        metadata: {
          connector_type: 'windsurf-bridge',
          tier: 'tier-2',
          status: 'pilot',
        },
      });
      logger.info('Windsurf connector registered with agent registry');
    } catch (err) {
      logger.warn({ err }, 'Failed to register Windsurf connector with agent registry');
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: WindsurfConnectorRuntime | null = null;

export function getWindsurfConnectorRuntime(config?: Partial<WindsurfConnectorConfig>): WindsurfConnectorRuntime {
  if (!instance) {
    instance = new WindsurfConnectorRuntime(config);
  }
  return instance;
}

export function resetWindsurfConnectorRuntime(): void {
  if (instance?.isRunning()) {
    instance.stop().catch(() => { /* best effort */ });
  }
  instance = null;
}

export function getWindsurfConnectorIdentity(): RecoderAgentIdentity {
  return { ...WINDSURF_CONNECTOR_IDENTITY };
}
