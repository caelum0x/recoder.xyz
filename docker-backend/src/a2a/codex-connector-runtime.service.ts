/**
 * @module codex-connector-runtime.service
 *
 * Runtime service that spawns and manages Codex CLI processes.
 *
 * Codex operates as a JSON-RPC App Server via `codex --jsonrpc` over stdio.
 * Methods: tasks/send, tasks/get, tasks/cancel, approvals/respond.
 *
 * This service:
 * 1. **Spawns** the `codex --jsonrpc` child process.
 * 2. **Communicates** via JSON-RPC 2.0 over stdin/stdout.
 * 3. **Matches** pending requests to responses by JSON-RPC `id`.
 * 4. **Executes** tasks via tasks/send, collects results via tasks/get.
 * 5. **Handles** approval requests from Codex, forwarding to the policy system.
 * 6. **Manages** process lifecycle: start, stop, restart, health checks.
 * 7. **Handles** errors: process crash, timeout, stderr.
 */

import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import type { RecoderAgentIdentity } from '@recoder/shared/a2a';
import {
  createAuditEvent,
  AuditEventTypeEnum,
  AuditActorKindEnum,
  AuditTargetKindEnum,
  AuditSeverityEnum,
} from '@recoder/shared/a2a';
import { getAgentRegistryService } from './agent-registry.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CodexConnectorStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';

export interface CodexConnectorConfig {
  /** The command to run (defaults to 'codex'). */
  command: string;
  /** Arguments to pass to the command (defaults to ['--jsonrpc']). */
  args: string[];
  /** Additional environment variables for the child process. */
  env?: Record<string, string>;
  /** Working directory for the child process. */
  cwd?: string;
  /** Timeout for individual JSON-RPC requests in milliseconds. */
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

export interface CodexConnectorState {
  status: CodexConnectorStatus;
  pid: number | null;
  startedAt: string | null;
  lastActivity: string | null;
  restartCount: number;
  error: string | null;
  pendingRequests: number;
  activeTasks: number;
}

export interface CodexExecuteInput {
  taskId: string;
  prompt: string;
  requester: RecoderAgentIdentity;
  /** Optional artifacts (files) to pass to Codex. */
  artifacts?: Array<{ filename: string; content: string }>;
}

export interface CodexExecuteResult {
  taskId: string;
  success: boolean;
  resultText?: string;
  error?: string;
  artifacts?: Array<{ filename: string; content: string }>;
  raw?: unknown;
}

export interface CodexApprovalRequest {
  taskId: string;
  approvalId: string;
  action: string;
  description: string;
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

const DEFAULT_CONFIG: CodexConnectorConfig = {
  command: process.env.CODEX_COMMAND || 'codex',
  args: (process.env.CODEX_ARGS || '--jsonrpc').split(','),
  env: {},
  cwd: process.env.CODEX_CWD || undefined,
  requestTimeoutMs: Number(process.env.CODEX_CONNECTOR_REQUEST_TIMEOUT_MS || 120_000),
  startupTimeoutMs: Number(process.env.CODEX_CONNECTOR_STARTUP_TIMEOUT_MS || 30_000),
  maxRestartAttempts: Number(process.env.CODEX_CONNECTOR_MAX_RESTART_ATTEMPTS || 3),
  restartDelayMs: Number(process.env.CODEX_CONNECTOR_RESTART_DELAY_MS || 2_000),
  autoRestart: process.env.CODEX_CONNECTOR_AUTO_RESTART !== 'false',
};

// ---------------------------------------------------------------------------
// Agent identity
// ---------------------------------------------------------------------------

const CODEX_CONNECTOR_IDENTITY: RecoderAgentIdentity = {
  id: 'codex-connector',
  name: 'OpenAI Codex CLI Connector',
  platform: 'codex',
};

export function getCodexConnectorIdentity(): RecoderAgentIdentity {
  return { ...CODEX_CONNECTOR_IDENTITY };
}

// ---------------------------------------------------------------------------
// CodexConnectorRuntime
// ---------------------------------------------------------------------------

export class CodexConnectorRuntime extends EventEmitter {
  private config: CodexConnectorConfig;
  private process: ChildProcess | null = null;
  private status: CodexConnectorStatus = 'stopped';
  private pendingRequests = new Map<string, PendingRequest>();
  private requestIdCounter = 0;
  private buffer = '';
  private startedAt: string | null = null;
  private lastActivity: string | null = null;
  private restartCount = 0;
  private lastError: string | null = null;
  private stderrBuffer: string[] = [];
  private activeTasks = new Set<string>();

  constructor(config?: Partial<CodexConnectorConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  getState(): CodexConnectorState {
    return {
      status: this.status,
      pid: this.process?.pid ?? null,
      startedAt: this.startedAt,
      lastActivity: this.lastActivity,
      restartCount: this.restartCount,
      error: this.lastError,
      pendingRequests: this.pendingRequests.size,
      activeTasks: this.activeTasks.size,
    };
  }

  isRunning(): boolean {
    return this.status === 'running';
  }

  async start(): Promise<void> {
    if (this.status === 'running' || this.status === 'starting') {
      return;
    }

    this.status = 'starting';
    this.lastError = null;
    this.emit('status', this.status);

    try {
      await this.spawnProcess();
      this.status = 'running';
      this.startedAt = new Date().toISOString();
      this.lastActivity = this.startedAt;
      this.emit('status', this.status);

      this.emit('audit', createAuditEvent({
        id: `evt_${randomUUID()}`,
        event_type: AuditEventTypeEnum.ConnectorAttached,
        actor: { kind: AuditActorKindEnum.System, id: 'codex-connector-runtime' },
        target: { kind: AuditTargetKindEnum.Connector, id: 'codex-cli' },
        severity: AuditSeverityEnum.Info,
        trace_id: `trace_${randomUUID()}`,
        workspace_id: 'system',
        metadata: { message: 'Codex CLI connector started' },
      }));

      this.registerWithRegistry();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.lastError = message;
      this.status = 'error';
      this.emit('status', this.status);
      this.emit('error', err);
      this.killProcess();
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.status === 'stopped' || this.status === 'stopping') {
      return;
    }

    this.status = 'stopping';
    this.emit('status', this.status);
    this.rejectAllPending('Codex connector is stopping');
    this.killProcess();

    this.emit('audit', createAuditEvent({
      id: `evt_${randomUUID()}`,
      event_type: AuditEventTypeEnum.ConnectorDetached,
      actor: { kind: AuditActorKindEnum.System, id: 'codex-connector-runtime' },
      target: { kind: AuditTargetKindEnum.Connector, id: 'codex-cli' },
      severity: AuditSeverityEnum.Info,
      trace_id: `trace_${randomUUID()}`,
      workspace_id: 'system',
      metadata: { message: 'Codex CLI connector stopped' },
    }));

    this.status = 'stopped';
    this.startedAt = null;
    this.activeTasks.clear();
    this.emit('status', this.status);
  }

  async restart(): Promise<void> {
    await this.stop();
    this.restartCount++;
    await this.start();
  }

  getHealth(): { healthy: boolean; status: CodexConnectorStatus; pid: number | null; uptime: number | null } {
    const uptime = this.startedAt
      ? Date.now() - new Date(this.startedAt).getTime()
      : null;
    return {
      healthy: this.status === 'running',
      status: this.status,
      pid: this.process?.pid ?? null,
      uptime,
    };
  }

  /** Send a task to Codex via tasks/send. */
  async executeTask(input: CodexExecuteInput): Promise<CodexExecuteResult> {
    if (!this.isRunning()) {
      return { taskId: input.taskId, success: false, error: 'Codex connector is not running' };
    }

    this.activeTasks.add(input.taskId);
    this.lastActivity = new Date().toISOString();

    try {
      const codexTask = {
        id: input.taskId,
        sessionId: `recoder-session-${Date.now()}`,
        message: {
          role: 'user' as const,
          parts: [{ text: input.prompt }],
        },
        artifacts: input.artifacts?.map((a) => ({
          filename: a.filename,
          content: a.content,
        })),
      };

      const result = await this.sendJsonRpc('tasks/send', codexTask);

      const resultObj = result as Record<string, unknown>;
      const resultText =
        typeof resultObj?.result === 'string'
          ? resultObj.result
          : typeof resultObj?.message === 'string'
            ? resultObj.message
            : JSON.stringify(result);

      this.activeTasks.delete(input.taskId);

      return {
        taskId: input.taskId,
        success: true,
        resultText,
        raw: result,
      };
    } catch (err) {
      this.activeTasks.delete(input.taskId);
      const message = err instanceof Error ? err.message : String(err);

      this.emit('audit', createAuditEvent({
        id: `evt_${randomUUID()}`,
        event_type: AuditEventTypeEnum.ConnectorError,
        actor: { kind: AuditActorKindEnum.System, id: 'codex-connector-runtime' },
        target: { kind: AuditTargetKindEnum.Connector, id: 'codex-cli' },
        severity: AuditSeverityEnum.Error,
        trace_id: `trace_${randomUUID()}`,
        workspace_id: 'system',
        task_id: input.taskId,
        metadata: { message },
      }));

      return { taskId: input.taskId, success: false, error: message };
    }
  }

  /** Get task status from Codex via tasks/get. */
  async getTaskStatus(taskId: string): Promise<unknown> {
    return this.sendJsonRpc('tasks/get', { id: taskId });
  }

  /** Cancel a task via tasks/cancel. */
  async cancelTask(taskId: string): Promise<unknown> {
    this.activeTasks.delete(taskId);
    return this.sendJsonRpc('tasks/cancel', { id: taskId });
  }

  /** Respond to an approval request via approvals/respond. */
  async respondToApproval(
    approvalId: string,
    approved: boolean,
    reason?: string,
  ): Promise<unknown> {
    return this.sendJsonRpc('approvals/respond', {
      id: approvalId,
      approved,
      reason,
    });
  }

  // -------------------------------------------------------------------------
  // Process management
  // -------------------------------------------------------------------------

  private spawnProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Codex process startup timed out'));
      }, this.config.startupTimeoutMs);

      try {
        const env = { ...process.env, ...this.config.env };
        this.process = spawn(this.config.command, this.config.args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env,
          cwd: this.config.cwd,
        });

        this.process.stdout?.on('data', (chunk: Buffer) => {
          this.handleStdout(chunk.toString());
        });

        this.process.stderr?.on('data', (chunk: Buffer) => {
          const line = chunk.toString().trim();
          if (line) {
            this.stderrBuffer.push(line);
            if (this.stderrBuffer.length > 100) this.stderrBuffer.shift();
            this.emit('stderr', line);
          }
        });

        this.process.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });

        this.process.on('exit', (code, signal) => {
          this.handleProcessExit(code, signal);
        });

        // Codex in JSON-RPC mode is ready once the process is spawned
        // (no handshake required — it accepts JSON-RPC on stdin immediately)
        this.process.once('spawn', () => {
          clearTimeout(timeout);
          resolve();
        });
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  private handleStdout(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const msg = JSON.parse(trimmed);

        // Check if this is a response to a pending request
        if (msg.id != null && this.pendingRequests.has(String(msg.id))) {
          const pending = this.pendingRequests.get(String(msg.id))!;
          this.pendingRequests.delete(String(msg.id));
          clearTimeout(pending.timer);

          if (msg.error) {
            pending.reject(
              new Error(msg.error.message || JSON.stringify(msg.error)),
            );
          } else {
            pending.resolve(msg.result);
          }
        }

        // Check if this is an approval request notification from Codex
        if (msg.method === 'approvals/request') {
          this.emit('approval-request', {
            taskId: msg.params?.taskId,
            approvalId: msg.params?.id,
            action: msg.params?.action,
            description: msg.params?.description,
            details: msg.params,
          } as CodexApprovalRequest);
        }

        // Emit generic message events for streaming
        if (msg.method === 'tasks/update') {
          this.emit('task-update', msg.params);
        }
      } catch {
        // Not JSON — ignore
      }
    }
  }

  private handleProcessExit(code: number | null, signal: string | null): void {
    const wasRunning = this.status === 'running';
    this.status = 'stopped';
    this.process = null;

    this.rejectAllPending(`Codex process exited (code=${code}, signal=${signal})`);

    this.emit('exit', { code, signal });

    if (wasRunning && this.config.autoRestart && this.restartCount < this.config.maxRestartAttempts) {
      setTimeout(() => {
        this.restart().catch((err) => {
          this.lastError = err instanceof Error ? err.message : String(err);
          this.status = 'error';
          this.emit('error', err);
        });
      }, this.config.restartDelayMs);
    }
  }

  private killProcess(): void {
    if (this.process) {
      try {
        this.process.stdin?.end();
        this.process.kill('SIGTERM');
      } catch {
        // Process may already be dead
      }
      this.process = null;
    }
  }

  // -------------------------------------------------------------------------
  // JSON-RPC communication
  // -------------------------------------------------------------------------

  private sendJsonRpc(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        reject(new Error('Codex process stdin is not writable'));
        return;
      }

      const id = String(++this.requestIdCounter);
      const msg = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      });

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Codex JSON-RPC request timed out (method=${method})`));
      }, this.config.requestTimeoutMs);

      this.pendingRequests.set(id, { resolve, reject, method, createdAt: Date.now(), timer });

      this.process.stdin.write(msg + '\n', (err) => {
        if (err) {
          this.pendingRequests.delete(id);
          clearTimeout(timer);
          reject(err);
        }
      });
    });
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }

  // -------------------------------------------------------------------------
  // Agent registry integration
  // -------------------------------------------------------------------------

  private registerWithRegistry(): void {
    try {
      const registry = getAgentRegistryService();
      registry.selfRegister({
        agentId: CODEX_CONNECTOR_IDENTITY.id,
        name: CODEX_CONNECTOR_IDENTITY.name,
        platform: 'codex',
        description: 'OpenAI Codex CLI agent via JSON-RPC over stdio',
        version: '1.0.0',
        tags: ['code-generation', 'task-lifecycle', 'implementation'],
      });
    } catch {
      // Registry may not be available — non-fatal
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: CodexConnectorRuntime | null = null;

export function getCodexConnectorRuntime(
  config?: Partial<CodexConnectorConfig>,
): CodexConnectorRuntime {
  if (!instance) {
    instance = new CodexConnectorRuntime(config);
  }
  return instance;
}

export function resetCodexConnectorRuntime(): void {
  if (instance) {
    instance.stop().catch(() => {});
    instance.removeAllListeners();
    instance = null;
  }
}
