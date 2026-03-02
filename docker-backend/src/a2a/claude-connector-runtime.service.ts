/**
 * @module claude-connector-runtime.service
 *
 * Runtime service that spawns and manages Claude Code MCP server processes.
 *
 * Claude Code exposes an MCP server mode via `claude mcp serve`, providing
 * tools over JSON-RPC 2.0 over stdio. This service:
 *
 * 1. **Spawns** the `claude mcp serve` child process.
 * 2. **Communicates** via JSON-RPC 2.0 over stdin/stdout.
 * 3. **Matches** pending requests to responses by JSON-RPC `id`.
 * 4. **Discovers** tools via `tools/list` on startup.
 * 5. **Executes** tasks by converting TaskEnvelopes to Claude wire format
 *    (via `envelopeToClaudeCode`), sending as `tools/call`, and converting
 *    results back via `claudeCodeToEnvelope`.
 * 6. **Streams** partial responses via an EventEmitter.
 * 7. **Manages** process lifecycle: start, stop, restart, health checks.
 * 8. **Handles** errors: process crash, timeout, stderr.
 *
 * Consumed by: claude-connector.routes.ts, server.ts
 */

import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { envelopeToClaudeCode, claudeCodeToEnvelope } from '@recoder/shared/a2a';
import {
  createAuditEvent,
  AuditEventTypeEnum,
  AuditActorKindEnum,
  AuditTargetKindEnum,
  AuditSeverityEnum,
} from '@recoder/shared/a2a';
import type {
  RecoderA2AEnvelope,
  RecoderAgentIdentity,
  ClaudeCodeWireMessage,
  TaskArtifact,
} from '@recoder/shared/a2a';
import { getTaskLifecycleService } from './task-lifecycle.service';
import { getAgentRegistryService } from './agent-registry.service';
import { createLogger } from '../logger';

const logger = createLogger('claude-connector-runtime');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClaudeMCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type ClaudeConnectorStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';

export interface ClaudeConnectorConfig {
  /** The command to run (defaults to 'claude'). */
  command: string;
  /** Arguments to pass to the command (defaults to ['mcp', 'serve']). */
  args: string[];
  /** Additional environment variables for the child process. */
  env?: Record<string, string>;
  /** Working directory for the child process. */
  cwd?: string;
  /** Timeout for individual MCP requests in milliseconds. */
  requestTimeoutMs: number;
  /** Timeout for startup (initialize + tool discovery) in milliseconds. */
  startupTimeoutMs: number;
  /** Maximum number of automatic restart attempts. */
  maxRestartAttempts: number;
  /** Delay between restart attempts in milliseconds. */
  restartDelayMs: number;
  /** Whether to auto-restart on process crash. */
  autoRestart: boolean;
}

export interface ClaudeConnectorState {
  status: ClaudeConnectorStatus;
  pid: number | null;
  tools: ClaudeMCPTool[];
  startedAt: string | null;
  lastActivity: string | null;
  restartCount: number;
  error: string | null;
  pendingRequests: number;
}

export interface ExecuteTaskInput {
  taskId: string;
  prompt: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  requester: RecoderAgentIdentity;
  /** Input artifacts (files, patches) to provide context to the task. */
  artifacts?: TaskArtifact[];
}

export interface ExecuteTaskResult {
  taskId: string;
  success: boolean;
  resultText?: string;
  error?: string;
  raw?: unknown;
  envelope?: RecoderA2AEnvelope;
  /** Output artifacts produced by the task. */
  artifacts?: TaskArtifact[];
}

export interface StreamChunk {
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

const DEFAULT_CONFIG: ClaudeConnectorConfig = {
  command: process.env.CLAUDE_CODE_COMMAND || 'claude',
  args: (process.env.CLAUDE_CODE_ARGS || 'mcp,serve').split(','),
  env: {},
  cwd: process.env.CLAUDE_CODE_CWD || undefined,
  requestTimeoutMs: Number(process.env.CLAUDE_CONNECTOR_REQUEST_TIMEOUT_MS || 120_000),
  startupTimeoutMs: Number(process.env.CLAUDE_CONNECTOR_STARTUP_TIMEOUT_MS || 30_000),
  maxRestartAttempts: Number(process.env.CLAUDE_CONNECTOR_MAX_RESTART_ATTEMPTS || 3),
  restartDelayMs: Number(process.env.CLAUDE_CONNECTOR_RESTART_DELAY_MS || 2_000),
  autoRestart: process.env.CLAUDE_CONNECTOR_AUTO_RESTART !== 'false',
};

// ---------------------------------------------------------------------------
// Agent identity for the Claude Code connector
// ---------------------------------------------------------------------------

const CLAUDE_CONNECTOR_IDENTITY: RecoderAgentIdentity = {
  id: 'claude-code-connector',
  name: 'Claude Code MCP Connector',
  platform: 'claude_code',
};

// ---------------------------------------------------------------------------
// ClaudeConnectorRuntime
// ---------------------------------------------------------------------------

export class ClaudeConnectorRuntime extends EventEmitter {
  private config: ClaudeConnectorConfig;
  private process: ChildProcess | null = null;
  private status: ClaudeConnectorStatus = 'stopped';
  private tools: ClaudeMCPTool[] = [];
  private pendingRequests = new Map<string, PendingRequest>();
  private requestIdCounter = 0;
  private buffer = '';
  private startedAt: string | null = null;
  private lastActivity: string | null = null;
  private restartCount = 0;
  private lastError: string | null = null;
  private stderrBuffer: string[] = [];

  constructor(config?: Partial<ClaudeConnectorConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Get the current state of the connector. */
  getState(): ClaudeConnectorState {
    return {
      status: this.status,
      pid: this.process?.pid ?? null,
      tools: [...this.tools],
      startedAt: this.startedAt,
      lastActivity: this.lastActivity,
      restartCount: this.restartCount,
      error: this.lastError,
      pendingRequests: this.pendingRequests.size,
    };
  }

  /** Get the discovered MCP tools. */
  getTools(): ClaudeMCPTool[] {
    return [...this.tools];
  }

  /** Check if the connector is running. */
  isRunning(): boolean {
    return this.status === 'running';
  }

  /**
   * Start the Claude Code MCP server process.
   * Performs MCP initialization handshake and tool discovery.
   */
  async start(): Promise<void> {
    if (this.status === 'running' || this.status === 'starting') {
      logger.warn('Claude connector is already running or starting');
      return;
    }

    this.status = 'starting';
    this.lastError = null;
    this.emit('status', this.status);

    logger.info(
      { command: this.config.command, args: this.config.args },
      'Starting Claude Code MCP server',
    );

    try {
      await this.spawnProcess();
      await this.performHandshake();
      await this.discoverTools();

      this.status = 'running';
      this.startedAt = new Date().toISOString();
      this.lastActivity = this.startedAt;
      this.emit('status', this.status);

      this.emit('audit', createAuditEvent({
        id: `evt_${randomUUID()}`,
        event_type: AuditEventTypeEnum.ConnectorAttached,
        actor: { kind: AuditActorKindEnum.System, id: 'claude-connector-runtime' },
        target: { kind: AuditTargetKindEnum.Connector, id: 'claude-code-mcp' },
        severity: AuditSeverityEnum.Info,
        trace_id: `trace_${randomUUID()}`,
        workspace_id: 'system',
        metadata: { message: 'Claude Code MCP connector started' },
      }));

      logger.info(
        { pid: this.process?.pid, toolCount: this.tools.length },
        'Claude Code MCP server started successfully',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.lastError = message;
      this.status = 'error';
      this.emit('status', this.status);
      this.emit('error', err);

      logger.error({ err: message }, 'Failed to start Claude Code MCP server');

      // Clean up the process if it was spawned
      this.killProcess();

      throw err;
    }
  }

  /**
   * Stop the Claude Code MCP server process.
   */
  async stop(): Promise<void> {
    if (this.status === 'stopped' || this.status === 'stopping') {
      return;
    }

    this.status = 'stopping';
    this.emit('status', this.status);

    logger.info({ pid: this.process?.pid }, 'Stopping Claude Code MCP server');

    // Reject all pending requests
    this.rejectAllPending('Claude connector is stopping');

    this.killProcess();

    this.emit('audit', createAuditEvent({
      id: `evt_${randomUUID()}`,
      event_type: AuditEventTypeEnum.ConnectorDetached,
      actor: { kind: AuditActorKindEnum.System, id: 'claude-connector-runtime' },
      target: { kind: AuditTargetKindEnum.Connector, id: 'claude-code-mcp' },
      severity: AuditSeverityEnum.Info,
      trace_id: `trace_${randomUUID()}`,
      workspace_id: 'system',
      metadata: { message: 'Claude Code MCP connector stopped' },
    }));

    this.status = 'stopped';
    this.tools = [];
    this.startedAt = null;
    this.emit('status', this.status);

    logger.info('Claude Code MCP server stopped');
  }

  /**
   * Restart the Claude Code MCP server.
   */
  async restart(): Promise<void> {
    logger.info('Restarting Claude Code MCP server');
    await this.stop();
    this.restartCount++;
    await this.start();
  }

  /**
   * Call an MCP tool directly by name.
   */
  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<{ content: unknown; isError?: boolean }> {
    if (!this.isRunning()) {
      throw new Error('Claude connector is not running');
    }

    this.lastActivity = new Date().toISOString();

    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });

    return result as { content: unknown; isError?: boolean };
  }

  /**
   * Execute a task via the Claude Code MCP connector.
   *
   * Converts the prompt into a Claude wire format message, sends it as a
   * tools/call via MCP, collects the response, and converts back to an
   * envelope.
   */
  async executeTask(input: ExecuteTaskInput): Promise<ExecuteTaskResult> {
    if (!this.isRunning()) {
      return {
        taskId: input.taskId,
        success: false,
        error: 'Claude connector is not running',
      };
    }

    this.lastActivity = new Date().toISOString();

    // Transition the task to 'working' via the lifecycle service
    const lifecycle = getTaskLifecycleService();
    lifecycle.startTask(input.taskId, CLAUDE_CONNECTOR_IDENTITY.id);

    this.emit('task:start', { taskId: input.taskId });

    try {
      // Determine which tool to call
      const toolName = input.toolName || this.selectDefaultTool(input.prompt);
      let toolArgs = input.toolArgs || this.buildToolArgs(toolName, input.prompt);

      // Inject input artifacts into the prompt context if provided
      if (input.artifacts?.length) {
        const artifactContext = input.artifacts
          .map((a) => `[Artifact: ${a.key} (${a.artifact_type})]:\n${a.content}`)
          .join('\n\n');
        const augmentedPrompt = `${input.prompt}\n\n--- Attached Artifacts ---\n${artifactContext}`;
        toolArgs = { ...toolArgs };
        // Update the prompt-like field with artifact context
        if ('prompt' in toolArgs) toolArgs.prompt = augmentedPrompt;
        else if ('content' in toolArgs) toolArgs.content = augmentedPrompt;
        else if ('text' in toolArgs) toolArgs.text = augmentedPrompt;
        else toolArgs.prompt = augmentedPrompt;
      }

      logger.info(
        { taskId: input.taskId, tool: toolName },
        'Executing task via Claude MCP tool',
      );

      // Send the MCP tools/call request
      const mcpResult = await this.sendRequest('tools/call', {
        name: toolName,
        arguments: toolArgs,
      }) as { content?: Array<{ type: string; text?: string }>; isError?: boolean };

      // Extract the result text from MCP response content
      const resultText = this.extractResultText(mcpResult);

      if (mcpResult.isError) {
        // Task failed
        lifecycle.failTask(
          input.taskId,
          {
            code: 'CONNECTOR_ERROR',
            category: 'connector',
            message: resultText || 'MCP tool returned an error',
            severity: 'high',
            retryable: true,
          },
          CLAUDE_CONNECTOR_IDENTITY.id,
        );

        this.emit('task:error', { taskId: input.taskId, error: resultText });

        return {
          taskId: input.taskId,
          success: false,
          error: resultText,
          raw: mcpResult,
        };
      }

      // Extract output artifacts from MCP result (file content, patches, etc.)
      const outputArtifacts = this.extractArtifacts(mcpResult);

      // Build an envelope from the MCP result for downstream consumption
      const responseEnvelope = claudeCodeToEnvelope({
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: resultText || '' }],
        },
        from: CLAUDE_CONNECTOR_IDENTITY,
        to: input.requester,
        messageId: `${input.taskId}:result`,
        threadId: input.taskId,
      });

      // Transition the task to 'completed'
      lifecycle.completeTask(
        input.taskId,
        {
          text: resultText,
          data: { raw: mcpResult },
          artifacts: outputArtifacts.length > 0 ? outputArtifacts : undefined,
        },
        CLAUDE_CONNECTOR_IDENTITY.id,
      );

      this.emit('task:complete', { taskId: input.taskId, resultText, artifacts: outputArtifacts });

      return {
        taskId: input.taskId,
        success: true,
        resultText,
        raw: mcpResult,
        envelope: responseEnvelope,
        artifacts: outputArtifacts.length > 0 ? outputArtifacts : undefined,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      logger.error({ taskId: input.taskId, err: errorMsg }, 'Task execution failed');

      lifecycle.failTask(
        input.taskId,
        {
          code: 'CONNECTOR_ERROR',
          category: 'connector',
          message: errorMsg,
          severity: 'high',
          retryable: true,
        },
        CLAUDE_CONNECTOR_IDENTITY.id,
      );

      this.emit('audit', createAuditEvent({
        id: `evt_${randomUUID()}`,
        event_type: AuditEventTypeEnum.ConnectorError,
        actor: { kind: AuditActorKindEnum.System, id: 'claude-connector-runtime' },
        target: { kind: AuditTargetKindEnum.Connector, id: 'claude-code-mcp' },
        severity: AuditSeverityEnum.Error,
        trace_id: `trace_${randomUUID()}`,
        workspace_id: 'system',
        task_id: input.taskId,
        metadata: { message: errorMsg },
      }));

      this.emit('task:error', { taskId: input.taskId, error: errorMsg });

      return {
        taskId: input.taskId,
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Re-discover tools from the running MCP server.
   */
  async refreshTools(): Promise<ClaudeMCPTool[]> {
    if (!this.isRunning()) {
      throw new Error('Claude connector is not running');
    }
    await this.discoverTools();
    return [...this.tools];
  }

  /**
   * Register the Claude Code connector agent in the agent registry.
   */
  registerWithAgentRegistry(): void {
    const registry = getAgentRegistryService();

    // Check if already registered
    const existing = registry.get(CLAUDE_CONNECTOR_IDENTITY.id);
    if (existing) {
      logger.debug('Claude connector already registered in agent registry');
      registry.recordHeartbeat(CLAUDE_CONNECTOR_IDENTITY.id);
      return;
    }

    registry.selfRegister({
      agentId: CLAUDE_CONNECTOR_IDENTITY.id,
      name: CLAUDE_CONNECTOR_IDENTITY.name,
      platform: 'claude_code',
      description:
        'Claude Code MCP connector runtime -- spawns and manages Claude Code MCP server processes for tool execution',
      version: '1.0.0',
      tags: ['claude', 'mcp', 'connector', 'code', 'tier1'],
      skills: [
        {
          id: 'mcp-tool-exec',
          name: 'MCP Tool Execution',
          description: 'Execute Claude Code tool calls over MCP transport',
          tags: ['mcp', 'tools', 'execution'],
        },
        {
          id: 'code-generation',
          name: 'Code Generation',
          description: 'Generate, edit, and refactor code via Claude Code',
          tags: ['code', 'generation', 'refactoring'],
        },
        {
          id: 'code-review',
          name: 'Code Review',
          description: 'Review code, architecture, and provide feedback',
          tags: ['code', 'review', 'architecture'],
        },
        {
          id: 'file-operations',
          name: 'File Operations',
          description: 'Read, write, and edit files in the workspace',
          tags: ['file', 'read', 'write', 'edit'],
        },
        {
          id: 'bash-execution',
          name: 'Bash Execution',
          description: 'Execute shell commands in the workspace',
          tags: ['bash', 'shell', 'execution'],
        },
        {
          id: 'git-operations',
          name: 'Git Operations',
          description: 'Perform git operations (status, commit, diff, etc.)',
          tags: ['git', 'version-control'],
        },
      ],
    });

    logger.info('Claude connector registered in agent registry');
  }

  /**
   * Shutdown the runtime -- stops the process and cleans up.
   */
  async shutdown(): Promise<void> {
    await this.stop();
    this.removeAllListeners();
  }

  // -------------------------------------------------------------------------
  // Internal: Process management
  // -------------------------------------------------------------------------

  private spawnProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        ...this.config.env,
      };

      const spawnOptions: {
        env: typeof env;
        stdio: ['pipe', 'pipe', 'pipe'];
        shell: boolean;
        cwd?: string;
      } = {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      };

      if (this.config.cwd) {
        spawnOptions.cwd = this.config.cwd;
      }

      const proc = spawn(this.config.command, this.config.args, spawnOptions);
      this.process = proc;

      // Handle stdout (JSON-RPC responses)
      proc.stdout?.on('data', (data: Buffer) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      // Handle stderr (logging / errors)
      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString().trim();
        if (text) {
          this.stderrBuffer.push(text);
          // Keep stderr buffer bounded
          if (this.stderrBuffer.length > 100) {
            this.stderrBuffer.shift();
          }
          logger.debug({ stderr: text }, 'Claude MCP stderr');
          this.emit('stderr', text);
        }
      });

      // Handle process exit
      proc.on('exit', (code, signal) => {
        logger.info({ code, signal }, 'Claude MCP process exited');

        // Reject pending requests
        this.rejectAllPending(`Claude MCP process exited (code=${code}, signal=${signal})`);

        const wasRunning = this.status === 'running';
        this.process = null;

        if (this.status !== 'stopping' && this.status !== 'stopped') {
          this.status = 'error';
          this.lastError = `Process exited with code ${code} (signal: ${signal})`;
          this.emit('status', this.status);
          this.emit('process:exit', { code, signal });

          // Auto-restart if enabled and not exceeding max attempts
          if (
            wasRunning &&
            this.config.autoRestart &&
            this.restartCount < this.config.maxRestartAttempts
          ) {
            logger.info(
              { attempt: this.restartCount + 1, max: this.config.maxRestartAttempts },
              'Auto-restarting Claude MCP server',
            );
            setTimeout(() => {
              this.restart().catch((restartErr) => {
                logger.error(
                  { err: restartErr instanceof Error ? restartErr.message : String(restartErr) },
                  'Auto-restart failed',
                );
              });
            }, this.config.restartDelayMs);
          }
        }
      });

      // Handle spawn error
      proc.on('error', (err) => {
        logger.error({ err: err.message }, 'Claude MCP process error');
        this.lastError = err.message;
        this.status = 'error';
        this.emit('status', this.status);
        this.emit('error', err);
        reject(err);
      });

      // Wait a short time for the process to start (or fail immediately)
      const checkReady = () => {
        if (proc.pid && !proc.killed) {
          resolve();
        } else {
          reject(new Error('Claude MCP process failed to start'));
        }
      };

      // Give the process 500ms to settle
      setTimeout(checkReady, 500);
    });
  }

  private killProcess(): void {
    if (!this.process) return;

    try {
      this.process.kill('SIGTERM');
    } catch {
      // Ignore errors
    }

    // Force kill after 5 seconds
    const proc = this.process;
    setTimeout(() => {
      if (proc && !proc.killed) {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Ignore
        }
      }
    }, 5_000);

    this.process = null;
  }

  // -------------------------------------------------------------------------
  // Internal: MCP Protocol
  // -------------------------------------------------------------------------

  /**
   * Perform the MCP initialization handshake.
   *
   * 1. Send `initialize` with client info.
   * 2. Send `notifications/initialized` to signal readiness.
   */
  private async performHandshake(): Promise<void> {
    logger.debug('Performing MCP initialization handshake');

    const initResult = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      clientInfo: {
        name: 'recoder-docker-backend',
        version: '1.0.0',
      },
    });

    logger.debug({ result: initResult }, 'MCP initialize response');

    // Send initialized notification (no response expected)
    this.sendNotification('notifications/initialized', {});

    logger.debug('MCP handshake completed');
  }

  /**
   * Discover available tools via `tools/list`.
   */
  private async discoverTools(): Promise<void> {
    logger.debug('Discovering MCP tools');

    const result = await this.sendRequest('tools/list', {}) as {
      tools?: Array<{
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
      }>;
    };

    this.tools = (result.tools || []).map((tool) => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || {},
    }));

    logger.info(
      { toolCount: this.tools.length, tools: this.tools.map((t) => t.name) },
      'Discovered MCP tools',
    );

    this.emit('tools:discovered', this.tools);
  }

  /**
   * Send a JSON-RPC 2.0 request and wait for the response.
   */
  sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin || this.process.killed) {
        reject(new Error('Claude MCP process is not running'));
        return;
      }

      const id = String(++this.requestIdCounter);
      const request = {
        jsonrpc: '2.0' as const,
        id,
        method,
        params,
      };

      // Set up timeout
      const timer = setTimeout(() => {
        const pending = this.pendingRequests.get(id);
        if (pending) {
          this.pendingRequests.delete(id);
          pending.reject(
            new Error(`MCP request timeout after ${this.config.requestTimeoutMs}ms: ${method}`),
          );
        }
      }, this.config.requestTimeoutMs);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        method,
        createdAt: Date.now(),
        timer,
      });

      const message = JSON.stringify(request) + '\n';

      try {
        this.process.stdin.write(message, (err) => {
          if (err) {
            this.pendingRequests.delete(id);
            clearTimeout(timer);
            reject(new Error(`Failed to write to Claude MCP stdin: ${err.message}`));
          }
        });
      } catch (err) {
        this.pendingRequests.delete(id);
        clearTimeout(timer);
        reject(
          new Error(
            `Failed to write to Claude MCP stdin: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    });
  }

  /**
   * Send a JSON-RPC 2.0 notification (no response expected).
   */
  private sendNotification(method: string, params: unknown): void {
    if (!this.process?.stdin || this.process.killed) return;

    const notification = {
      jsonrpc: '2.0' as const,
      method,
      params,
    };

    const message = JSON.stringify(notification) + '\n';

    try {
      this.process.stdin.write(message);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), method },
        'Failed to send MCP notification',
      );
    }
  }

  // -------------------------------------------------------------------------
  // Internal: Buffer processing
  // -------------------------------------------------------------------------

  /**
   * Process the stdout buffer, extracting complete JSON-RPC messages
   * delimited by newlines.
   */
  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    // The last element might be an incomplete message
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const message = JSON.parse(trimmed) as {
          id?: string | number;
          result?: unknown;
          error?: { code?: number; message?: string; data?: unknown };
          method?: string;
          params?: unknown;
        };

        // Handle JSON-RPC response (has `id`)
        if (message.id !== undefined) {
          const id = String(message.id);
          const pending = this.pendingRequests.get(id);

          if (pending) {
            this.pendingRequests.delete(id);
            clearTimeout(pending.timer);

            if (message.error) {
              pending.reject(
                new Error(
                  message.error.message || `MCP error code ${message.error.code}`,
                ),
              );
            } else {
              pending.resolve(message.result);
            }
          } else {
            logger.warn({ id: message.id }, 'Received response for unknown request ID');
          }
        }

        // Handle JSON-RPC notification (has `method`, no `id`)
        if (message.method && message.id === undefined) {
          this.handleNotification(message.method, message.params);
        }
      } catch {
        // Non-JSON line -- might be log output from Claude, ignore
        logger.trace({ line: trimmed.slice(0, 200) }, 'Non-JSON line from Claude MCP stdout');
      }
    }
  }

  /**
   * Handle incoming MCP notifications from the server.
   */
  private handleNotification(method: string, params: unknown): void {
    logger.debug({ method }, 'Received MCP notification');

    this.emit('notification', { method, params });

    // Handle specific notification types
    if (method === 'notifications/progress') {
      this.emit('progress', params);
    } else if (method === 'notifications/message') {
      this.emit('message', params);
    }
  }

  // -------------------------------------------------------------------------
  // Internal: Task execution helpers
  // -------------------------------------------------------------------------

  /**
   * Select a default tool name based on the prompt content.
   * Falls back to the first available tool, or 'Task' if no tools are
   * discovered.
   */
  private selectDefaultTool(prompt: string): string {
    // Claude Code MCP typically exposes tools like:
    // - Task (general task execution)
    // - Read, Write, Edit, Bash, Glob, Grep, WebFetch, etc.
    //
    // For general prompts, prefer 'Task' if available.
    const taskTool = this.tools.find(
      (t) => t.name.toLowerCase() === 'task' || t.name.toLowerCase() === 'default',
    );

    if (taskTool) {
      return taskTool.name;
    }

    // If no 'Task' tool, return the first tool
    if (this.tools.length > 0) {
      return this.tools[0].name;
    }

    // Fallback
    return 'Task';
  }

  /**
   * Build tool arguments from the prompt and tool name.
   */
  private buildToolArgs(
    toolName: string,
    prompt: string,
  ): Record<string, unknown> {
    // The tool's input schema tells us what arguments it expects.
    // For the generic 'Task' tool, we pass { prompt }.
    // For specific tools, we pass accordingly.
    const tool = this.tools.find((t) => t.name === toolName);

    if (tool?.inputSchema) {
      const schema = tool.inputSchema as {
        properties?: Record<string, unknown>;
      };
      const props = schema.properties || {};

      // If the tool accepts a 'prompt' parameter, use it
      if ('prompt' in props) {
        return { prompt };
      }

      // If it accepts 'command' (like Bash tool), put prompt there
      if ('command' in props) {
        return { command: prompt };
      }

      // If it accepts 'content' or 'text'
      if ('content' in props) {
        return { content: prompt };
      }
      if ('text' in props) {
        return { text: prompt };
      }
    }

    // Default: wrap in prompt
    return { prompt };
  }

  /**
   * Extract artifacts from MCP tool call results.
   *
   * Claude Code MCP tool results may contain resource content (files, patches)
   * embedded in the content array. We extract these as TaskArtifact objects.
   */
  private extractArtifacts(
    mcpResult: { content?: Array<{ type: string; text?: string; uri?: string; mimeType?: string }> } | unknown,
  ): TaskArtifact[] {
    const result = mcpResult as { content?: unknown[] };
    if (!result.content || !Array.isArray(result.content)) {
      return [];
    }

    const artifacts: TaskArtifact[] = [];
    let idx = 0;

    for (const part of result.content) {
      const p = part as {
        type?: string;
        text?: string;
        uri?: string;
        mimeType?: string;
        blob?: string;
      };

      // MCP resource content (file references)
      if (p.type === 'resource' && p.uri) {
        artifacts.push({
          key: `artifact-${idx++}`,
          artifact_type: 'file',
          mime_type: p.mimeType || 'application/octet-stream',
          content: p.text || p.blob || '',
          path: p.uri,
        });
      }

      // Embedded text content that looks like a patch/diff
      if (p.type === 'text' && p.text && (
        p.text.startsWith('diff --git') ||
        p.text.startsWith('--- ') ||
        p.text.startsWith('@@')
      )) {
        artifacts.push({
          key: `patch-${idx++}`,
          artifact_type: 'patch',
          mime_type: 'text/x-diff',
          content: p.text,
        });
      }
    }

    return artifacts;
  }

  /**
   * Extract text from MCP tool call result.
   */
  private extractResultText(
    mcpResult: { content?: Array<{ type: string; text?: string }>; isError?: boolean } | unknown,
  ): string {
    const result = mcpResult as { content?: unknown[] };
    if (!result.content || !Array.isArray(result.content)) {
      return JSON.stringify(mcpResult);
    }

    return result.content
      .filter((part: unknown) => {
        const p = part as { type?: string };
        return p.type === 'text';
      })
      .map((part: unknown) => {
        const p = part as { text?: string };
        return p.text || '';
      })
      .join('\n');
  }

  // -------------------------------------------------------------------------
  // Internal: Cleanup
  // -------------------------------------------------------------------------

  /**
   * Reject all pending requests with the given reason.
   */
  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: ClaudeConnectorRuntime | null = null;

/** Get or create the singleton ClaudeConnectorRuntime. */
export function getClaudeConnectorRuntime(
  config?: Partial<ClaudeConnectorConfig>,
): ClaudeConnectorRuntime {
  if (!_instance) {
    _instance = new ClaudeConnectorRuntime(config);
  }
  return _instance;
}

/** Reset the singleton (for testing). */
export function resetClaudeConnectorRuntime(): void {
  if (_instance) {
    _instance.shutdown().catch(() => {});
  }
  _instance = null;
}

/** Get the connector agent identity. */
export function getClaudeConnectorIdentity(): RecoderAgentIdentity {
  return { ...CLAUDE_CONNECTOR_IDENTITY };
}
