"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeConnectorRuntime = void 0;
exports.getClaudeConnectorRuntime = getClaudeConnectorRuntime;
exports.resetClaudeConnectorRuntime = resetClaudeConnectorRuntime;
exports.getClaudeConnectorIdentity = getClaudeConnectorIdentity;
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const events_1 = require("events");
const a2a_1 = require("@recoder/shared/a2a");
const a2a_2 = require("@recoder/shared/a2a");
const task_lifecycle_service_1 = require("./task-lifecycle.service");
const agent_registry_service_1 = require("./agent-registry.service");
const a2a_event_bus_1 = require("./a2a-event-bus");
const task_stream_payload_1 = require("./task-stream-payload");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('claude-connector-runtime');
// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------
const DEFAULT_CONFIG = {
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
const CLAUDE_CONNECTOR_IDENTITY = {
    id: 'claude-code-connector',
    name: 'Claude Code MCP Connector',
    platform: 'claude_code',
};
// ---------------------------------------------------------------------------
// ClaudeConnectorRuntime
// ---------------------------------------------------------------------------
class ClaudeConnectorRuntime extends events_1.EventEmitter {
    config;
    process = null;
    status = 'stopped';
    tools = [];
    pendingRequests = new Map();
    requestIdCounter = 0;
    buffer = '';
    startedAt = null;
    lastActivity = null;
    restartCount = 0;
    lastError = null;
    stderrBuffer = [];
    activeTasks = new Set();
    taskContexts = new Map();
    constructor(config) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------
    /** Get the current state of the connector. */
    getState() {
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
    getTools() {
        return [...this.tools];
    }
    /** Check if the connector is running. */
    isRunning() {
        return this.status === 'running';
    }
    /**
     * Start the Claude Code MCP server process.
     * Performs MCP initialization handshake and tool discovery.
     */
    async start() {
        if (this.status === 'running' || this.status === 'starting') {
            logger.warn('Claude connector is already running or starting');
            return;
        }
        this.status = 'starting';
        this.lastError = null;
        this.emit('status', this.status);
        logger.info({ command: this.config.command, args: this.config.args }, 'Starting Claude Code MCP server');
        try {
            await this.spawnProcess();
            await this.performHandshake();
            await this.discoverTools();
            this.status = 'running';
            this.startedAt = new Date().toISOString();
            this.lastActivity = this.startedAt;
            this.emit('status', this.status);
            this.emit('audit', (0, a2a_2.createAuditEvent)({
                id: `evt_${(0, crypto_1.randomUUID)()}`,
                event_type: a2a_2.AuditEventTypeEnum.ConnectorAttached,
                actor: { kind: a2a_2.AuditActorKindEnum.System, id: 'claude-connector-runtime' },
                target: { kind: a2a_2.AuditTargetKindEnum.Connector, id: 'claude-code-mcp' },
                severity: a2a_2.AuditSeverityEnum.Info,
                trace_id: `trace_${(0, crypto_1.randomUUID)()}`,
                workspace_id: 'system',
                metadata: { message: 'Claude Code MCP connector started' },
            }));
            logger.info({ pid: this.process?.pid, toolCount: this.tools.length }, 'Claude Code MCP server started successfully');
        }
        catch (err) {
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
    async stop() {
        if (this.status === 'stopped' || this.status === 'stopping') {
            return;
        }
        this.status = 'stopping';
        this.emit('status', this.status);
        logger.info({ pid: this.process?.pid }, 'Stopping Claude Code MCP server');
        // Reject all pending requests
        this.rejectAllPending('Claude connector is stopping');
        this.killProcess();
        this.emit('audit', (0, a2a_2.createAuditEvent)({
            id: `evt_${(0, crypto_1.randomUUID)()}`,
            event_type: a2a_2.AuditEventTypeEnum.ConnectorDetached,
            actor: { kind: a2a_2.AuditActorKindEnum.System, id: 'claude-connector-runtime' },
            target: { kind: a2a_2.AuditTargetKindEnum.Connector, id: 'claude-code-mcp' },
            severity: a2a_2.AuditSeverityEnum.Info,
            trace_id: `trace_${(0, crypto_1.randomUUID)()}`,
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
    async restart() {
        logger.info('Restarting Claude Code MCP server');
        await this.stop();
        this.restartCount++;
        await this.start();
    }
    /**
     * Call an MCP tool directly by name.
     */
    async callTool(name, args = {}) {
        if (!this.isRunning()) {
            throw new Error('Claude connector is not running');
        }
        this.lastActivity = new Date().toISOString();
        const result = await this.sendRequest('tools/call', {
            name,
            arguments: args,
        });
        return result;
    }
    /**
     * Execute a task via the Claude Code MCP connector.
     *
     * Converts the prompt into a Claude wire format message, sends it as a
     * tools/call via MCP, collects the response, and converts back to an
     * envelope.
     */
    async executeTask(input) {
        if (!this.isRunning()) {
            return {
                taskId: input.taskId,
                success: false,
                error: 'Claude connector is not running',
            };
        }
        this.lastActivity = new Date().toISOString();
        this.activeTasks.add(input.taskId);
        this.taskContexts.set(input.taskId, {
            workspaceId: input.workspaceId,
            threadId: input.threadId,
        });
        const effectivePrompt = input.instructionBundle?.agent_specific_prompt || input.prompt;
        // Transition the task to 'working' via the lifecycle service
        const lifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        lifecycle.startTask(input.taskId, CLAUDE_CONNECTOR_IDENTITY.id);
        this.emit('task:start', { taskId: input.taskId });
        try {
            // Determine which tool to call
            const toolName = input.toolName || this.selectDefaultTool(effectivePrompt);
            let toolArgs = input.toolArgs || this.buildToolArgs(toolName, effectivePrompt);
            // Inject input artifacts into the prompt context if provided
            if (input.artifacts?.length) {
                const artifactContext = input.artifacts
                    .map((a) => `[Artifact: ${a.key} (${a.artifact_type})]:\n${a.content}`)
                    .join('\n\n');
                const augmentedPrompt = `${effectivePrompt}\n\n--- Attached Artifacts ---\n${artifactContext}`;
                toolArgs = { ...toolArgs };
                // Update the prompt-like field with artifact context
                if ('prompt' in toolArgs)
                    toolArgs.prompt = augmentedPrompt;
                else if ('content' in toolArgs)
                    toolArgs.content = augmentedPrompt;
                else if ('text' in toolArgs)
                    toolArgs.text = augmentedPrompt;
                else
                    toolArgs.prompt = augmentedPrompt;
            }
            logger.info({ taskId: input.taskId, tool: toolName }, 'Executing task via Claude MCP tool');
            // Send the MCP tools/call request
            const mcpResult = await this.sendRequest('tools/call', {
                name: toolName,
                arguments: toolArgs,
            });
            // Extract the result text from MCP response content
            const resultText = this.extractResultText(mcpResult);
            if (mcpResult.isError) {
                // Task failed
                lifecycle.failTask(input.taskId, {
                    code: 'CONNECTOR_ERROR',
                    category: 'connector',
                    message: resultText || 'MCP tool returned an error',
                    severity: 'high',
                    retryable: true,
                }, CLAUDE_CONNECTOR_IDENTITY.id);
                this.publishTaskStream(input.taskId, resultText, true);
                this.activeTasks.delete(input.taskId);
                this.taskContexts.delete(input.taskId);
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
            const responseEnvelope = (0, a2a_1.claudeCodeToEnvelope)({
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
            lifecycle.completeTask(input.taskId, {
                text: resultText,
                data: { raw: mcpResult },
                artifacts: outputArtifacts.length > 0 ? outputArtifacts : undefined,
            }, CLAUDE_CONNECTOR_IDENTITY.id);
            this.publishTaskStream(input.taskId, resultText, true);
            this.activeTasks.delete(input.taskId);
            this.taskContexts.delete(input.taskId);
            this.emit('task:complete', { taskId: input.taskId, resultText, artifacts: outputArtifacts });
            return {
                taskId: input.taskId,
                success: true,
                resultText,
                raw: mcpResult,
                envelope: responseEnvelope,
                artifacts: outputArtifacts.length > 0 ? outputArtifacts : undefined,
            };
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error({ taskId: input.taskId, err: errorMsg }, 'Task execution failed');
            lifecycle.failTask(input.taskId, {
                code: 'CONNECTOR_ERROR',
                category: 'connector',
                message: errorMsg,
                severity: 'high',
                retryable: true,
            }, CLAUDE_CONNECTOR_IDENTITY.id);
            this.publishTaskStream(input.taskId, errorMsg, true);
            this.activeTasks.delete(input.taskId);
            this.taskContexts.delete(input.taskId);
            this.emit('audit', (0, a2a_2.createAuditEvent)({
                id: `evt_${(0, crypto_1.randomUUID)()}`,
                event_type: a2a_2.AuditEventTypeEnum.ConnectorError,
                actor: { kind: a2a_2.AuditActorKindEnum.System, id: 'claude-connector-runtime' },
                target: { kind: a2a_2.AuditTargetKindEnum.Connector, id: 'claude-code-mcp' },
                severity: a2a_2.AuditSeverityEnum.Error,
                trace_id: `trace_${(0, crypto_1.randomUUID)()}`,
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
    async refreshTools() {
        if (!this.isRunning()) {
            throw new Error('Claude connector is not running');
        }
        await this.discoverTools();
        return [...this.tools];
    }
    /**
     * Register the Claude Code connector agent in the agent registry.
     */
    registerWithAgentRegistry() {
        const registry = (0, agent_registry_service_1.getAgentRegistryService)();
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
            description: 'Claude Code MCP connector runtime -- spawns and manages Claude Code MCP server processes for tool execution',
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
    async shutdown() {
        await this.stop();
        this.removeAllListeners();
    }
    // -------------------------------------------------------------------------
    // Internal: Process management
    // -------------------------------------------------------------------------
    spawnProcess() {
        return new Promise((resolve, reject) => {
            const env = {
                ...process.env,
                ...this.config.env,
            };
            const spawnOptions = {
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: false,
            };
            if (this.config.cwd) {
                spawnOptions.cwd = this.config.cwd;
            }
            const proc = (0, child_process_1.spawn)(this.config.command, this.config.args, spawnOptions);
            this.process = proc;
            // Handle stdout (JSON-RPC responses)
            proc.stdout?.on('data', (data) => {
                this.buffer += data.toString();
                this.processBuffer();
            });
            // Handle stderr (logging / errors)
            proc.stderr?.on('data', (data) => {
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
                    if (wasRunning &&
                        this.config.autoRestart &&
                        this.restartCount < this.config.maxRestartAttempts) {
                        logger.info({ attempt: this.restartCount + 1, max: this.config.maxRestartAttempts }, 'Auto-restarting Claude MCP server');
                        setTimeout(() => {
                            this.restart().catch((restartErr) => {
                                logger.error({ err: restartErr instanceof Error ? restartErr.message : String(restartErr) }, 'Auto-restart failed');
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
                }
                else {
                    reject(new Error('Claude MCP process failed to start'));
                }
            };
            // Give the process 500ms to settle
            setTimeout(checkReady, 500);
        });
    }
    killProcess() {
        if (!this.process)
            return;
        try {
            this.process.kill('SIGTERM');
        }
        catch {
            // Ignore errors
        }
        // Force kill after 5 seconds
        const proc = this.process;
        setTimeout(() => {
            if (proc && !proc.killed) {
                try {
                    proc.kill('SIGKILL');
                }
                catch {
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
    async performHandshake() {
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
    async discoverTools() {
        logger.debug('Discovering MCP tools');
        const result = await this.sendRequest('tools/list', {});
        this.tools = (result.tools || []).map((tool) => ({
            name: tool.name,
            description: tool.description || '',
            inputSchema: tool.inputSchema || {},
        }));
        logger.info({ toolCount: this.tools.length, tools: this.tools.map((t) => t.name) }, 'Discovered MCP tools');
        this.emit('tools:discovered', this.tools);
    }
    /**
     * Send a JSON-RPC 2.0 request and wait for the response.
     */
    sendRequest(method, params) {
        return new Promise((resolve, reject) => {
            if (!this.process?.stdin || this.process.killed) {
                reject(new Error('Claude MCP process is not running'));
                return;
            }
            const id = String(++this.requestIdCounter);
            const request = {
                jsonrpc: '2.0',
                id,
                method,
                params,
            };
            // Set up timeout
            const timer = setTimeout(() => {
                const pending = this.pendingRequests.get(id);
                if (pending) {
                    this.pendingRequests.delete(id);
                    pending.reject(new Error(`MCP request timeout after ${this.config.requestTimeoutMs}ms: ${method}`));
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
            }
            catch (err) {
                this.pendingRequests.delete(id);
                clearTimeout(timer);
                reject(new Error(`Failed to write to Claude MCP stdin: ${err instanceof Error ? err.message : String(err)}`));
            }
        });
    }
    /**
     * Send a JSON-RPC 2.0 notification (no response expected).
     */
    sendNotification(method, params) {
        if (!this.process?.stdin || this.process.killed)
            return;
        const notification = {
            jsonrpc: '2.0',
            method,
            params,
        };
        const message = JSON.stringify(notification) + '\n';
        try {
            this.process.stdin.write(message);
        }
        catch (err) {
            logger.warn({ err: err instanceof Error ? err.message : String(err), method }, 'Failed to send MCP notification');
        }
    }
    // -------------------------------------------------------------------------
    // Internal: Buffer processing
    // -------------------------------------------------------------------------
    /**
     * Process the stdout buffer, extracting complete JSON-RPC messages
     * delimited by newlines.
     */
    processBuffer() {
        const lines = this.buffer.split('\n');
        // The last element might be an incomplete message
        this.buffer = lines.pop() || '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            try {
                const message = JSON.parse(trimmed);
                // Handle JSON-RPC response (has `id`)
                if (message.id !== undefined) {
                    const id = String(message.id);
                    const pending = this.pendingRequests.get(id);
                    if (pending) {
                        this.pendingRequests.delete(id);
                        clearTimeout(pending.timer);
                        if (message.error) {
                            pending.reject(new Error(message.error.message || `MCP error code ${message.error.code}`));
                        }
                        else {
                            pending.resolve(message.result);
                        }
                    }
                    else {
                        logger.warn({ id: message.id }, 'Received response for unknown request ID');
                    }
                }
                // Handle JSON-RPC notification (has `method`, no `id`)
                if (message.method && message.id === undefined) {
                    this.handleNotification(message.method, message.params);
                }
            }
            catch {
                // Non-JSON line -- might be log output from Claude, ignore
                logger.trace({ line: trimmed.slice(0, 200) }, 'Non-JSON line from Claude MCP stdout');
            }
        }
    }
    /**
     * Handle incoming MCP notifications from the server.
     */
    handleNotification(method, params) {
        logger.debug({ method }, 'Received MCP notification');
        this.emit('notification', { method, params });
        // Handle specific notification types
        if (method === 'notifications/progress') {
            this.emit('progress', params);
            const taskId = this.resolveTaskId(params);
            if (taskId)
                this.publishTaskStream(taskId, (0, task_stream_payload_1.extractTaskStreamChunk)(params));
        }
        else if (method === 'notifications/message') {
            this.emit('message', params);
            const taskId = this.resolveTaskId(params);
            if (taskId)
                this.publishTaskStream(taskId, (0, task_stream_payload_1.extractTaskStreamChunk)(params));
        }
    }
    resolveTaskId(payload) {
        if (payload && typeof payload === 'object') {
            const record = payload;
            if (typeof record.taskId === 'string' && record.taskId.trim().length > 0)
                return record.taskId;
            if (typeof record.task_id === 'string' && record.task_id.trim().length > 0)
                return record.task_id;
            if (typeof record.threadId === 'string' && record.threadId.trim().length > 0)
                return record.threadId;
            if (typeof record.thread_id === 'string' && record.thread_id.trim().length > 0)
                return record.thread_id;
        }
        if (this.activeTasks.size === 1) {
            return Array.from(this.activeTasks)[0] ?? null;
        }
        return null;
    }
    publishTaskStream(taskId, chunk, done = false) {
        if (!taskId || (!chunk && !done))
            return;
        const context = this.taskContexts.get(taskId);
        (0, a2a_event_bus_1.getA2AEventBus)().publish({
            id: `evt_${(0, crypto_1.randomUUID)()}`,
            type: a2a_event_bus_1.A2AEventType.TaskStream,
            timestamp: new Date().toISOString(),
            taskId,
            workspaceId: context?.workspaceId,
            data: {
                agentId: CLAUDE_CONNECTOR_IDENTITY.id,
                chunk,
                done,
            },
        });
    }
    // -------------------------------------------------------------------------
    // Internal: Task execution helpers
    // -------------------------------------------------------------------------
    /**
     * Select a default tool name based on the prompt content.
     * Falls back to the first available tool, or 'Task' if no tools are
     * discovered.
     */
    selectDefaultTool(prompt) {
        // Claude Code MCP typically exposes tools like:
        // - Task (general task execution)
        // - Read, Write, Edit, Bash, Glob, Grep, WebFetch, etc.
        //
        // For general prompts, prefer 'Task' if available.
        const taskTool = this.tools.find((t) => t.name.toLowerCase() === 'task' || t.name.toLowerCase() === 'default');
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
    buildToolArgs(toolName, prompt) {
        // The tool's input schema tells us what arguments it expects.
        // For the generic 'Task' tool, we pass { prompt }.
        // For specific tools, we pass accordingly.
        const tool = this.tools.find((t) => t.name === toolName);
        if (tool?.inputSchema) {
            const schema = tool.inputSchema;
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
    extractArtifacts(mcpResult) {
        const result = mcpResult;
        if (!result.content || !Array.isArray(result.content)) {
            return [];
        }
        const artifacts = [];
        let idx = 0;
        for (const part of result.content) {
            const p = part;
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
            if (p.type === 'text' && p.text && (p.text.startsWith('diff --git') ||
                p.text.startsWith('--- ') ||
                p.text.startsWith('@@'))) {
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
    extractResultText(mcpResult) {
        const result = mcpResult;
        if (!result.content || !Array.isArray(result.content)) {
            return JSON.stringify(mcpResult);
        }
        return result.content
            .filter((part) => {
            const p = part;
            return p.type === 'text';
        })
            .map((part) => {
            const p = part;
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
    rejectAllPending(reason) {
        for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timer);
            pending.reject(new Error(reason));
        }
        this.pendingRequests.clear();
    }
}
exports.ClaudeConnectorRuntime = ClaudeConnectorRuntime;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let _instance = null;
/** Get or create the singleton ClaudeConnectorRuntime. */
function getClaudeConnectorRuntime(config) {
    if (!_instance) {
        _instance = new ClaudeConnectorRuntime(config);
    }
    return _instance;
}
/** Reset the singleton (for testing). */
function resetClaudeConnectorRuntime() {
    if (_instance) {
        _instance.shutdown().catch(() => { });
    }
    _instance = null;
}
/** Get the connector agent identity. */
function getClaudeConnectorIdentity() {
    return { ...CLAUDE_CONNECTOR_IDENTITY };
}
