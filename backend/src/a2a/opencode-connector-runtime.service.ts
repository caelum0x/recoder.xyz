/**
 * @module opencode-connector-runtime.service
 *
 * Experimental runtime service that executes OpenCode in non-interactive
 * JSON event mode. This spike keeps Recoder as the control plane while
 * delegating hard coding loops to `opencode run --format json`.
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
import { getA2AEventBus, A2AEventType } from './a2a-event-bus';
import { createLogger } from '../logger';

const logger = createLogger('opencode-connector-runtime');

export type OpencodeConnectorStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';

export interface OpencodeConnectorConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  requestTimeoutMs: number;
  startupTimeoutMs: number;
  defaultModel?: string;
  defaultAgent?: string;
  defaultVariant?: string;
}

export interface OpencodeProviderKeys {
  openrouter?: string;
  openai?: string;
  anthropic?: string;
  gemini?: string;
}

export interface OpencodeConnectorState {
  status: OpencodeConnectorStatus;
  pid: number | null;
  startedAt: string | null;
  lastActivity: string | null;
  error: string | null;
  activeTasks: number;
}

export interface OpencodeExecuteInput {
  taskId: string;
  prompt: string;
  requester: RecoderAgentIdentity;
  workspaceId?: string;
  threadId?: string;
  cwd?: string;
  model?: string;
  agent?: string;
  variant?: string;
  sessionId?: string;
  continueSession?: boolean;
  providerKeys?: OpencodeProviderKeys;
  env?: Record<string, string>;
}

export interface OpencodeExecuteResult {
  taskId: string;
  success: boolean;
  resultText?: string;
  error?: string;
  sessionId?: string;
  raw?: {
    exitCode: number | null;
    signal: string | null;
    eventCount: number;
    events: unknown[];
    stderr: string[];
  };
}

export interface OpencodeTaskStatus {
  taskId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';
  startedAt: string | null;
  finishedAt: string | null;
  pid: number | null;
  sessionId?: string;
  cwd?: string;
  model?: string;
  resultText?: string;
  error?: string;
}

interface MutableTaskStatus extends OpencodeTaskStatus {
  workspaceId?: string;
  threadId?: string;
}

interface ParsedOpencodeEvent {
  type?: string;
  sessionID?: string;
  part?: Record<string, unknown>;
  error?: unknown;
}

const DEFAULT_CONFIG: OpencodeConnectorConfig = {
  command: process.env.OPENCODE_COMMAND || 'opencode',
  args: (process.env.OPENCODE_ARGS || '').split(',').filter(Boolean),
  env: {},
  cwd: process.env.OPENCODE_CWD || undefined,
  requestTimeoutMs: Number(process.env.OPENCODE_CONNECTOR_REQUEST_TIMEOUT_MS || 15 * 60_000),
  startupTimeoutMs: Number(process.env.OPENCODE_CONNECTOR_STARTUP_TIMEOUT_MS || 30_000),
  defaultModel: process.env.OPENCODE_MODEL || undefined,
  defaultAgent: process.env.OPENCODE_AGENT || undefined,
  defaultVariant: process.env.OPENCODE_VARIANT || undefined,
};

const OPENCODE_CONNECTOR_IDENTITY = {
  id: 'opencode-connector',
  name: 'OpenCode Connector',
  platform: 'custom',
} as const;

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === 'string');
}

function getNestedText(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const text = (value as Record<string, unknown>).text;
  return typeof text === 'string' && text.trim().length > 0 ? text.trim() : undefined;
}

function stringifyError(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value.trim() || undefined;
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim().length > 0) {
      return record.message.trim();
    }
    if (record.data && typeof record.data === 'object') {
      const nested = stringifyError(record.data);
      if (nested) return nested;
    }
    if (typeof record.name === 'string' && record.name.trim().length > 0) {
      return record.name.trim();
    }
  }

  return String(value);
}

function summarizeToolUse(part: Record<string, unknown>): string | undefined {
  const tool = part.tool;
  if (typeof tool !== 'string' || tool.trim().length === 0) {
    return undefined;
  }

  const state = part.state;
  if (state && typeof state === 'object') {
    const status = (state as Record<string, unknown>).status;
    if (typeof status === 'string' && status.trim().length > 0) {
      return `[tool:${tool}] ${status}`;
    }
  }

  return `[tool:${tool}]`;
}

function extractChunkFromEvent(event: ParsedOpencodeEvent): string | undefined {
  if (event.type === 'text') {
    return getNestedText(event.part);
  }

  if (event.type === 'reasoning') {
    const text = getNestedText(event.part);
    return text ? `[reasoning] ${text}` : undefined;
  }

  if (event.type === 'tool_use' && event.part && typeof event.part === 'object') {
    return summarizeToolUse(event.part);
  }

  if (event.type === 'error') {
    const message = stringifyError(event.error);
    return message ? `[error] ${message}` : undefined;
  }

  return undefined;
}

export class OpencodeConnectorRuntime extends EventEmitter {
  private readonly config: OpencodeConnectorConfig;
  private status: OpencodeConnectorStatus = 'stopped';
  private startedAt: string | null = null;
  private lastActivity: string | null = null;
  private lastError: string | null = null;
  private readonly activeTaskIds = new Set<string>();
  private readonly taskStatuses = new Map<string, MutableTaskStatus>();
  private readonly taskProcesses = new Map<string, ChildProcess>();

  readonly connectorId = 'opencode';
  readonly platform = 'custom' as const;

  constructor(config?: Partial<OpencodeConnectorConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  get processRef(): ChildProcess | null {
    return this.taskProcesses.values().next().value ?? null;
  }

  getPid(): number | null {
    return this.processRef?.pid ?? null;
  }

  getState(): OpencodeConnectorState {
    return {
      status: this.status,
      pid: this.getPid(),
      startedAt: this.startedAt,
      lastActivity: this.lastActivity,
      error: this.lastError,
      activeTasks: this.activeTaskIds.size,
    };
  }

  isRunning(): boolean {
    return this.status === 'running';
  }

  getHealth() {
    const now = new Date().toISOString();
    return {
      status: this.status === 'running' ? 'healthy' as const : this.status === 'error' ? 'unhealthy' as const : 'unknown' as const,
      pid: this.getPid(),
      uptime: this.startedAt ? Date.now() - new Date(this.startedAt).getTime() : 0,
      lastCheckedAt: now,
      message: this.lastError || undefined,
    };
  }

  async start(): Promise<void> {
    if (this.status === 'running' || this.status === 'starting') {
      return;
    }

    this.status = 'starting';
    this.lastError = null;
    this.emit('status', this.status);

    try {
      await this.verifyCommand();

      this.status = 'running';
      this.startedAt = new Date().toISOString();
      this.lastActivity = this.startedAt;
      this.emit('status', this.status);

      this.emit('audit', createAuditEvent({
        id: `evt_${randomUUID()}`,
        event_type: AuditEventTypeEnum.ConnectorAttached,
        actor: { kind: AuditActorKindEnum.System, id: 'opencode-connector-runtime' },
        target: { kind: AuditTargetKindEnum.Connector, id: 'opencode-cli' },
        severity: AuditSeverityEnum.Info,
        trace_id: `trace_${randomUUID()}`,
        workspace_id: 'system',
        metadata: { message: 'OpenCode connector started' },
      }));

      this.registerWithRegistry();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.status = 'error';
      this.emit('status', this.status);
      this.emit('error', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.status === 'stopped' || this.status === 'stopping') {
      return;
    }

    this.status = 'stopping';
    this.emit('status', this.status);

    for (const [taskId, proc] of this.taskProcesses) {
      const task = this.taskStatuses.get(taskId);
      if (task && task.status === 'running') {
        task.status = 'cancelled';
        task.error = 'Connector stopped while task was running';
      }
      try {
        proc.kill('SIGTERM');
      } catch {
        // Ignore dead child processes during shutdown.
      }
    }

    this.taskProcesses.clear();
    this.activeTaskIds.clear();

    this.emit('audit', createAuditEvent({
      id: `evt_${randomUUID()}`,
      event_type: AuditEventTypeEnum.ConnectorDetached,
      actor: { kind: AuditActorKindEnum.System, id: 'opencode-connector-runtime' },
      target: { kind: AuditTargetKindEnum.Connector, id: 'opencode-cli' },
      severity: AuditSeverityEnum.Info,
      trace_id: `trace_${randomUUID()}`,
      workspace_id: 'system',
      metadata: { message: 'OpenCode connector stopped' },
    }));

    this.status = 'stopped';
    this.startedAt = null;
    this.emit('status', this.status);
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async executeTask(input: OpencodeExecuteInput): Promise<OpencodeExecuteResult> {
    if (!this.isRunning()) {
      return { taskId: input.taskId, success: false, error: 'OpenCode connector is not running' };
    }

    const status: MutableTaskStatus = {
      taskId: input.taskId,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      pid: null,
      sessionId: input.sessionId,
      cwd: input.cwd || this.config.cwd,
      model: input.model || this.config.defaultModel,
      workspaceId: input.workspaceId,
      threadId: input.threadId,
    };

    this.taskStatuses.set(input.taskId, status);
    this.activeTaskIds.add(input.taskId);
    this.lastActivity = status.startedAt;

    const rawEvents: unknown[] = [];
    const stderrLines: string[] = [];
    const textChunks: string[] = [];
    const errors: string[] = [];

    const args = this.buildRunArgs(input);
    const env = this.buildTaskEnv(input);
    const cwd = input.cwd || this.config.cwd;

    logger.info({ taskId: input.taskId, cwd, args }, 'Starting OpenCode task');

    try {
      return await new Promise<OpencodeExecuteResult>((resolve) => {
        let settled = false;
        let stdoutBuffer = '';
        let exitCode: number | null = null;
        let exitSignal: string | null = null;
        let sessionId = input.sessionId;

        const settle = (result: OpencodeExecuteResult) => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timeout);
          this.taskProcesses.delete(input.taskId);
          this.activeTaskIds.delete(input.taskId);
          status.finishedAt = new Date().toISOString();
          status.sessionId = sessionId;
          status.resultText = result.resultText;
          status.error = result.error;
          resolve(result);
        };

        const child = spawn(this.config.command, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          env,
          cwd,
        });

        this.taskProcesses.set(input.taskId, child);
        status.pid = child.pid ?? null;

        child.stdout?.on('data', (chunk: Buffer | string) => {
          stdoutBuffer += chunk.toString();
          const lines = stdoutBuffer.split(/\r?\n/);
          stdoutBuffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            let parsed: ParsedOpencodeEvent | null = null;
            try {
              parsed = JSON.parse(trimmed) as ParsedOpencodeEvent;
            } catch {
              continue;
            }

            rawEvents.push(parsed);
            if (rawEvents.length > 200) {
              rawEvents.shift();
            }

            if (typeof parsed.sessionID === 'string' && parsed.sessionID.trim().length > 0) {
              sessionId = parsed.sessionID;
              status.sessionId = parsed.sessionID;
            }

            const chunkText = extractChunkFromEvent(parsed);
            if (!chunkText) {
              continue;
            }

            if (parsed.type === 'text') {
              textChunks.push(chunkText);
            } else if (parsed.type === 'error') {
              errors.push(chunkText.replace(/^\[error\]\s*/, ''));
            }

            this.publishTaskStream(input.taskId, chunkText, false);
          }
        });

        child.stderr?.on('data', (chunk: Buffer | string) => {
          const line = chunk.toString().trim();
          if (!line) return;
          stderrLines.push(line);
          if (stderrLines.length > 100) {
            stderrLines.shift();
          }
          this.emit('stderr', line);
        });

        child.on('error', (error) => {
          const message = error instanceof Error ? error.message : String(error);
          this.lastError = message;
          status.status = 'failed';
          this.publishTaskStream(input.taskId, `[error] ${message}`, true);
          settle({
            taskId: input.taskId,
            success: false,
            error: message,
            sessionId,
            raw: {
              exitCode,
              signal: exitSignal,
              eventCount: rawEvents.length,
              events: rawEvents,
              stderr: stderrLines,
            },
          });
        });

        child.on('exit', (code, signal) => {
          exitCode = code;
          exitSignal = signal;

          if (status.status === 'cancelled') {
            const message = status.error || 'Task cancelled';
            this.publishTaskStream(input.taskId, `[error] ${message}`, true);
            settle({
              taskId: input.taskId,
              success: false,
              error: message,
              sessionId,
              raw: {
                exitCode,
                signal: exitSignal,
                eventCount: rawEvents.length,
                events: rawEvents,
                stderr: stderrLines,
              },
            });
            return;
          }

          if (errors.length > 0) {
            const message = errors.join('\n');
            status.status = 'failed';
            this.publishTaskStream(input.taskId, '', true);
            settle({
              taskId: input.taskId,
              success: false,
              error: message,
              sessionId,
              raw: {
                exitCode,
                signal: exitSignal,
                eventCount: rawEvents.length,
                events: rawEvents,
                stderr: stderrLines,
              },
            });
            return;
          }

          if (code !== 0) {
            const message = stderrLines.join('\n').trim() || `OpenCode exited with code ${code ?? 'unknown'}`;
            status.status = 'failed';
            this.publishTaskStream(input.taskId, `[error] ${message}`, true);
            settle({
              taskId: input.taskId,
              success: false,
              error: message,
              sessionId,
              raw: {
                exitCode,
                signal: exitSignal,
                eventCount: rawEvents.length,
                events: rawEvents,
                stderr: stderrLines,
              },
            });
            return;
          }

          const resultText = textChunks.join('\n\n').trim();
          status.status = 'completed';
          this.publishTaskStream(input.taskId, '', true);
          settle({
            taskId: input.taskId,
            success: true,
            resultText,
            sessionId,
            raw: {
              exitCode,
              signal: exitSignal,
              eventCount: rawEvents.length,
              events: rawEvents,
              stderr: stderrLines,
            },
          });
        });

        const timeout = setTimeout(() => {
          const message = `OpenCode task timed out after ${this.config.requestTimeoutMs}ms`;
          this.lastError = message;
          status.status = 'failed';
          status.error = message;
          errors.push(message);
          try {
            child.kill('SIGTERM');
          } catch {
            // Process already exited.
          }
        }, this.config.requestTimeoutMs);

        if (typeof timeout === 'object' && 'unref' in timeout) {
          (timeout as NodeJS.Timeout).unref();
        }
      });
    } catch (error) {
      this.activeTaskIds.delete(input.taskId);
      status.status = 'failed';
      status.finishedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      status.error = message;
      return {
        taskId: input.taskId,
        success: false,
        error: message,
        sessionId: status.sessionId,
        raw: {
          exitCode: null,
          signal: null,
          eventCount: 0,
          events: [],
          stderr: [],
        },
      };
    }
  }

  async getTaskStatus(taskId: string): Promise<OpencodeTaskStatus> {
    const status = this.taskStatuses.get(taskId);
    if (!status) {
      return {
        taskId,
        status: 'unknown',
        startedAt: null,
        finishedAt: null,
        pid: null,
      };
    }

    return { ...status };
  }

  async cancelTask(taskId: string, reason?: string): Promise<{ taskId: string; cancelled: boolean; reason?: string }> {
    const proc = this.taskProcesses.get(taskId);
    const status = this.taskStatuses.get(taskId);

    if (!proc || !status || status.status !== 'running') {
      return { taskId, cancelled: false, reason: 'Task is not running' };
    }

    status.status = 'cancelled';
    status.error = reason || 'Task cancelled';

    try {
      proc.kill('SIGTERM');
    } catch {
      return { taskId, cancelled: false, reason: 'Failed to stop task process' };
    }

    return { taskId, cancelled: true, reason: status.error };
  }

  async respondToApproval(
    approvalId: string,
    approved: boolean,
    reason?: string,
  ): Promise<{ approvalId: string; supported: boolean; approved: boolean; reason?: string }> {
    return {
      approvalId,
      supported: false,
      approved,
      reason: reason || 'OpenCode spike runtime auto-rejects interactive permissions internally',
    };
  }

  private buildRunArgs(input: OpencodeExecuteInput): string[] {
    const args = [...this.config.args, 'run', '--format', 'json'];
    const model = input.model || this.config.defaultModel;
    const agent = input.agent || this.config.defaultAgent;
    const variant = input.variant || this.config.defaultVariant;
    const dir = input.cwd || this.config.cwd;

    if (input.sessionId) {
      args.push('--session', input.sessionId);
    } else if (input.continueSession) {
      args.push('--continue');
    }

    if (model) {
      args.push('--model', model);
    }

    if (agent) {
      args.push('--agent', agent);
    }

    if (variant) {
      args.push('--variant', variant);
    }

    if (dir) {
      args.push('--dir', dir);
    }

    args.push(input.prompt);
    return args;
  }

  private buildTaskEnv(input: OpencodeExecuteInput): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...this.config.env,
    };

    if (isStringRecord(input.env)) {
      Object.assign(env, input.env);
    }

    if (input.providerKeys?.openrouter) {
      env.OPENROUTER_API_KEY = input.providerKeys.openrouter;
    }
    if (input.providerKeys?.openai) {
      env.OPENAI_API_KEY = input.providerKeys.openai;
    }
    if (input.providerKeys?.anthropic) {
      env.ANTHROPIC_API_KEY = input.providerKeys.anthropic;
    }
    if (input.providerKeys?.gemini) {
      env.GEMINI_API_KEY = input.providerKeys.gemini;
    }

    return env;
  }

  private publishTaskStream(taskId: string, chunk: string, done: boolean): void {
    if (!taskId || (!chunk && !done)) {
      return;
    }

    const context = this.taskStatuses.get(taskId);
    getA2AEventBus().publish({
      id: `evt_${randomUUID()}`,
      type: A2AEventType.TaskStream,
      timestamp: new Date().toISOString(),
      taskId,
      workspaceId: context?.workspaceId,
      data: {
        agentId: OPENCODE_CONNECTOR_IDENTITY.id,
        chunk,
        done,
      },
    });
  }

  private verifyCommand(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let stderr = '';
      let stdout = '';

      const child = spawn(this.config.command, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...this.config.env },
        cwd: this.config.cwd,
      });

      const settle = (handler: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        handler();
      };

      child.stdout?.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        settle(() => reject(error));
      });

      child.on('exit', (code) => {
        if (code === 0) {
          settle(resolve);
          return;
        }

        const output = stderr.trim() || stdout.trim();
        settle(() => reject(new Error(
          output
            ? `OpenCode command check failed: ${output}`
            : `OpenCode command exited with code ${code ?? 'unknown'}`,
        )));
      });

      const timeout = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // Ignore if the command already exited.
        }
        settle(() => reject(new Error('OpenCode command verification timed out')));
      }, this.config.startupTimeoutMs);

      if (typeof timeout === 'object' && 'unref' in timeout) {
        (timeout as NodeJS.Timeout).unref();
      }
    });
  }

  private registerWithRegistry(): void {
    try {
      const registry = getAgentRegistryService();
      registry.selfRegister({
        agentId: OPENCODE_CONNECTOR_IDENTITY.id,
        name: OPENCODE_CONNECTOR_IDENTITY.name,
        platform: OPENCODE_CONNECTOR_IDENTITY.platform,
        description: 'Experimental OpenCode connector via JSON event stream',
        version: '0.1.0',
        tags: ['code-generation', 'task-lifecycle', 'experimental', 'opencode'],
      });
    } catch (error) {
      logger.debug({ error }, 'Failed to self-register OpenCode connector');
    }
  }
}

let instance: OpencodeConnectorRuntime | null = null;

export function getOpencodeConnectorRuntime(
  config?: Partial<OpencodeConnectorConfig>,
): OpencodeConnectorRuntime {
  if (!instance) {
    instance = new OpencodeConnectorRuntime(config);
  }
  return instance;
}

export function resetOpencodeConnectorRuntime(): void {
  if (instance) {
    instance.stop().catch(() => {});
    instance.removeAllListeners();
    instance = null;
  }
}

export function getOpencodeConnectorIdentity() {
  return { ...OPENCODE_CONNECTOR_IDENTITY };
}
